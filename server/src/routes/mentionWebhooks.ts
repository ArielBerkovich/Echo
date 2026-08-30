import { Router } from "express";
import { MentionWebhook } from "../models/MentionWebhook.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { mentionWebhookSigningSecret } from "../mentionWebhooks.js";

export const mentionWebhooksRouter = Router();
mentionWebhooksRouter.use(requireAuth);

function validUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function publicWebhook(webhook) {
  return webhook.toPublicJSON(mentionWebhookSigningSecret(webhook.user.toString()));
}

// GET /api/mention-webhook — the current user's single mention destination.
mentionWebhooksRouter.get("/", async (req, res) => {
  const webhook = await MentionWebhook.findOne({ user: req.user._id });
  res.json({ webhook: webhook ? publicWebhook(webhook) : null });
});

// PUT /api/mention-webhook — create or update the current user's destination.
mentionWebhooksRouter.put("/", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!validUrl(url)) return res.status(400).json({ error: "a valid HTTP(S) webhook URL is required" });
  const webhook = await MentionWebhook.findOneAndUpdate(
    { user: req.user._id },
    { $set: { url, enabled: req.body?.enabled !== false } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ webhook: publicWebhook(webhook) });
});

mentionWebhooksRouter.delete("/", async (req, res) => {
  await MentionWebhook.deleteOne({ user: req.user._id });
  res.json({ ok: true });
});
