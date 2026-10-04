import { Router } from "express";
import mongoose from "mongoose";
import { canPostToChannel, Channel } from "../models/Channel.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { sanitizeAttachments, attachmentLimitError } from "../deliver.js";
import {
  cancelScheduledMessage,
  createScheduledMessage,
  findScheduledMessage,
  listScheduledMessages,
  updateScheduledMessage,
} from "../services/scheduledMessageService.js";

export const scheduledRouter = Router();
scheduledRouter.use(requireAuth);

// POST /api/scheduled — queue a message for future delivery.
scheduledRouter.post("/", async (req, res) => {
  const { channelId, body, parentId, attachments, scheduledFor } = req.body || {};
  if (!mongoose.isValidObjectId(channelId)) {
    return res.status(400).json({ error: "invalid channel" });
  }
  const text = String(body || "").trim();
  const attachmentError = attachmentLimitError(attachments);
  if (attachmentError) return res.status(400).json({ error: attachmentError });
  const files = sanitizeAttachments(attachments);
  if (!text && files.length === 0) {
    return res.status(400).json({ error: "message needs text or an attachment" });
  }
  const when = new Date(scheduledFor);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    return res.status(400).json({ error: "scheduledFor must be a future time" });
  }

  const channel = await Channel.findById(channelId);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  if (!canPostToChannel(channel, req.user._id)) {
    return res.status(403).json({ error: "only channel managers can post in this read-only channel" });
  }

  const doc = await createScheduledMessage({
    channelId: channel._id,
    authorId: req.user._id,
    body: text,
    parentId: parentId && mongoose.isValidObjectId(parentId) ? parentId : null,
    attachments: files,
    scheduledFor: when,
  });
  res.status(201).json({ scheduled: doc.toPublicJSON() });
});

// GET /api/scheduled[?channelId=...] — the caller's pending scheduled messages.
scheduledRouter.get("/", async (req, res) => {
  const docs = await listScheduledMessages({
    authorId: req.user._id,
    channelId: req.query.channelId && mongoose.isValidObjectId(req.query.channelId) ? req.query.channelId : undefined,
  });
  res.json({ scheduled: docs.map((d) => d.toPublicJSON()) });
});

// PATCH /api/scheduled/:id — edit a scheduled message's text and/or time.
scheduledRouter.patch("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "not found" });
  }
  const doc = await findScheduledMessage({ messageId: req.params.id, authorId: req.user._id });
  if (!doc) return res.status(404).json({ error: "not found" });

  const { body, scheduledFor } = req.body || {};
  if (body !== undefined) {
    const text = String(body).trim();
    if (!text && (doc.attachments?.length || 0) === 0) {
      return res.status(400).json({ error: "message needs text or an attachment" });
    }
  }
  if (scheduledFor !== undefined) {
    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return res.status(400).json({ error: "scheduledFor must be a future time" });
    }
  }
  const updated = await updateScheduledMessage({
    messageId: req.params.id,
    authorId: req.user._id,
    body: body !== undefined ? String(body).trim() : undefined,
    scheduledFor: scheduledFor !== undefined ? new Date(scheduledFor) : undefined,
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json({ scheduled: updated.toPublicJSON() });
});

// DELETE /api/scheduled/:id — cancel one of your scheduled messages.
scheduledRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "not found" });
  }
  const cancelled = await cancelScheduledMessage({ messageId: req.params.id, authorId: req.user._id });
  if (!cancelled) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});
