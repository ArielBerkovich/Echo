import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { ActivityEvent } from "../models/ActivityEvent.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { ACTIVITY_WINDOW_DAYS } from "../lib/activityNotifications.js";

export const activityRouter = Router();
activityRouter.use(requireAuth);

function eventIds(values) {
  return Array.isArray(values)
    ? values
      .map((id) => String(id || "").replace(/^(?:a|rx|ca|cr)-/i, ""))
      .filter((id) => mongoose.isValidObjectId(id))
    : [];
}

// Explicit Activity action: mark every notification read.
activityRouter.post("/read", async (req, res) => {
  await ActivityEvent.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true });
});

// Mark only the selected Activity notifications read.
activityRouter.post("/read-items", async (req, res) => {
  const ids = eventIds(req.body?.ids);
  if (ids.length) {
    await ActivityEvent.updateMany(
      { _id: { $in: ids }, recipient: req.user._id },
      { $set: { readAt: new Date() } },
    );
  }
  res.json({ ok: true });
});

// Clear removes notifications from the default Activity feed, matching
// Slack's distinction between clearing and marking an item read.
activityRouter.delete("/", async (req, res) => {
  await ActivityEvent.deleteMany({ recipient: req.user._id });
  res.json({ ok: true });
});

// Mark one notification read without removing it from Activity.
activityRouter.post("/:id/read", async (req, res) => {
  const ids = eventIds([req.params.id]);
  if (!ids.length) return res.status(400).json({ error: "invalid activity id" });
  await ActivityEvent.updateOne(
    { _id: ids[0], recipient: req.user._id },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true });
});

// DELETE /api/activity/:id — clear one notification.
activityRouter.delete("/:id", async (req, res) => {
  const ids = eventIds([req.params.id]);
  if (!ids.length) return res.status(400).json({ error: "invalid activity id" });
  await ActivityEvent.deleteOne({ _id: ids[0], recipient: req.user._id });
  res.json({ ok: true });
});

// Activity is a persistent notification feed. Conversation Read documents are
// intentionally not consulted here: reading a notification must never clear a
// whole channel or thread, and reading a channel must not rewrite Activity.
activityRouter.get("/", async (req, res) => {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const visible = await Channel.find(
    { isArchived: { $ne: true }, $or: [{ type: "public" }, { members: req.user._id }] },
    { _id: 1, name: 1, type: 1 },
  );
  const channelMap = new Map(visible.map((channel) => [channel._id.toString(), channel]));
  const visibleChannelIds = visible.map((channel) => channel._id);

  // Keep removal notifications visible even though their private channel is
  // no longer accessible. Other inaccessible events are removed eagerly.
  await ActivityEvent.deleteMany({
    recipient: req.user._id,
    channel: { $nin: visibleChannelIds },
    type: { $ne: "channel_remove" },
  }).catch(() => {});
  const events = await ActivityEvent.find({
    recipient: req.user._id,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("actor")
    .populate({
      path: "message",
      populate: [{ path: "author" }, { path: "reactions.users" }],
    });

  const removalChannelIds = events
    .filter((event) => event.type === "channel_remove")
    .map((event) => event.channel)
    .filter(Boolean);
  if (removalChannelIds.length) {
    const removedChannels = await Channel.find(
      { _id: { $in: removalChannelIds } },
      { _id: 1, name: 1, type: 1 },
    );
    for (const channel of removedChannels) channelMap.set(channel._id.toString(), channel);
  }

  const items = events.map((event) => {
    const channel = channelMap.get(event.channel?.toString());
    if (!channel) return null;
    const message = event.message;
    const isMessageActivity = !!message;
    const reactionActorIds = new Set();
    if (event.type === "reaction") {
      if (event.actor?._id) reactionActorIds.add(event.actor._id.toString());
      for (const reaction of message?.reactions || []) {
        for (const actor of reaction.users || []) {
          reactionActorIds.add((actor?._id || actor).toString());
        }
      }
    }
    return {
      id: `a-${event._id.toString()}`,
      channelId: event.channel.toString(),
      channelName: channel.name,
      channelType: channel.type,
      messageId: isMessageActivity ? message._id.toString() : null,
      threadId: isMessageActivity && message.parentId ? message.parentId.toString() : null,
      author: event.actor?.toPublicJSON?.() || null,
      body: isMessageActivity ? message.body : "",
      emoji: event.emoji,
      reactions: isMessageActivity
        ? (message.reactions || []).map((reaction) => ({
          emoji: reaction.emoji,
          count: reaction.users?.length || 0,
        }))
        : [],
      reactionActorCount: event.type === "reaction" ? reactionActorIds.size : 0,
      createdAt: event.createdAt,
      kind: event.type,
      unread: !event.readAt,
    };
  }).filter(Boolean);

  res.json({ items });
});
