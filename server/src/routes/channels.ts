import { getAISettings } from "../services/aiSettings.js";
import { summarizeThreadDiscussion } from "../services/threadSummaryService.js";
import { Router } from "express";
import mongoose from "mongoose";
import { canParticipateInChannel, canPostToChannel, Channel, isChannelManager } from "../models/Channel.js";
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
import { sanitizeAttachments, attachmentLimitError, sanitizeSurvey, surveyError, sanitizeRetro, retroError } from "../deliver.js";
import { cardError, sanitizeCard } from "../lib/messageCard.js";
import { normalizeChannelName } from "../automation.js";
import { ActivityEvent } from "../models/ActivityEvent.js";
import { isValidChannelName } from "../lib/channelName.js";
import { CustomEmoji } from "../models/CustomEmoji.js";
import { reactToMessage, voteInSurvey } from "../services/messageActionService.js";
import { getThreadMessages, listPinnedMessages } from "../services/messageQueryService.js";
import { queryChannelHistory } from "../services/messageHistoryService.js";
import { getThreadFollow, markRead, setThreadFollow } from "../services/userStateService.js";
import {
  addChannelMember,
  archiveChannel,
  createChannel,
  joinChannel,
  leaveChannel,
  promoteChannelManager,
  removeChannelMember,
} from "../services/channelService.js";
import { sendMessage } from "../services/messageService.js";

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
    { $match: { kind: { $ne: "system" }, $or: ids.map((id) => ({ channel: id, author: { $ne: userId }, createdAt: { $gt: readMap.get(id.toString()) || new Date(0) } })) } },
    { $group: { _id: "$channel", unread: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.unread]));

  return channels.map((c) => ({ ...c.toPublicJSON(), unread: countMap.get(c._id.toString()) || 0 }));
}
import { config } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const channelsRouter = Router();
channelsRouter.use(requireAuth);

// Follow a specific thread for notifications. Thread follows are per-user and
// remain active even when the containing conversation is muted.
channelsRouter.get("/:channelId/threads/:threadId/follow", async (req, res) => {
  const { channelId, threadId } = req.params;
  if (!mongoose.isValidObjectId(channelId) || !mongoose.isValidObjectId(threadId)) return res.status(404).json({ error: "thread not found" });
  const channel = await Channel.findById(channelId).select("members type");
  const root = await Message.findOne({ _id: threadId, channel: channelId, parentId: null }).select("_id");
  if (!channel || !root || !canParticipateInChannel(channel, req.user._id)) return res.status(404).json({ error: "thread not found" });
  const preference = await getThreadFollow({ userId: req.user._id, threadId: root._id });
  res.json({
    threadId: root._id.toString(),
    ...preference,
  });
});

channelsRouter.put("/:channelId/threads/:threadId/follow", async (req, res) => {
  const { channelId, threadId } = req.params;
  if (!mongoose.isValidObjectId(channelId) || !mongoose.isValidObjectId(threadId)) {
    return res.status(404).json({ error: "thread not found" });
  }
  const channel = await Channel.findById(channelId).select("members type");
  const root = await Message.findOne({ _id: threadId, channel: channelId, parentId: null }).select("_id");
  if (!channel || !root || !canParticipateInChannel(channel, req.user._id)) {
    return res.status(404).json({ error: "thread not found" });
  }
  const following = req.body?.following;
  if (following !== true && following !== false && following !== null) {
    return res.status(400).json({ error: "following must be true, false, or null" });
  }
  const result = await setThreadFollow({ userId: req.user._id, threadId: root._id, channelId: channel._id, following });
  res.json({ threadId: root._id.toString(), ...result });
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeCatalogCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
    if (typeof parsed?.name !== "string" || !mongoose.isValidObjectId(parsed?.id)) return null;
    return { name: parsed.name, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch {
    return null;
  }
}

function encodeCatalogCursor(channel) {
  return Buffer.from(JSON.stringify({ name: channel.name, id: channel._id.toString() })).toString("base64url");
}

async function listCatalogPage(req, res) {
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
  const membership = ["joined", "available"].includes(String(req.query.membership))
    ? String(req.query.membership)
    : "all";
  const q = String(req.query.q || "").trim().slice(0, 100);
  const cursor = decodeCatalogCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    return res.status(400).json({ error: "invalid channel catalog cursor" });
  }

  const match = { isArchived: false, type: "public" };
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    match.$or = [{ name: pattern }, { topic: pattern }, { description: pattern }];
  }

  const membershipMatch =
    membership === "joined" ? { joined: true } : membership === "available" ? { joined: false } : null;
  const cursorMatch = cursor
    ? {
        $or: [
          { name: { $gt: cursor.name } },
          { name: cursor.name, _id: { $gt: cursor.id } },
        ],
      }
    : null;

  const [result] = await Channel.aggregate([
    { $match: match },
    {
      $project: {
        name: 1,
        type: 1,
        topic: { $ifNull: ["$topic", ""] },
        description: { $ifNull: ["$description", ""] },
        readOnly: { $eq: ["$readOnly", true] },
        createdAt: 1,
        memberCount: { $size: { $ifNull: ["$members", []] } },
        joined: { $in: [req.user._id, { $ifNull: ["$members", []] }] },
      },
    },
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: null,
              all: { $sum: 1 },
              joined: { $sum: { $cond: ["$joined", 1, 0] } },
              available: { $sum: { $cond: ["$joined", 0, 1] } },
            },
          },
        ],
        channels: [
          ...(membershipMatch ? [{ $match: membershipMatch }] : []),
          ...(cursorMatch ? [{ $match: cursorMatch }] : []),
          { $sort: { name: 1, _id: 1 } },
          { $limit: limit + 1 },
        ],
      },
    },
  ]);

  const docs = result?.channels || [];
  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;
  const last = pageDocs.at(-1);
  const counts = result?.counts?.[0] || { all: 0, joined: 0, available: 0 };
  return res.json({
    channels: pageDocs.map((channel) => ({
      id: channel._id.toString(),
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      description: channel.description,
      readOnly: channel.readOnly,
      memberCount: channel.memberCount,
      joined: channel.joined,
      createdAt: channel.createdAt,
      isArchived: false,
    })),
    counts: {
      all: counts.all || 0,
      joined: counts.joined || 0,
      available: counts.available || 0,
    },
    page: {
      hasMore,
      nextCursor: hasMore && last ? encodeCatalogCursor(last) : null,
    },
  });
}

// GET /api/channels — public channels plus any private ones the user belongs to.
channelsRouter.get("/", async (req, res) => {
  // ?scope=all → browsable public channels (for search); default → your channels.
  if (req.query.scope === "all") {
    // The paginated catalog is opt-in so older clients and API consumers that
    // expect the complete legacy response remain compatible.
    if (
      req.query.catalog === "1" ||
      req.query.limit !== undefined ||
      req.query.cursor !== undefined ||
      req.query.q !== undefined ||
      req.query.membership !== undefined
    ) {
      return listCatalogPage(req, res);
    }
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

// POST /api/channels — create a channel; creator becomes the first member and manager.
channelsRouter.post("/", async (req, res) => {
  const { name, type, readOnly = false } = req.body || {};
  if (!name) return res.status(400).json({ error: "channel name is required" });
  if (typeof readOnly !== "boolean") {
    return res.status(400).json({ error: "readOnly must be a boolean" });
  }

  const result = await createChannel({ name, type: type === "private" ? "private" : "public", readOnly, userId: req.user._id });
  if (result.error) return res.status(result.error === "Channel name already exists" ? 409 : 400).json({ error: result.error });
  res.status(201).json(result);
});

// GET /api/channels/:id/name-availability — check a candidate name for a manager.
channelsRouter.get("/:id/name-availability", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id).select("name type isArchived createdBy managers");
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type === "dm") return res.status(400).json({ error: "direct messages do not have channel names" });
  if (!isChannelManager(channel, req.user._id)) {
    return res.status(403).json({ error: "only the channel creator or a manager can check channel names" });
  }
  const name = typeof req.query.name === "string" ? req.query.name.trim().toLowerCase() : "";
  if (!isValidChannelName(name) || name === "general") {
    return res.status(400).json({ error: "invalid channel name" });
  }
  const existing = await Channel.exists({ name, _id: { $ne: channel._id } });
  res.json({ available: !existing });
});

// POST /api/channels/:id/star — toggle the current user's channel star.
// This is a private navigation preference; it never changes channel access.
channelsRouter.post("/:id/star", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  const isGroupDm = channel?.type === "dm" && channel.members.length > 2;
  if (!channel || channel.isArchived || (channel.type === "dm" && !isGroupDm)) {
    return res.status(404).json({ error: "channel not found" });
  }
  if (!channel.members.some((memberId) => memberId.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  const channelId = channel._id.toString();
  req.user.starredChannels ||= [];
  const index = req.user.starredChannels.findIndex((id) => id.equals(channel._id));
  let starred;
  if (index >= 0) {
    req.user.starredChannels.splice(index, 1);
    starred = false;
  } else {
    req.user.starredChannels.push(channel._id);
    starred = true;
  }
  await req.user.save();
  emitToUser(req.user._id.toString(), "starred:update", { channelId, starred });
  res.json({ channelId, starred });
});

// POST /api/channels/:id/join — add the current user to a channel's membership.
channelsRouter.post("/:id/join", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const result = await joinChannel(req.params.id, req.user._id);
  if (result.error) return res.status(result.error === "Private channels are invite-only" ? 403 : 404).json({ error: result.error });
  res.json({ channel: result.channel });
});

// POST /api/channels/:id/members { userId } — add another user to a channel.
channelsRouter.post("/:id/members", async (req, res) => {
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "valid channel id and userId are required" });
  }
  const result = await addChannelMember(req.params.id, req.user._id, userId);
  if (result.error) {
    const status = result.error === "User not found" ? 404 : result.error.includes("join") ? 403 : result.error.includes("cannot") || result.error.includes("automatically") ? 400 : 404;
    return res.status(status).json({ error: result.error });
  }
  res.json({ channel: result.channel });
});

// POST /api/channels/:id/managers { userId } — promote a channel member.
channelsRouter.post("/:id/managers", async (req, res) => {
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "valid channel id and userId are required" });
  }
  const result = await promoteChannelManager(req.params.id, req.user._id, userId);
  if (result.error) {
    const status = result.error.includes("Only") ? 403 : result.error.includes("not") ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json({ channel: result.channel });
});

// DELETE /api/channels/:id/members/:userId — the channel creator removes
// another member from the channel.
channelsRouter.delete("/:id/members/:userId", async (req, res) => {
  const { id, userId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "valid channel id and userId are required" });
  }
  const result = await removeChannelMember(id, req.user._id, userId);
  if (result.error) {
    const status = result.error.includes("Only") ? 403 : result.error.includes("cannot") || result.error.includes("general") ? 400 : 404;
    return res.status(status).json({ error: result.error });
  }
  res.json({ channel: result.channel });
});

// POST /api/channels/:id/leave — remove the current user from a channel.
channelsRouter.post("/:id/leave", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const result = await leaveChannel(req.params.id, req.user._id, req.body?.managerId);
  if (result.error) {
    const status = result.error.includes("member") ? 403 : result.error.includes("not found") ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json({ channel: result.channel });
});

// DELETE /api/channels/:id — archive an empty channel owned by the creator.
channelsRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const result = await archiveChannel(req.params.id, req.user._id);
  if (result.error) {
    const status = result.error === "channel not found" ? 404 : result.error.includes("creator") ? 403 : 400;
    return res.status(status).json({ error: result.error });
  }
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
  await markRead({ userId: req.user._id, channelId: req.params.id, threadId: thread });
  res.json({ ok: true });
});

// PATCH /api/channels/:id — update channel settings.
//   { type }                  → change visibility (creator only)
//   { name }                  → rename the channel (creator/managers)
//   { topic } / { description } → update info (any member)
//   { readOnly }              → restrict posting to the creator/managers
channelsRouter.patch("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const { name, type, topic, description, readOnly } = req.body || {};
  const channel = await Channel.findById(req.params.id);
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type === "dm") {
    return res.status(400).json({ error: "cannot change a direct message" });
  }

  const currentName = channel.name;
  let renamed = false;
  if (name !== undefined) {
    if (!isChannelManager(channel, req.user._id)) {
      return res.status(403).json({ error: "only the channel creator or a manager can rename this channel" });
    }
    if (currentName.toLowerCase() === "general") {
      return res.status(400).json({ error: "the general channel cannot be renamed" });
    }
    if (typeof name !== "string") {
      return res.status(400).json({ error: "channel name must be a string" });
    }
    const normalizedName = name.trim().toLowerCase();
    if (!isValidChannelName(normalizedName)) {
      return res.status(400).json({ error: "Channel names must start with a letter and use lowercase letters, numbers, and single dashes" });
    }
    if (normalizedName === "general") {
      return res.status(400).json({ error: "general is reserved for the default channel" });
    }
    if (normalizedName !== currentName) {
      const existing = await Channel.findOne({ name: normalizedName, _id: { $ne: channel._id } }).select({ _id: 1 }).lean();
      if (existing) return res.status(409).json({ error: "channel name already exists" });
      channel.name = normalizedName;
      renamed = true;
    }
  }

  if (readOnly !== undefined) {
    if (typeof readOnly !== "boolean") {
      return res.status(400).json({ error: "readOnly must be a boolean" });
    }
    if (!isChannelManager(channel, req.user._id)) {
      return res.status(403).json({ error: "only the channel creator or a manager can change posting settings" });
    }
    channel.readOnly = readOnly;
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

  try {
    await channel.save();
  } catch (err) {
    // The unique index is the final guard against two managers choosing the
    // same name concurrently.
    if (err?.code === 11000 && (err?.keyPattern?.name || err?.keyValue?.name)) {
      return res.status(409).json({ error: "channel name already exists" });
    }
    throw err;
  }
  if (renamed) await logSystem(channel._id, req.user._id, `renamed this channel to #${channel.name}`);
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
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });

  // Enforce access: private channels and DMs are members-only.
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  const before = req.query.before ? new Date(String(req.query.before)) : undefined;
  const history = await queryChannelHistory({
    channelId: channel._id,
    limit: config.messagePageSize,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    around: req.query.around && mongoose.isValidObjectId(req.query.around) ? req.query.around : undefined,
    forwardNote: req.query.forwardNote ? String(req.query.forwardNote) : undefined,
  });
  if (!history) return res.status(404).json({ error: "message not found" });

  // `docs` is newest-first here; the mapping below reverses it to
  // chronological order (oldest at top) for rendering.
  const { docs, statMap } = history;

  const messages = docs.reverse().map((m) => {
    const s = statMap.get(m._id.toString());
    return {
      ...m.toPublicJSON(),
      replyCount: s?.count || 0,
      lastReplyAt: s?.lastReplyAt || null,
      replyParticipantIds: [...new Set((s?.replyParticipantIds || []).map((id) => id.toString()))].slice(0, 2),
    };
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
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  // Bind the message lookup to the requested channel. Without this condition,
  // a caller who knows a message id could read a private channel's thread by
  // routing the request through any public channel they can access.
  const thread = await getThreadMessages({ channelId: channel._id, messageId: req.params.msgId, resolveParent: false });
  if (!thread) return res.status(404).json({ error: "message not found" });

  res.json({
    parent: thread.root.toPublicJSON(),
    replies: thread.replies.map((reply) => reply.toPublicJSON()),
  });
});

channelsRouter.post("/:id/messages/:msgId/thread-summary", async (req, res) => {
  const aiSettings = await getAISettings();
  if (!aiSettings.enabled) return res.status(404).json({ error: "not found" });
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.msgId)) return res.status(404).json({ error: "thread not found" });
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel || channel.isArchived || !canParticipateInChannel(channel, req.user._id)) return res.status(404).json({ error: "thread not found" });
    const thread = await getThreadMessages({ channelId: channel._id, messageId: req.params.msgId, resolveParent: false, limit: 1001 });
    if (!thread || thread.root.parentId) return res.status(404).json({ error: "thread not found" });
    if (thread.replies.length > 1000) return res.status(413).json({ error: "This thread is too long to summarize." });
    res.json(await summarizeThreadDiscussion(thread, aiSettings));
  } catch (error) {
    console.error("Thread summary request failed:", error.message);
    const timeout = error.name === "TimeoutError";
    res.status(error.status || (timeout ? 504 : 502)).json({ error: error.status ? error.message : timeout ? "The summary request timed out." : "The summary provider could not complete the request. Try again or check the provider configuration." });
  }
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
  const docs = await listPinnedMessages(channel._id);
  res.json({ messages: docs.map((m) => m.toPublicJSON()) });
});

// GET /api/channels/:id/files — attachments in a conversation, newest first.
// Unlike message history this includes thread replies, because a file shared in
// a thread is still shared with the whole conversation.
channelsRouter.get("/:id/files", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "channel not found" });
  }
  const channel = await Channel.findById(req.params.id);
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
  const query = { channel: channel._id, "attachments.0": { $exists: true } };
  if (req.query.before) {
    const before = new Date(String(req.query.before));
    if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
  }
  const docs = await Message.find(query).sort({ createdAt: -1 }).limit(limit).populate("author");
  const files = docs.flatMap((message) => {
    const publicMessage = message.toPublicJSON();
    return publicMessage.attachments.map((attachment) => ({
      ...attachment,
      // Use the public message id explicitly: attachment filenames and object
      // keys can repeat (for example after a forward), but this origin cannot.
      id: `${publicMessage.id}:${attachment.key}`,
      messageId: publicMessage.id,
      createdAt: publicMessage.createdAt,
      author: publicMessage.author,
      parentId: publicMessage.parentId,
    }));
  });
  res.json({ files, nextBefore: docs.length === limit ? docs[docs.length - 1].createdAt : null });
});

// POST /api/channels/:id/messages — send a message (REST equivalent of the
// `message:send` socket event). Body: { body, parentId?, broadcastToChannel?, attachments? }.
channelsRouter.post("/:id/messages", async (req, res) => {
  const text = String(req.body?.body || "").trim();
  const survey = sanitizeSurvey(req.body?.survey);
  const retro = sanitizeRetro(req.body?.retro);
  const card = sanitizeCard(req.body?.card);
  const invalidCard = cardError(req.body?.card);
  if (surveyError(req.body?.survey)) return res.status(400).json({ error: surveyError(req.body?.survey) });
  if (retroError(req.body?.retro)) return res.status(400).json({ error: retroError(req.body?.retro) });
  if (invalidCard) return res.status(400).json({ error: invalidCard });
  const attachmentError = attachmentLimitError(req.body?.attachments);
  if (attachmentError) return res.status(400).json({ error: attachmentError });
  const files = sanitizeAttachments(req.body?.attachments);
  if (!text && files.length === 0 && !survey && !retro && !card) {
    return res.status(400).json({ error: "message needs text, an attachment, or a card" });
  }
  const channelKey = decodeURIComponent(String(req.params.id));
  const channel = mongoose.isValidObjectId(channelKey)
    ? await Channel.findById(channelKey)
    : await Channel.findOne({ name: normalizeChannelName(channelKey) });
  if (!channel || channel.isArchived) return res.status(404).json({ error: "channel not found" });
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  if (!canParticipateInChannel(channel, req.user._id)) {
    return res.status(403).json({ error: "join the channel to participate" });
  }
  if (!canPostToChannel(channel, req.user._id)) {
    return res.status(403).json({ error: "only channel managers can post in this read-only channel" });
  }
  const parentId =
    req.body?.parentId && mongoose.isValidObjectId(req.body.parentId) ? req.body.parentId : null;

  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  const result = await sendMessage({
    channel,
    authorId: req.user._id,
    body: text,
    parentId,
    broadcastToChannel: req.body?.broadcastToChannel,
    attachments: files,
    survey,
    retro,
    card,
    idempotencyKey: idempotencyKey || null,
  });
  res.status(result.idempotent ? 200 : 201).json(result);
});

// POST /api/channels/:channelId/messages/:messageId/survey-vote — replace the
// caller's survey selection. An empty optionIds array clears their vote.
channelsRouter.post("/:id/messages/:messageId/survey-vote", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.messageId)) {
    return res.status(404).json({ error: "survey not found" });
  }
  const channel = await Channel.findById(req.params.id);
  const message = await Message.findById(req.params.messageId);
  if (!channel || !message || String(message.channel) !== String(channel._id) || !message.survey) {
    return res.status(404).json({ error: "survey not found" });
  }
  if (!canParticipateInChannel(channel, req.user._id)) {
    return res.status(403).json({ error: "access denied" });
  }
  try {
    const result = await voteInSurvey({ channel, message, userId: req.user._id, optionIds: req.body?.optionIds });
    res.json({ survey: result.survey });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/channels/:channelId/messages/:messageId/reactions — toggle the
// caller's reaction for an emoji. The response contains the complete reaction
// summary so REST clients and realtime clients can apply the same shape.
channelsRouter.post(["/:id/messages/:messageId/reactions", "/:id/messages/:messageId/reaction"], async (req, res) => {
  const { id, messageId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(messageId)) {
    return res.status(404).json({ error: "message not found" });
  }

  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";
  if (!emoji) return res.status(400).json({ error: "emoji is required" });
  if (emoji.length > 64) return res.status(400).json({ error: "emoji must be 64 characters or fewer" });
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "present") && typeof req.body.present !== "boolean") {
    return res.status(400).json({ error: "present must be a boolean" });
  }

  // Native Unicode emoji are self-contained. A shortcode, however, must
  // resolve to a workspace custom emoji (or one of Echo's built-in Git
  // emoji), otherwise clients would persist a reaction that renders as plain
  // text and cannot be displayed consistently.
  const shortcode = /^:([a-z0-9_-]{2,32}):$/i.exec(emoji);
  if (shortcode) {
    const builtIn = new Set([
      "git", "git-branch", "git-commit", "git-merge", "git-pull-request",
      "git-pull-request-closed", "merged", "github",
    ]);
    const custom = await CustomEmoji.exists({ name: shortcode[1].toLowerCase() });
    if (!custom && !builtIn.has(shortcode[1].toLowerCase())) {
      return res.status(404).json({ error: `custom emoji :${shortcode[1]}: not found` });
    }
  }

  const channel = await Channel.findById(id);
  const message = await Message.findOne({ _id: messageId, channel: id });
  if (!channel || channel.isArchived || !message) {
    return res.status(404).json({ error: "message not found" });
  }
  if (!canParticipateInChannel(channel, req.user._id)) {
    return res.status(403).json({ error: "access denied" });
  }

  const userId = req.user._id;
  const result = await reactToMessage({
    channel,
    message,
    userId,
    emoji,
    present: Object.prototype.hasOwnProperty.call(req.body || {}, "present") ? req.body.present : undefined,
  });
  res.json({ messageId: result.message._id.toString(), reactions: result.reactions, added: result.added, present: result.present, changed: result.changed });
});
