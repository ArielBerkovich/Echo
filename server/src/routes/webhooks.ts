import { Router } from "express";
import mongoose from "mongoose";
import { IncomingWebhook } from "../models/IncomingWebhook.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createWebhookToken,
  hashWebhookToken,
  postAutomationMessage,
  resolveAutomationChannel,
} from "../automation.js";

export const webhooksRouter = Router();

// POST /api/webhooks/:token — incoming webhook receiver for CI/CD tools.
// No Bearer token is required; the opaque URL token identifies the destination.
webhooksRouter.post("/:token", async (req, res) => {
  const tokenHash = hashWebhookToken(req.params.token);
  const hook = await IncomingWebhook.findOne({ tokenHash, active: true });
  if (!hook) return res.status(404).json({ error: "webhook not found" });

  const channel = await resolveAutomationChannel({
    userId: hook.createdBy,
    channelId: req.body?.channelId,
    channelName: req.body?.channelName,
    fallbackChannelId: hook.channel,
  });
  const result = await postAutomationMessage({
    channel,
    authorId: hook.createdBy,
    payload: req.body || {},
    source: "webhook",
    idempotencyKey: req.header("Idempotency-Key"),
  });
  res.status(result.created ? 201 : 200).json(result);
});

webhooksRouter.use(requireAuth);

// GET /api/webhooks — list incoming webhooks created by the current user.
webhooksRouter.get("/", async (req, res) => {
  const hooks = await IncomingWebhook.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
  res.json({ webhooks: hooks.map((h) => h.toPublicJSON()) });
});

// POST /api/webhooks { name, channelId? | channelName? } — create a webhook.
// The raw token is returned once; store the URL in your CI secret manager.
webhooksRouter.post("/", async (req, res) => {
  const channel = await resolveAutomationChannel({
    userId: req.user._id,
    channelId: req.body?.channelId,
    channelName: req.body?.channelName,
  });
  const token = createWebhookToken();
  const hook = await IncomingWebhook.create({
    name: String(req.body?.name || `Webhook for #${channel.name}`).trim().slice(0, 80),
    tokenHash: hashWebhookToken(token),
    channel: channel._id,
    createdBy: req.user._id,
  });
  res.status(201).json({
    webhook: hook.toPublicJSON(),
    token,
    path: `/api/webhooks/${token}`,
  });
});

// DELETE /api/webhooks/:id — revoke an incoming webhook.
webhooksRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "webhook not found" });
  const result = await IncomingWebhook.deleteOne({ _id: req.params.id, createdBy: req.user._id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "webhook not found" });
  res.json({ ok: true });
});
