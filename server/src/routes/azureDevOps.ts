import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AzureDevOpsIntegration } from "../models/AzureDevOpsIntegration.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  createAzureDevOpsToken,
  encryptAzureDevOpsToken,
  findAzureDevOpsIntegration,
  hashAzureDevOpsToken,
  integrationEndpointPath,
  processAzureDevOpsEvent,
  decryptAzureDevOpsToken,
} from "../azureDevOps.js";
import { Channel } from "../models/Channel.js";
import { getWorkItemSettings, normalizeWorkItemUrlPrefix, resolveWorkItemTitles, saveWorkItemToken, workItemSettingsJSON } from "../azureWorkItems.js";

export const azureDevOpsWebhookRouter = Router();

// Azure DevOps calls this endpoint without an Echo login.
azureDevOpsWebhookRouter.post("/:token", async (req, res) => {
  const integration = await findAzureDevOpsIntegration(req.params.token);
  if (!integration) return res.status(404).json({ error: "integration not found" });
  try {
    const result = await processAzureDevOpsEvent(integration, req.body || {});
    res.status(result.duplicate ? 200 : 202).json(result);
  } catch (error) {
    await AzureDevOpsIntegration.updateOne(
      { _id: integration._id },
      { $set: { lastError: String(error?.message || "event processing failed").slice(0, 500) } }
    );
    throw error;
  }
});

export const azureDevOpsRouter = Router();
azureDevOpsRouter.use(azureDevOpsWebhookRouter);

const workItemResolveLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
azureDevOpsRouter.get("/work-items/resolve", requireAuth, workItemResolveLimiter, async (req, res) => {
  const ids = String(req.query.ids || "").split(",").slice(0, 25);
  res.json(await resolveWorkItemTitles(ids, { refresh: true }));
});

azureDevOpsRouter.use(requireAuth, requireAdmin);

azureDevOpsRouter.get("/work-items", async (_req, res) => {
  const settings = await getWorkItemSettings();
  const value = workItemSettingsJSON(settings);
  const channel = value.notifyChannel ? await Channel.findById(value.notifyChannel).select({ name: 1, isArchived: 1 }).lean() : null;
  res.json({ integration: { ...value, notifyChannelName: channel?.name || null, notifyChannelMissing: !!value.notifyChannel && (!channel || channel.isArchived) } });
});

azureDevOpsRouter.patch("/work-items", async (req, res) => {
  const settings = await getWorkItemSettings();
  const current = settings.azureWorkItems || {};
  const requestedPrefix = req.body?.urlPrefix === undefined ? current.urlPrefix || "" : String(req.body.urlPrefix || "").trim();
  const prefix = req.body?.urlPrefix === undefined ? requestedPrefix : requestedPrefix ? normalizeWorkItemUrlPrefix(requestedPrefix) : "";
  if (requestedPrefix && !prefix) return res.status(400).json({ error: "Enter an Azure DevOps work item URL ending in /_workitems/edit" });
  const token = req.body?.token === undefined ? null : String(req.body.token).trim();
  if (token?.length > 10000) return res.status(400).json({ error: "Token is too long" });
  const expiresAt = req.body?.expiresAt === undefined ? current.expiresAt : req.body.expiresAt ? new Date(req.body.expiresAt) : null;
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) return res.status(400).json({ error: "Enter a valid token expiration date" });
  const channelId = req.body?.notifyChannel === undefined ? String(current.notifyChannel || "") : String(req.body.notifyChannel || "");
  if (channelId) {
    const channel = await Channel.findById(channelId);
    if (!channel || channel.isArchived || channel.type === "dm") return res.status(400).json({ error: "Choose an active channel for token reminders" });
  }
  const nextToken = token ? saveWorkItemToken(token) : current.tokenCiphertext;
  const enabled = req.body?.enabled === undefined ? !!current.enabled : !!req.body.enabled;
  if (enabled && (!prefix || !nextToken || !expiresAt || !channelId)) return res.status(400).json({ error: "A URL, token, expiration date, and reminder channel are required" });
  settings.azureWorkItems = {
    enabled,
    urlPrefix: prefix || "",
    tokenCiphertext: nextToken || null,
    expiresAt: expiresAt || null,
    notifyChannel: channelId || null,
    lastReminderKey: token ? null : current.lastReminderKey || null,
    lastError: null,
  };
  await settings.save();
  res.json({ integration: workItemSettingsJSON(settings) });
});

azureDevOpsRouter.get("/", async (_req, res) => {
  // Azure DevOps is a single app-level integration. Keep older records hidden
  // from the settings UI while allowing their existing webhook tokens to be
  // handled by the receiver during migration.
  const integrations = await AzureDevOpsIntegration.find().sort({ createdAt: -1 }).limit(1);
  res.json({
    integrations: integrations.map((item) => {
      const token = decryptAzureDevOpsToken(item.tokenCiphertext);
      return {
        ...item.toPublicJSON(),
        endpoint: token ? integrationEndpointPath(token) : null,
      };
    }),
  });
});

azureDevOpsRouter.post("/", async (req, res) => {
  const existing = await AzureDevOpsIntegration.findOne().sort({ createdAt: -1 });
  if (existing) return res.status(409).json({ error: "Azure DevOps is already configured" });
  const name = String(req.body?.name || "Azure DevOps").trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ error: "name is required and must be at most 80 characters" });
  }
  const token = createAzureDevOpsToken();
  const integration = await AzureDevOpsIntegration.create({
    name,
    tokenHash: hashAzureDevOpsToken(token),
    tokenCiphertext: encryptAzureDevOpsToken(token),
    createdBy: req.user._id,
    notify: req.body?.notify || {},
  });
  res.status(201).json({
    integration: integration.toPublicJSON(),
    token,
    endpointPath: integrationEndpointPath(token),
  });
});

azureDevOpsRouter.post("/:id/token", async (req, res) => {
  const integration = await AzureDevOpsIntegration.findById(req.params.id);
  if (!integration) return res.status(404).json({ error: "integration not found" });
  const token = createAzureDevOpsToken();
  integration.tokenHash = hashAzureDevOpsToken(token);
  integration.tokenCiphertext = encryptAzureDevOpsToken(token);
  await integration.save();
  res.json({ endpoint: integrationEndpointPath(token), token });
});

azureDevOpsRouter.patch("/:id", async (req, res) => {
  const integration = await AzureDevOpsIntegration.findById(req.params.id);
  if (!integration) return res.status(404).json({ error: "integration not found" });
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "invalid integration name" });
    integration.name = name;
  }
  if (req.body?.active !== undefined) integration.active = !!req.body.active;
  if (req.body?.notify && typeof req.body.notify === "object") {
    for (const key of [
      "pullRequestCreated",
      "pullRequestTitleChanged",
      "pullRequestApproved",
      "pullRequestApprovalReset",
      "pullRequestRejected",
      "pullRequestCommented",
      "pullRequestCompleted",
      "pullRequestAbandoned",
      "pullRequestReactivated",
      "buildValidationFailed",
      "buildValidationSucceeded",
    ]) {
      if (req.body.notify[key] !== undefined) integration.notify[key] = !!req.body.notify[key];
    }
  }
  await integration.save();
  res.json({ integration: integration.toPublicJSON() });
});

azureDevOpsRouter.delete("/:id", async (req, res) => {
  const deleted = await AzureDevOpsIntegration.deleteOne({ _id: req.params.id });
  if (!deleted.deletedCount) return res.status(404).json({ error: "integration not found" });
  res.json({ ok: true });
});
