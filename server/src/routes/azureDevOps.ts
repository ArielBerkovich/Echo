import { Router, Request, Response } from "express";
import { AzureDevOpsEvent } from "../models/AzureDevOpsEvent.js";
import { AzureDevOpsConfig } from "../models/AzureDevOpsConfig.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { verifyAdoToken, createAdoToken, hashAdoToken } from "../lib/adoWebhookVerifier.js";
import { resolveEchoUser, invalidateResolverCache } from "../lib/adoUserResolver.js";
import { resolveTeamChannel } from "../lib/adoTeamResolver.js";
import { bufferComment } from "../lib/adoCommentAggregator.js";
import {
  renderPRValidationFailed,
  renderPRCompleted,
  BuildResource,
  PullRequestResource,
  BuildFailureDetail,
} from "../lib/adoMessageRenderer.js";
import { ensureDmChannel } from "../lib/dms.js";
import { deliverMessage } from "../deliver.js";
import { CommentAggBuffer } from "../models/CommentAggBuffer.js";

export const azureDevOpsRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch failed-step detail from the ADO Build Timeline API.
 *
 * Requires AzureDevOpsConfig.adoPat to be set.  Returns null (silently) if
 * the PAT is absent, the API call fails, or no failed record is found.
 */
async function fetchBuildFailureDetail(
  orgUrl: string,
  project: string,
  buildId: number,
  pat: string
): Promise<BuildFailureDetail | null> {
  try {
    const url = `${orgUrl}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/timeline?api-version=7.1`;
    const auth = Buffer.from(`:${pat}`).toString("base64");
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { records?: Array<{ result?: string; name?: string; type?: string; log?: { url?: string } }> };
    const failed = (data.records ?? []).find(
      (r) => r.result === "failed" && r.type === "Task"
    );
    if (!failed) return null;
    return {
      failedJobName: failed.name,
      logUrl: failed.log?.url,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook receiver  POST /api/azure-devops/webhook/:token
// ---------------------------------------------------------------------------

/**
 * Public endpoint — no Bearer token required.
 * The opaque URL token in the path authenticates the request by hash-matching
 * against AzureDevOpsConfig.tokenHash.
 */
azureDevOpsRouter.post("/webhook/:token", async (req: Request, res: Response) => {
  const start = Date.now();

  // 1. Verify token
  const config = await verifyAdoToken(req.params.token);
  if (!config) {
    console.warn("[ado] webhook: invalid token");
    return res.status(403).json({ error: "forbidden" });
  }

  const body = req.body as Record<string, unknown>;

  // 2. Minimal payload validation
  const eventId = typeof body?.id === "string" ? body.id.trim() : null;
  const eventType = typeof body?.eventType === "string" ? body.eventType.trim() : null;
  if (!eventId || !eventType) {
    return res.status(400).json({ error: "missing id or eventType" });
  }

  // 3. Idempotency check — insert before processing; duplicate key → skip.
  let eventDoc: InstanceType<typeof AzureDevOpsEvent>;
  try {
    eventDoc = await AzureDevOpsEvent.create({ eventId, eventType, receivedAt: new Date() });
  } catch (err: unknown) {
    // MongoDB E11000: duplicate key on eventId → already processed.
    if ((err as { code?: number }).code === 11000) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    throw err; // Unexpected DB error — let the global handler return 500 so ADO retries.
  }

  // 4. Route to the appropriate handler.
  try {
    const resource = body.resource as Record<string, unknown>;
    let recipientCount = 0;

    if (
      eventType === "build.complete" &&
      resource?.result === "failed" &&
      resource?.reason === "pullRequest"
    ) {
      recipientCount = await handlePRValidationFailed(config, resource as unknown as BuildResource);
    } else if (eventType === "git.pullrequest.merged") {
      recipientCount = await handlePRCompleted(config, resource as unknown as PullRequestResource);
    } else if (eventType === "git.pullrequest.commented") {
      recipientCount = await handlePRComment(config, resource, eventId);
      // Comments are buffered; recipient count reflects buffering, not delivery.
    } else {
      eventDoc.status = "skipped";
      await eventDoc.save();
      console.info(`[ado] webhook: unhandled eventType=${eventType} eventId=${eventId}`);
      return res.status(200).json({ ok: true, status: "skipped" });
    }

    eventDoc.status = recipientCount > 0 ? "delivered" : "partial";
    eventDoc.recipientCount = recipientCount;
    await eventDoc.save();

    console.info(
      `[ado] ${JSON.stringify({ event: "ado.webhook.received", eventId, eventType, status: eventDoc.status, recipientCount, durationMs: Date.now() - start })}`
    );
    return res.status(200).json({ ok: true, status: eventDoc.status, recipientCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    eventDoc.status = "error";
    eventDoc.errorMessage = message.slice(0, 500);
    await eventDoc.save().catch(() => {}); // best-effort
    console.error("[ado] webhook: handler error:", message);
    throw err; // Return 500 → ADO retries.
  }
});

// ---------------------------------------------------------------------------
// Handler: PR Validation Pipeline Failed
// ---------------------------------------------------------------------------

async function handlePRValidationFailed(
  config: InstanceType<typeof AzureDevOpsConfig>,
  resource: BuildResource
): Promise<number> {
  const initiatorEmail = (resource.requestedBy as { uniqueName: string }).uniqueName;
  const authorEmail = (resource.requestedFor as { uniqueName: string }).uniqueName;

  const [initiatorUser, authorUser] = await Promise.all([
    resolveEchoUser(initiatorEmail),
    resolveEchoUser(authorEmail),
  ]);

  // Collect unique recipients (dedup when initiator === author).
  const recipients = new Map<string, InstanceType<typeof import("../models/User.js").User>>();
  if (authorUser) recipients.set(authorUser._id.toString(), authorUser);
  if (initiatorUser) recipients.set(initiatorUser._id.toString(), initiatorUser);

  if (recipients.size === 0) {
    console.warn("[ado] PR validation failed: no Echo users resolved", {
      initiatorEmail,
      authorEmail,
    });
    return 0;
  }

  // Optional: enrich with failed-job detail from ADO Timeline API.
  let detail: BuildFailureDetail | null = null;
  if (config.adoPat && config.organizationUrl && config.project) {
    detail = await fetchBuildFailureDetail(
      config.organizationUrl,
      config.project,
      resource.id,
      config.adoPat
    );
  }

  const body = renderPRValidationFailed(resource, detail);
  let delivered = 0;

  for (const [, user] of recipients) {
    const dmChannel = await ensureDmChannel(config.botUserId, user._id);
    await deliverMessage({
      channel: dmChannel,
      authorId: config.botUserId,
      body,
      parentId: null,
      attachments: [],
      idempotencyKey: `ado-build-failed-${resource.id}-${user._id}`,
    });
    delivered++;
  }

  return delivered;
}

// ---------------------------------------------------------------------------
// Handler: PR Completed
// ---------------------------------------------------------------------------

async function handlePRCompleted(
  config: InstanceType<typeof AzureDevOpsConfig>,
  resource: PullRequestResource
): Promise<number> {
  const body = renderPRCompleted(resource);
  let delivered = 0;

  // Try to resolve the author's team channel.
  // ADO does not include team name in PR webhooks directly, so we fall back to
  // the global prCompletedChannelId or convention-based channel lookup.
  const teamChannel = await resolveTeamChannel(undefined);

  if (teamChannel) {
    await deliverMessage({
      channel: teamChannel,
      authorId: config.botUserId,
      body,
      parentId: null,
      attachments: [],
      idempotencyKey: `ado-pr-merged-${resource.pullRequestId}`,
    });
    delivered++;
  } else {
    console.warn("[ado] PR completed: no team channel resolved for PR", resource.pullRequestId);
  }

  return delivered;
}

// ---------------------------------------------------------------------------
// Handler: PR Comment
// ---------------------------------------------------------------------------

async function handlePRComment(
  config: InstanceType<typeof AzureDevOpsConfig>,
  resource: Record<string, unknown>,
  eventId: string
): Promise<number> {
  const comment = resource?.comment as Record<string, unknown> | undefined;
  const pr = resource?.pullRequest as Record<string, unknown> | undefined;

  if (!comment || !pr) return 0;

  // Skip system-generated comments (e.g. "Alice approved this PR").
  if (comment.commentType === "system") return 0;

  const authorEmail = (pr.createdBy as { uniqueName?: string } | undefined)?.uniqueName ?? "";
  const echoAuthor = await resolveEchoUser(authorEmail);
  if (!echoAuthor) {
    console.warn("[ado] PR comment: PR author not found in Echo", authorEmail);
    return 0;
  }

  const commenter = comment.author as { displayName?: string; uniqueName?: string } | undefined;

  await bufferComment({
    commentId: Number(comment.id) || 0,
    content: String(comment.content ?? "").trim().slice(0, 2000),
    authorDisplayName: commenter?.displayName ?? "Unknown",
    authorEmail: commenter?.uniqueName ?? "",
    eventId,
    prId: String(pr.pullRequestId ?? "?"),
    repoName:
      (pr.repository as { name?: string } | undefined)?.name ?? "unknown-repo",
    prTitle: String(pr.title ?? ""),
    prUrl: String(pr.url ?? ""),
    echoAuthorUserId: echoAuthor._id.toString(),
  });

  // Buffering succeeded; actual delivery happens via the flush worker.
  return 1;
}

// ---------------------------------------------------------------------------
// Admin API  (requires authentication + admin role)
// ---------------------------------------------------------------------------

azureDevOpsRouter.use("/admin", requireAuth, requireAdmin);

/**
 * GET /api/azure-devops/admin/status
 * Returns integration health and recent event stats.
 */
azureDevOpsRouter.get("/admin/status", async (_req: Request, res: Response) => {
  const [config, pendingBuffers, recentEvents] = await Promise.all([
    AzureDevOpsConfig.findOne().lean(),
    CommentAggBuffer.countDocuments({ flushed: false }),
    AzureDevOpsEvent.find().sort({ receivedAt: -1 }).limit(20).lean(),
  ]);

  res.json({
    configured: !!config,
    userMappingCount: config?.userMapping?.length ?? 0,
    teamChannelMappingCount: config?.teamChannelMapping?.length ?? 0,
    commentAggregationWindowSeconds: config?.commentAggregationWindowSeconds ?? 120,
    pendingCommentBuffers: pendingBuffers,
    recentEvents: recentEvents.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      status: e.status,
      recipientCount: e.recipientCount,
      errorMessage: e.errorMessage ?? null,
      receivedAt: e.receivedAt,
    })),
  });
});

/**
 * PUT /api/azure-devops/admin/config
 * Update workspace-level configuration fields.
 * Regenerates the webhook token if `regenerateToken: true` is passed.
 */
azureDevOpsRouter.put("/admin/config", async (req: Request, res: Response) => {
  let config = await AzureDevOpsConfig.findOne();
  if (!config) {
    return res.status(404).json({ error: "Azure DevOps integration not initialised" });
  }

  const {
    organizationUrl,
    project,
    commentAggregationWindowSeconds,
    prCompletedChannelId,
    adoPat,
    regenerateToken,
    userMapping,
    teamChannelMapping,
  } = req.body as Record<string, unknown>;

  if (organizationUrl !== undefined) config.organizationUrl = String(organizationUrl).trim();
  if (project !== undefined) config.project = String(project).trim();
  if (commentAggregationWindowSeconds !== undefined) {
    config.commentAggregationWindowSeconds = Number(commentAggregationWindowSeconds);
  }
  if (prCompletedChannelId !== undefined) {
    config.prCompletedChannelId = prCompletedChannelId as typeof config.prCompletedChannelId;
  }
  if (adoPat !== undefined) config.adoPat = adoPat ? String(adoPat).trim() : null;
  if (Array.isArray(userMapping)) config.userMapping = userMapping as typeof config.userMapping;
  if (Array.isArray(teamChannelMapping)) config.teamChannelMapping = teamChannelMapping as typeof config.teamChannelMapping;

  let newToken: string | undefined;
  if (regenerateToken === true) {
    newToken = createAdoToken();
    config.tokenHash = hashAdoToken(newToken);
  }

  await config.save();
  invalidateResolverCache(); // Clear user-mapping cache after update.

  const response: Record<string, unknown> = { ok: true };
  if (newToken) {
    response.webhookToken = newToken;
    response.note = "Save this token — it will not be shown again.";
  }
  return res.json(response);
});
