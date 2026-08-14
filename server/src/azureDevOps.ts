import crypto from "crypto";
import { AzureDevOpsEvent } from "./models/AzureDevOpsEvent.js";
import { AzureDevOpsIntegration } from "./models/AzureDevOpsIntegration.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import { ensureDmChannel } from "./lib/dms.js";
import { deliverMessage } from "./deliver.js";
import { emitToChannel } from "./realtime.js";

const AZURE_USERNAME = "azure-bot";
const AZURE_LEGACY_USERNAME = "azure";
const AZURE_DISPLAY_NAME = "azure bot";

export function rootReaction(kind) {
  if (kind === "pullRequestAbandoned" || kind === "pullRequestRejected") return ":git-pull-request-closed:";
  if (kind === "pullRequestCompleted") return ":merged:";
  if (kind === "pullRequestApproved") return "👍";
  if (kind === "pullRequestCommented") return "📝";
  if (kind === "buildValidationSucceeded") return "✅";
  if (kind === "buildValidationFailed") return "❌";
  return null;
}

function rootReactionGroup(kind) {
  if (["pullRequestApproved", "pullRequestApprovalReset", "pullRequestRejected", "pullRequestAbandoned", "pullRequestReactivated", "pullRequestCompleted"].includes(kind)) {
    return ["👍", ":git-pull-request:", ":git-pull-request-closed:", ":merged:"];
  }
  if (["buildValidationSucceeded", "buildValidationFailed"].includes(kind)) return ["✅", "❌"];
  if (kind === "pullRequestCommented") return ["📝"];
  if (kind === "pullRequestCreated") return ["👍", ":git-pull-request:", ":git-pull-request-closed:", ":merged:"];
  return null;
}

async function syncRootReaction(messageId, azureUserId, kind) {
  const desired = rootReaction(kind);
  const group = rootReactionGroup(kind);
  if (!group) return null;
  const reactionMap = {
    $map: {
      input: { $ifNull: ["$reactions", []] },
      as: "reaction",
      in: {
        $cond: [
          { $in: ["$$reaction.emoji", group] },
          {
            $mergeObjects: [
              "$$reaction",
              { users: { $filter: { input: "$$reaction.users", as: "user", cond: { $ne: ["$$user", azureUserId] } } } },
            ],
          },
          "$$reaction",
        ],
      },
    },
  };
  const pipeline = [
    { $set: { reactions: reactionMap } },
    { $set: { reactions: { $filter: { input: "$reactions", as: "reaction", cond: { $gt: [{ $size: "$$reaction.users" }, 0] } } } } },
  ];
  if (desired) {
    pipeline.push({
      $set: {
        reactions: {
          $let: {
            vars: { matches: { $filter: { input: "$reactions", as: "reaction", cond: { $eq: ["$$reaction.emoji", desired] } } } },
            in: {
              $cond: [
                { $gt: [{ $size: "$$matches" }, 0] },
                { $map: { input: "$reactions", as: "reaction", in: { $cond: [{ $eq: ["$$reaction.emoji", desired] }, { $mergeObjects: ["$$reaction", { users: { $setUnion: ["$$reaction.users", [azureUserId]] } }] }, "$$reaction"] } } },
                { $concatArrays: ["$reactions", [{ emoji: desired, users: [azureUserId] }]] },
              ],
            },
          },
        },
      },
    });
  }
  const message = await Message.findOneAndUpdate({ _id: messageId }, pipeline, { new: true });
  if (!message) return null;
  emitToChannel(message.channel.toString(), "message:reaction", {
    messageId: message._id.toString(),
    reactions: message.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users.map((userId) => userId.toString()),
    })),
  });
  return message;
}

export function createAzureDevOpsToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAzureDevOpsToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function tokenKey() {
  return crypto.createHash("sha256").update(String(process.env.JWT_SECRET || "")).digest();
}

export function encryptAzureDevOpsToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAzureDevOpsToken(value) {
  const [ivText, tagText, ciphertextText] = String(value || "").split(".");
  if (!ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function ensureAzureUser() {
  let user = await User.findOne({ username: AZURE_USERNAME });
  if (!user) user = await User.findOne({ username: AZURE_LEGACY_USERNAME });
  if (!user) {
    user = await User.create({
      username: AZURE_USERNAME,
      displayName: AZURE_DISPLAY_NAME,
      passwordHash: "x",
      avatarUrlOverride: "/azure-devops-icon.svg",
    });
  } else if (user.username !== AZURE_USERNAME || user.displayName !== AZURE_DISPLAY_NAME || user.avatarUrlOverride !== "/azure-devops-icon.svg") {
    user.username = AZURE_USERNAME;
    user.displayName = AZURE_DISPLAY_NAME;
    user.avatarUrlOverride = "/azure-devops-icon.svg";
    await user.save();
  }
  return user;
}

function clean(value, max = 300) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : "";
}

function eventType(payload) {
  return clean(payload?.eventType || payload?.event?.type, 100).toLowerCase();
}

function eventMessage(payload) {
  return clean(payload?.message?.text || payload?.detailedMessage?.text, 500).toLowerCase();
}

function resource(payload) {
  return payload?.resource || {};
}

function identityFor(value) {
  return value?.pullRequest?.createdBy || value?.pullRequest?.pullRequest?.createdBy || value?.createdBy || value?.requestedFor || value?.requestedBy || null;
}

function usernameCandidates(identity) {
  const uniqueName = clean(identity?.uniqueName, 160).toLowerCase();
  const displayName = clean(identity?.displayName, 160).toLowerCase();
  const localPart = uniqueName.includes("@") ? uniqueName.split("@")[0] : uniqueName;
  return [...new Set([uniqueName, localPart, displayName].filter(Boolean))]
    .map((value) => value.replace(/^@+/, "").replace(/[^a-z0-9_.-]/g, ""))
    .filter((value) => value.length >= 2);
}

async function resolveRecipient(identity) {
  if (!identity) return null;
  const candidates = usernameCandidates(identity);
  if (!candidates.length) return null;
  return User.findOne({
    $and: [
      { username: { $in: candidates } },
      { username: { $ne: "system" } },
    ],
  });
}

async function resolveEventRecipient(integration, payload, value, prNumber) {
  const directIdentity = eventType(payload) === "build.complete" ? null : identityFor(value);
  let recipient = await resolveRecipient(directIdentity);
  if (!recipient && prNumber) {
    const previous = await AzureDevOpsEvent.findOne({
      integration: integration._id,
      pullRequestNumber: prNumber,
      recipient: { $ne: null },
    }).sort({ createdAt: -1 });
    recipient = previous?.recipient ? await User.findById(previous.recipient) : null;
  }
  if (!recipient && eventType(payload) === "build.complete") {
    recipient = await resolveRecipient(identityFor(value));
  }
  return recipient;
}

function repositoryName(value) {
  const repository = value?.repository || value?.pullRequest?.repository || value?.pullRequest?.pullRequest?.repository;
  return clean(repository?.name || repository?.project?.name, 160) || "repository";
}

function pullRequestNumber(value) {
  return value?.pullRequestId ?? value?.pullrequestId ?? value?.pullRequest?.pullRequestId ?? value?.pullRequest?.pullrequestId ?? value?.pullRequest?.id ?? value?.pullRequest?.pullRequest?.pullRequestId ?? buildPullRequestNumber(value);
}

function pullRequestNumberFromPayload(payload) {
  const text = [payload?.message?.text, payload?.message?.markdown, payload?.detailedMessage?.text, payload?.detailedMessage?.markdown]
    .filter(Boolean)
    .join(" ");
  const match = text.match(/pullrequest\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function buildPullRequestNumber(value) {
  const match = String(value?.sourceBranch || "").match(/^refs\/pull\/(\d+)\//i);
  return match ? Number(match[1]) : null;
}

function webLink(value) {
  return clean(
    value?._links?.web?.href ||
      value?.pullRequest?._links?.web?.href ||
      value?.pullRequest?.pullRequest?._links?.web?.href ||
      value?._links?.pullRequests?.href ||
      value?.url ||
      value?.remoteUrl,
    1000
  );
}

function title(value) {
  return clean(value?.title || value?.pullRequest?.title || value?.pullRequest?.pullRequest?.title || value?.definition?.name || value?.buildNumber, 200) || "Untitled";
}

function buildResult(value) {
  return clean(value?.result || value?.status, 40).toLowerCase().replace(/[^a-z]/g, "");
}

function reviewers(value) {
  return value?.reviewers || value?.pullRequest?.reviewers || value?.pullRequest?.pullRequest?.reviewers;
}

function approvedBy(value) {
  const reviewer = reviewers(value)?.find((item) => Number(item?.vote) >= 10);
  return clean(reviewer?.displayName || reviewer?.identity?.displayName || reviewer?.uniqueName, 160);
}

function isTitleChange(payload) {
  if (eventType(payload) !== "git.pullrequest.updated") return false;
  const text = eventMessage(payload);
  if (/approved|rejected|voted|reviewer|approval/.test(text)) return false;
  const value = resource(payload);
  return /title\s+changed|changed.*title|renamed\s+pull\s+request|updated\s+pull\s+request/.test(text) || /title\s+changed/i.test(String(value?.changeType || value?.notificationType || ""));
}

function hasReviewerAction(payload) {
  return /approved|rejected|voted|reviewer|approval/.test(eventMessage(payload));
}

function approvalStatus(payload) {
  const type = eventType(payload);
  const value = resource(payload);
  const list = reviewers(value);
  if (type !== "git.pullrequest.updated" || !Array.isArray(list)) return null;
  if (list.some((reviewer) => Number(reviewer?.vote) <= -10)) return "rejected";
  if (list.some((reviewer) => Number(reviewer?.vote) >= 10)) return "approved";
  return "reset";
}

export function notificationKind(payload) {
  const type = eventType(payload);
  const value = resource(payload);
  if (type === "git.pullrequest.created") return "pullRequestCreated";
  if (type === "git.pullrequest.updated" || type === "git.pullrequest.merged") {
    const status = String(value.status || "").toLowerCase();
    if (status === "completed") return "pullRequestCompleted";
    if (status === "abandoned") return "pullRequestAbandoned";
    if (type === "git.pullrequest.updated") {
      if (isTitleChange(payload)) return "pullRequestTitleChanged";
      const status = (!eventMessage(payload) || hasReviewerAction(payload)) ? approvalStatus({ eventType: type, resource: value }) : null;
      if (status === "approved") return "pullRequestApproved";
      if (status === "rejected") return "pullRequestRejected";
      if (status === "reset") return "pullRequestApprovalReset";
    }
  }
  if (type === "git.pullrequest.commented" || type === "ms.vss-code.git-pullrequest-comment-event") return "pullRequestCommented";
  if (type === "build.complete") {
    const result = buildResult(value);
    if (["failed", "failure", "partiallysucceeded", "stopped", "canceled", "cancelled"].includes(result)) {
      return "buildValidationFailed";
    }
    if (["succeeded", "success", "passed"].includes(result)) return "buildValidationSucceeded";
  }
  return null;
}

export function eventKey(payload, kind, prNumber = null) {
  const value = resource(payload);
  const commentId = value?.comment?.id || value?.comment?.commentId || "";
  const commentText = value?.comment?.content || value?.comment?.text || value?.content || "";
  const buildId = value?.id || value?.buildId || value?.buildNumber || "";
  if (prNumber && kind === "pullRequestTitleChanged") return `semantic:${kind}:${prNumber}:${title(value)}`;
  if (prNumber && ["pullRequestCreated", "pullRequestApproved", "pullRequestApprovalReset", "pullRequestRejected", "pullRequestAbandoned", "pullRequestReactivated", "pullRequestCompleted"].includes(kind)) {
    return `semantic:${kind}:${prNumber}`;
  }
  if (prNumber && ["buildValidationSucceeded", "buildValidationFailed"].includes(kind)) {
    return `semantic:${kind}:${prNumber}:${buildId || buildResult(value)}`;
  }
  return clean(
    payload?.id ||
      payload?.notificationId ||
      eventType(payload) + ":" + String(kind || "") + ":" + String(pullRequestNumber(value) || "") + ":" + String(value?.buildNumber || "") + ":" + String(commentId || commentText),
    300
  );
}

export function messageBody(kind, value) {
  const repo = repositoryName(value);
  const number = pullRequestNumber(value);
  const label = title(value);
  const link = webLink(value);
  const suffix = link ? "\n[Open in Azure DevOps](" + link + ")" : "";
  const comment = clean(value?.comment?.content || value?.comment?.text || value?.content, 2000);
  if (kind === "pullRequestCreated") return ":git-pull-request: Pull request created\nRepository: **" + repo + "**" + (number ? " · PR #" + number : "") + "\nTitle: **" + label + "**" + suffix;
  if (kind === "pullRequestApproved") return "👍 Pull request approved in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + (approvedBy(value) ? "\nApproved by: **" + approvedBy(value) + "**" : "") + suffix;
  if (kind === "pullRequestApprovalReset") return "🔄 Approval reset";
  if (kind === "pullRequestTitleChanged") return "✏️ Pull request title changed\nNew title: **" + label + "**" + suffix;
  if (kind === "pullRequestRejected") return ":git-pull-request-closed: Pull request rejected in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestCommented") return "📝 New pull request comment in **" + repo + "**" + (number ? " (#" + number + ")" : "") + (comment ? "\n\n> " + comment.replace(/\n/g, "\n> ") : "") + suffix;
  if (kind === "pullRequestCompleted") return ":merged: Pull request merged in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestAbandoned") return ":git-pull-request-closed: Pull request abandoned in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestReactivated") return ":git-pull-request: Pull request recreated in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "buildValidationFailed") return "❌ Build validation failed for **" + repo + "**" + (number ? " PR #" + number : "") + ": **" + label + "**" + suffix;
  return "✅ Build validation succeeded for **" + repo + "**" + (number ? " PR #" + number : "") + ": **" + label + "**" + suffix;
}

const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const RETRY_WINDOW_MS = 60 * 1000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

function pendingRetryAt(createdAt, attempts) {
  const age = Date.now() - new Date(createdAt || Date.now()).getTime();
  if (age >= RETRY_WINDOW_MS) return null;
  const index = Math.min(Math.max(Number(attempts || 1) - 1, 0), RETRY_DELAYS_MS.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_MS[index]);
}

async function deferAzureEvent(event, payload, reason) {
  const retryAt = pendingRetryAt(event.createdAt, event.attempts);
  await AzureDevOpsEvent.updateOne(
    { _id: event._id },
    { $set: { status: retryAt ? "pending" : "unmatched", payload: retryAt ? payload : null, nextRetryAt: retryAt, lastError: reason, processedAt: new Date() } }
  );
  return retryAt ? { pending: true, retryAt } : { ignored: true, reason };
}

export async function retryPendingAzureDevOpsEvents() {
  const pending = await AzureDevOpsEvent.find({ status: "pending", nextRetryAt: { $lte: new Date() }, payload: { $ne: null } }).limit(50);
  for (const event of pending) {
    const integration = await AzureDevOpsIntegration.findById(event.integration);
    if (!integration?.active) continue;
    try {
      await processAzureDevOpsEvent(integration, event.payload);
    } catch (error) {
      console.error("Azure pending event retry failed:", error?.message || error);
    }
  }
}

export async function processAzureDevOpsEvent(integration, payload) {
  let kind = notificationKind(payload);
  const value = resource(payload);
  const prNumber = pullRequestNumber(value) || buildPullRequestNumber(value) || pullRequestNumberFromPayload(payload);
  const currentApprovalStatus = approvalStatus(payload);
  const isActiveReactivation = prNumber && eventType(payload) === "git.pullrequest.updated" && String(value.status || "").toLowerCase() === "active" && /reactivat|reopen/.test(eventMessage(payload));
  if (isActiveReactivation) {
    kind = "pullRequestReactivated";
  }
  if (!kind && prNumber && eventType(payload) === "git.pullrequest.updated" && String(value.status || "").toLowerCase() === "active") {
    const abandoned = await AzureDevOpsEvent.exists({
      integration: integration._id,
      pullRequestNumber: prNumber,
      notificationKind: "pullRequestAbandoned",
    });
    if (abandoned) kind = "pullRequestReactivated";
  }
  if (!kind) return { ignored: true, reason: "unsupported event" };

  // Events for Azure identities that do not exist in Echo are filtered before
  // they are persisted or scheduled for retry. Existing PR recipient mappings
  // still allow subsequent events for that PR to be delivered.
  const recipient = await resolveEventRecipient(integration, payload, value, prNumber);
  if (!recipient) return { ignored: true, reason: "PR opener could not be matched" };

  const key = eventKey(payload, kind, prNumber);
  if (!key) return { ignored: true, reason: "missing event id" };
  let event;
  try {
    event = await AzureDevOpsEvent.create({
      integration: integration._id,
      eventKey: key,
      eventType: eventType(payload),
      notificationKind: kind,
      payload,
      approvalState: currentApprovalStatus === null ? null : currentApprovalStatus === "approved",
      approvalStatus: currentApprovalStatus,
    });
  } catch (error) {
    if (error?.code === 11000) {
      event = await AzureDevOpsEvent.findOne({ integration: integration._id, eventKey: key });
      if (!event) return { duplicate: true };
      const status = event.status || "delivered"; // Legacy records predate event states.
      const updatedAt = new Date(event.updatedAt || event.createdAt).getTime();
      const stale = Date.now() - updatedAt >= PROCESSING_LEASE_MS;
      if (!["failed", "unmatched", "pending"].includes(status) && !(status === "processing" && stale)) {
        return { duplicate: true };
      }
      const claimed = await AzureDevOpsEvent.updateOne(
        { _id: event._id, status: { $in: ["failed", "unmatched", "pending", "processing"] }, ...(status === "processing" ? { updatedAt: { $lt: new Date(Date.now() - PROCESSING_LEASE_MS) } } : {}) },
        { $set: { status: "processing", lastError: null }, $inc: { attempts: 1 } }
      );
      if (!claimed.modifiedCount) return { duplicate: true };
      event = await AzureDevOpsEvent.findById(event._id);
    }
    else throw error;
  }

  if (!event) {
    throw new Error("Azure event could not be claimed");
  }

  try {
    await AzureDevOpsIntegration.updateOne(
      { _id: integration._id },
      { $set: { lastReceivedAt: new Date() } }
    );
  } catch (error) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "failed", lastError: String(error?.message || error).slice(0, 500) } });
    throw error;
  }

  await AzureDevOpsEvent.updateOne(
    { _id: event._id },
    { $set: { pullRequestNumber: prNumber, recipient: recipient._id } }
  );
  if (integration.notify?.[kind] === false) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored" } });
    return { ignored: true, reason: "notification disabled" };
  }

  const azure = await ensureAzureUser();
  if (!azure) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "failed", lastError: "Azure user unavailable" } });
    throw new Error("Azure user unavailable");
  }
  try {
    const channel = await ensureDmChannel(azure._id, recipient._id);
    let root = prNumber
      ? await AzureDevOpsEvent.findOne({
          integration: integration._id,
          pullRequestNumber: prNumber,
          notificationKind: "pullRequestCreated",
          messageId: { $ne: null },
        }).sort({ createdAt: 1 })
      : null;
    if (kind === "pullRequestCreated" && root?.messageId) {
      const existingMessage = await Message.findById(root.messageId);
      await AzureDevOpsEvent.updateOne(
        { _id: event._id },
        { $set: { status: "delivered", messageId: root.messageId, processedAt: new Date(), lastError: null } }
      );
      return { duplicate: true, message: existingMessage };
    }
    if (kind === "pullRequestCommented" && prNumber && !root?.messageId) {
      const commentPullRequest = value?.pullRequest?.pullRequest || value?.pullRequest;
      if (commentPullRequest) {
        const rootBody = messageBody("pullRequestCreated", commentPullRequest);
        const rootPayload = { ...payload, eventType: "git.pullrequest.created", resource: commentPullRequest };
        const rootKey = eventKey(rootPayload, "pullRequestCreated", prNumber);
        const existingRootEvent = await AzureDevOpsEvent.findOne({ integration: integration._id, eventKey: rootKey });
        if (existingRootEvent?.messageId) {
          root = existingRootEvent;
        } else if (existingRootEvent?.status === "processing") {
          return deferAzureEvent(event, payload, "PR root message is being created");
        } else {
          let reservedRootEvent;
          try {
            reservedRootEvent = await AzureDevOpsEvent.findOneAndUpdate(
              { integration: integration._id, eventKey: rootKey, status: { $ne: "processing" } },
              {
                $set: {
                  eventType: "git.pullrequest.created",
                  notificationKind: "pullRequestCreated",
                  payload: rootPayload,
                  status: "processing",
                  attempts: 1,
                  pullRequestNumber: prNumber,
                  recipient: recipient._id,
                  lastError: null,
                },
                $setOnInsert: { integration: integration._id, eventKey: rootKey },
              },
              { upsert: true, new: true }
            );
          } catch (error) {
            if (error?.code === 11000) return deferAzureEvent(event, payload, "PR root message is being created");
            throw error;
          }
          if (reservedRootEvent?.messageId) {
            root = reservedRootEvent;
          } else {
            const rootMessage = await deliverMessage({
              channel,
              authorId: azure._id,
              body: rootBody,
              parentId: null,
            });
            root = await AzureDevOpsEvent.findOneAndUpdate(
              { _id: reservedRootEvent._id },
              { $set: { status: "delivered", messageId: rootMessage.id, processedAt: new Date(), lastError: null } },
              { new: true }
            );
          }
        }
      }
    }
    if (kind !== "pullRequestCreated" && !root?.messageId) {
      await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { pullRequestNumber: prNumber, recipient: recipient._id } });
      return deferAzureEvent(event, payload, "PR root message not found");
    }
    const message = await deliverMessage({
      channel,
      authorId: azure._id,
      body: messageBody(kind, value),
      parentId: kind === "pullRequestCreated" ? null : root.messageId,
    });
    await syncRootReaction(kind === "pullRequestCreated" ? message.id : root.messageId, azure._id, kind);
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "delivered", messageId: message.id, processedAt: new Date(), lastError: null } });
    await AzureDevOpsIntegration.updateOne(
      { _id: integration._id },
      { $set: { lastReceivedAt: new Date(), lastError: null } }
    );
    return { notified: true, recipient: recipient.toPublicJSON(), message };
  } catch (error) {
    await AzureDevOpsEvent.updateOne(
      { _id: event._id },
      { $set: { status: "failed", lastError: String(error?.message || error).slice(0, 500) } }
    ).catch(() => {});
    throw error;
  }
}

export async function findAzureDevOpsIntegration(token) {
  return AzureDevOpsIntegration.findOne({ tokenHash: hashAzureDevOpsToken(token), active: true });
}

export function integrationEndpointPath(token) {
  return "/api/integrations/azure-devops/" + token;
}
