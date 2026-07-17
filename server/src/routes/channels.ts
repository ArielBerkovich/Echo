import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { Read } from "../models/Read.js";
import {
  emitAll,
  emitToChannel,
  emitToUser,
  joinUserToChannel,
  removeUserFromChannel,
} from "../realtime.js";
import { deliverMessage, sanitizeAttachments } from "../deliver.js";
import { normalizeChannelName } from "../automation.js";
import { ActivityEvent } from "../models/ActivityEvent.js";

// Whitelist attachment fields (keys produced by /api/uploads). Mirrors the
// socket sender so the REST and realtime paths behave identically.
// Create a system log message (e.g. "joined the channel") and broadcast it live.
async function logSystem(channelId, authorId, body) {
  const msg = await Message.create({ channel: channelId, author: authorId, body, kind: "system" });
  await msg.populate("author");
  emitToChannel(channelId.toString(), "message:new", {
    ...msg.toPublicJSON(),
    replyCount: 0,
    lastReplyAt: null,
  });
  return msg;
}

// Attach an `unread` count (messages from others since the user last read) to
// each channel doc, returning plain public objects.
async function withUnread(channels, userId) {
  if (channels.length === 0) return [];
  const ids = channels.map((c) => c._id);
  const reads = await Read.find({ user: userId, channel: { $in: ids }, thread: null });
  const readMap = new Map(reads.map((r) => [r.channel.toString(), r.lastReadAt]));

  // One aggregation for all channels: count messages from others newer than
  // each channel's last-read time (instead of a countDocuments per channel).
  const counts = await Message.aggregate([
    { $match: { $or: ids.map((id) => ({ channel: id, author: { $ne: userId }, createdAt: { $gt: readMap.get(id.toString()) || new Date(0) } })) } },
    { $group: { _id: "$channel", unread: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.unread]));

  return channels.map((c) => ({ ...c.toPublicJSON(), unread: countMap.get(c._id.toString()) || 0 }));
}
import { config } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const channelsRouter = Router();
channelsRouter.use(requireAuth);

// GET /api/channels — public channels plus any private ones the user belongs to.
channelsRouter.get("/", async (req, res) => {
  // ?scope=all → browsable public channels (for search); default → your channels.
  if (req.query.scope === "all") {
    const all = await Channel.find({ isArchived: false, type: "public" }).sort({ name: 1 });
    return res.json({ channels: all.map((c) => c.toPublicJSON()) });
  }
  const channels = await Channel.find({
    isArchived: false,
    type: { $ne: "dm" },
    members: req.user._id, // only channels you belong to
  }).sort({ name: 1 });
  res.json({ channels: await withUnread(channels, req.user._id) });
});

// GET /api/channels/by-name/:name — resolve a channel id from a CI-friendly
// channel name (with or without a leading #).
channelsRouter.get("/by-name/:name", async (req, res) => {
  const name = normalizeChannelName(req.params.name);
  const channel = await Channel.findOne({ name, isArchived: false });
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  res.json({ channel: channel.toPublicJSON() });
});

// POST /api/channels — create a public channel; creator becomes the first member.
channelsRouter.post("/", async (req, res) => {
  const { name, type } = req.body || {};
  if (!name) return res.status(400).json({ error: "channel name is required" });

  // Only the two supported visibilities; anything else is rejected.
  const visibility = type === "private" ? "private" : "public";

  const normalized = String(name).toLowerCase().trim();
  const existing = await Channel.findOne({ name: normalized });
  if (existing) return res.status(409).json({ error: "channel name already exists" });

  try {
    const channel = await Channel.create({
      name: normalized,
      type: visibility,
      members: [req.user._id],
      createdBy: req.user._id,
    });
    await logSystem(channel._id, req.user._id, "created this channel");
    joinUserToChannel(req.user._id.toString(), channel._id.toString());
    if (channel.type === "public") {
      emitAll("channel:catalog", { channel: channel.toPublicJSON() });
    }
    res.status(201).json({ channel: channel.toPublicJSON() });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// POST /api/channels/:id/join — add the current user to a channel's membership.
channelsRouter.post("/:id/join", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel || channel.isArchived) {
    return res.status(404).json({ error: "channel not found" });
  }
  const already = channel.members.some((m) => m.equals(req.user._id));
  await Channel.updateOne(
    { _id: channel._id },
    { $addToSet: { members: req.user._id } }
  );
  if (!already) await logSystem(channel._id, req.user._id, "joined the channel");
  const updated = await Channel.findById(channel._id);
  joinUserToChannel(req.user._id.toString(), channel._id.toString());
  res.json({ channel: updated.toPublicJSON() });
});

// POST /api/channels/:id/members { userId } — add another user to a channel.
channelsRouter.post("/:id/members", async (req, res) => {
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "valid channel id and userId are required" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel || channel.isArchived) {
    return res.status(404).json({ error: "channel not found" });
  }
  if (channel.type === "dm") {
    return res.status(400).json({ error: "cannot add members to a direct message" });
  }
  // Everyone is automatically a member of #general, so there's no one to add.
  if ((channel.name || "").toLowerCase() === "general") {
    return res.status(400).json({ error: "everyone is automatically a member of #general" });
  }
  // Anyone may add to public channels; private channels are members-only.
  const isMember = channel.members.some((m) => m.equals(req.user._id));
  if (channel.type === "private" && !isMember) {
    return res.status(403).json({ error: "join the channel before adding others" });
  }

  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ error: "user not found" });

  const alreadyMember = channel.members.some((m) => m.equals(target._id));
  await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: target._id } });
  if (!alreadyMember) {
    // Pull the new member's sockets into the channel room for live messages,
    // and tell their client to add the channel to its sidebar right away.
    joinUserToChannel(target._id.toString(), channel._id.toString());
    emitToUser(target._id.toString(), "channel:added", { channelId: channel._id.toString() });
    // Record activity ("X added you to #channel") for the added user — unless
    // they added themselves. (message=channel satisfies the schema + makes the
    // per-channel event unique.)
    if (!target._id.equals(req.user._id)) {
      await ActivityEvent.updateOne(
        { recipient: target._id, actor: req.user._id, message: channel._id, emoji: "" },
        { $set: { type: "channel_add", channel: channel._id, createdAt: new Date() } },
        { upsert: true }
      ).catch(() => {});
      emitToUser(target._id.toString(), "activity:bump");
    }
    await logSystem(channel._id, target._id, "joined the channel");
  }
  const updated = await Channel.findById(channel._id);
  const updatedPayload = updated.toPublicJSON();
  // Keep open channel headers in sync when membership changes elsewhere. The
  // existing members are already in this room; the newly added user was
  // joined above before this event is emitted.
  emitToChannel(channel._id.toString(), "channel:update", { channel: updatedPayload });
  if (channel.type === "public") {
    emitAll("channel:catalog", { channel: updatedPayload });
  }
  res.json({ channel: updatedPayload });
});

// DELETE /api/channels/:id/members/:userId — the channel creator removes
// another member from the channel.
channelsRouter.delete("/:id/members/:userId", async (req, res) => {
  const { id, userId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "valid channel id and userId are required" });
  }
  const channel = await Channel.findById(id);
  if (!channel || channel.isArchived) {
    return res.status(404).json({ error: "channel not found" });
  }
  if (channel.type === "dm") {
    return res.status(400).json({ error: "cannot remove members from a direct message" });
  }
  if ((channel.name || "").toLowerCase() === "general") {
    return res.status(400).json({ error: "everyone is a member of #general" });
  }
  // The creator and delegated managers can remove others.
  const isManager = (channel.managers || []).some((memberId) => memberId.equals(req.user._id));
  if (!channel.createdBy.equals(req.user._id) && !isManager) {
    return res.status(403).json({ error: "only the channel creator or a manager can remove members" });
  }
  // The creator can't remove themselves this way (they'd leave instead).
  if (channel.createdBy.equals(userId)) {
    return res.status(400).json({ error: "the creator can't be removed from the channel" });
  }
  const wasMember = channel.members.some((m) => m.equals(userId));
  await Channel.updateOne({ _id: channel._id }, { $pull: { members: userId, managers: userId } });

  if (wasMember) {
    await ActivityEvent.deleteMany({
      recipient: userId,
      channel: channel._id,
      type: { $ne: "channel_remove" },
    }).catch(() => {});
    removeUserFromChannel(userId, channel._id.toString());
    emitToUser(userId, "channel:removed", { channelId: channel._id.toString() });
    const systemMessage = await logSystem(channel._id, userId, "was removed from the channel");
    // Removing someone is useful activity even though they can no longer see
    // a private channel in the normal channel listing.
    await ActivityEvent.updateOne(
      { recipient: userId, actor: req.user._id, message: systemMessage._id, emoji: "" },
      {
        $set: {
          type: "channel_remove",
          channel: channel._id,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    ).catch(() => {});
    emitToUser(userId, "activity:bump");
  }
  const updated = await Channel.findById(channel._id);
  res.json({ channel: updated.toPublicJSON() });
});

// POST /api/channels/:id/leave — remove the current user from a channel.
channelsRouter.post("/:id/leave", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type === "dm") {
    return res.status(400).json({ error: "cannot leave a direct message" });
  }
  if (!channel.members.some((memberId) => memberId.equals(req.user._id))) {
    return res.status(403).json({ error: "you are not a member of this channel" });
  }
  // #general is the workspace's default channel — everyone stays in it.
  if ((channel.name || "").toLowerCase() === "general") {
    return res.status(400).json({ error: "#general is the default channel and can't be left" });
  }
  const isCreator = channel.createdBy.equals(req.user._id);
  const remainingMembers = channel.members.filter((memberId) => !memberId.equals(req.user._id));
  const managerId = req.body?.managerId;
  if (isCreator && remainingMembers.length > 0) {
    if (!mongoose.isValidObjectId(managerId)) {
      return res.status(400).json({ error: "choose a manager before leaving" });
    }
    if (!remainingMembers.some((memberId) => memberId.equals(managerId))) {
      return res.status(400).json({ error: "manager must be a member of the channel" });
    }
    channel.managers = [...new Set([...(channel.managers || []).map(String), String(managerId)])];
  }
  if (isCreator && remainingMembers.length === 0) {
    return res.status(400).json({ error: "empty channels must be deleted instead" });
  }
  channel.members = remainingMembers;
  channel.managers = (channel.managers || []).filter((memberId) => String(memberId) !== String(req.user._id));
  await ActivityEvent.deleteMany({
    recipient: req.user._id,
    channel: channel._id,
    type: { $ne: "channel_remove" },
  }).catch(() => {});
  await channel.save();
  const updated = channel.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: updated });
  removeUserFromChannel(req.user._id.toString(), channel._id.toString());
  res.json({ channel: updated });
});

// DELETE /api/channels/:id — archive an empty channel owned by the creator.
channelsRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type === "dm") return res.status(400).json({ error: "cannot delete a direct message" });
  if (!channel.createdBy.equals(req.user._id)) {
    return res.status(403).json({ error: "only the channel creator can delete it" });
  }
  if (channel.members.some((memberId) => !memberId.equals(req.user._id))) {
    return res.status(400).json({ error: "remove all other members before deleting the channel" });
  }
  await ActivityEvent.deleteMany({ channel: channel._id }).catch(() => {});
  channel.isArchived = true;
  channel.members = [];
  channel.managers = [];
  await channel.save();
  emitAll("channel:catalog", { channel: channel.toPublicJSON() });
  removeUserFromChannel(req.user._id.toString(), channel._id.toString());
  res.json({ ok: true });
});

// POST /api/channels/:id/read — mark a channel/DM read up to now. Pass a
// `thread` (root message id) in the body to mark a specific thread read
// instead of the channel's main timeline.
channelsRouter.post("/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const thread =
    req.body?.thread && mongoose.isValidObjectId(req.body.thread) ? req.body.thread : null;
  await Read.updateOne(
    { user: req.user._id, channel: req.params.id, thread },
    { $set: { lastReadAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// PATCH /api/channels/:id — update channel settings.
//   { type }                  → change visibility (creator only)
//   { topic } / { description } → update info (any member)
channelsRouter.patch("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const { type, topic, description } = req.body || {};
  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type === "dm") {
    return res.status(400).json({ error: "cannot change a direct message" });
  }

  // Visibility changes are creator-only.
  if (type !== undefined) {
    if (type !== "public" && type !== "private") {
      return res.status(400).json({ error: "type must be 'public' or 'private'" });
    }
    if (!channel.createdBy.equals(req.user._id)) {
      return res.status(403).json({ error: "only the channel creator can change visibility" });
    }
    if (channel.type === "public" && type === "private") {
      return res.status(400).json({ error: "public channels cannot be made private" });
    }
    channel.type = type;
  }

  // Topic/description can be edited by any member of the channel.
  if (topic !== undefined || description !== undefined) {
    const isMember = channel.members.some((m) => m.equals(req.user._id));
    if (!isMember) {
      return res.status(403).json({ error: "join the channel to edit its details" });
    }
    if (topic !== undefined) {
      if (String(topic).length > 250) {
        return res.status(400).json({ error: "topic must be 250 characters or fewer" });
      }
      channel.topic = String(topic).trim();
    }
    if (description !== undefined) {
      if (String(description).length > 2000) {
        return res.status(400).json({ error: "description must be 2000 characters or fewer" });
      }
      channel.description = String(description).trim();
    }
  }

  await channel.save();
  const updated = channel.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: updated });
  emitAll("channel:catalog", { channel: updated });
  res.json({ channel: updated });
});

// GET /api/channels/:id — a channel's info, with the creator and members
// resolved to user objects.
channelsRouter.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  const [memberDocs, creator] = await Promise.all([
    User.find({ _id: { $in: channel.members } }),
    User.findById(channel.createdBy),
  ]);
  res.json({
    channel: channel.toPublicJSON(),
    creator: creator ? creator.toPublicJSON() : null,
    members: memberDocs.map((u) => u.toPublicJSON()),
  });
});

// GET /api/channels/:id/messages?before=<ISO> — paginated history, newest first.
channelsRouter.get("/:id/messages", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });

  // Enforce access: private channels and DMs are members-only.
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  const base = { channel: channel._id, parentId: null }; // top-level only

  // `docs` is built newest-first here; the mapping below reverses it to
  // chronological order (oldest at top) for rendering.
  let docs;
  if (req.query.around && mongoose.isValidObjectId(req.query.around)) {
    // Load a window centered on a specific message (used when jumping to a
    // search result that may be far back in history): half a page of
    // older-or-equal messages and half a page of newer ones around the target.
    const target = await Message.findOne({ _id: req.query.around, ...base });
    if (!target) return res.status(404).json({ error: "message not found" });
    const half = Math.floor(config.messagePageSize / 2);
    const [olderOrEqual, newer] = await Promise.all([
      Message.find({ ...base, createdAt: { $lte: target.createdAt } })
        .sort({ createdAt: -1 })
        .limit(half + 1)
        .populate("author"),
      Message.find({ ...base, createdAt: { $gt: target.createdAt } })
        .sort({ createdAt: -1 })
        .limit(half)
        .populate("author"),
    ]);
    docs = [...newer, ...olderOrEqual]; // newest-first, target included
  } else {
    const query = { ...base };
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
    }
    docs = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(config.messagePageSize)
      .populate("author");
  }

  // Reply stats for these roots, in one aggregation.
  const ids = docs.map((d) => d._id);
  const stats = await Message.aggregate([
    { $match: { parentId: { $in: ids } } },
    { $group: { _id: "$parentId", count: { $sum: 1 }, lastReplyAt: { $max: "$createdAt" } } },
  ]);
  const statMap = new Map(stats.map((s) => [s._id.toString(), s]));

  const messages = docs.reverse().map((m) => {
    const s = statMap.get(m._id.toString());
    return { ...m.toPublicJSON(), replyCount: s?.count || 0, lastReplyAt: s?.lastReplyAt || null };
  });

  // When the user last read this channel — lets the client open at the first
  // unread message instead of the very bottom.
  const read = await Read.findOne({ user: req.user._id, channel: channel._id, thread: null });
  res.json({ messages, lastReadAt: read?.lastReadAt || null });
});

// GET /api/channels/:id/messages/:msgId/thread — a thread's root + replies.
channelsRouter.get("/:id/messages/:msgId/thread", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.msgId)) {
    return res.status(404).json({ error: "not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  const root = await Message.findById(req.params.msgId).populate("author");
  if (!root) return res.status(404).json({ error: "message not found" });
  const replies = await Message.find({ parentId: root._id })
    .sort({ createdAt: 1 })
    .populate("author");

  res.json({
    parent: root.toPublicJSON(),
    replies: replies.map((r) => r.toPublicJSON()),
  });
});

// GET /api/channels/:id/pinned — all pinned messages, oldest pin first.
channelsRouter.get("/:id/pinned", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  const docs = await Message.find({ channel: channel._id, pinnedAt: { $ne: null } })
    .sort({ pinnedAt: 1 })
    .populate("author");
  res.json({ messages: docs.map((m) => m.toPublicJSON()) });
});

// POST /api/channels/:id/messages — send a message (REST equivalent of the
// `message:send` socket event). Body: { body, parentId?, attachments? }.
channelsRouter.post("/:id/messages", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const text = String(req.body?.body || "").trim();
  const files = sanitizeAttachments(req.body?.attachments);
  if (!text && files.length === 0) {
    return res.status(400).json({ error: "message needs text or an attachment" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  const parentId =
    req.body?.parentId && mongoose.isValidObjectId(req.body.parentId) ? req.body.parentId : null;

  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const existing = await Message.findOne({
      channel: channel._id,
      author: req.user._id,
      idempotencyKey: idempotencyKey.slice(0, 128),
    }).populate("author");
    if (existing) return res.json({ message: existing.toPublicJSON(), idempotent: true });
  }

  const message = await deliverMessage({
    channel,
    authorId: req.user._id,
    body: text,
    parentId,
    attachments: files,
    idempotencyKey: idempotencyKey || null,
  });
  res.status(201).json({ message });
});
