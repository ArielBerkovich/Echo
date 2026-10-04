import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { User } from "../models/User.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { isValidChannelName } from "../lib/channelName.js";
import { ensureDmChannel, ensureGroupDmChannel, ensureSelfDmChannel, listDmConversations } from "../services/conversationService.js";

export const dmsRouter = Router();
dmsRouter.use(requireAuth);
const MAX_GROUP_DM_MEMBERS = 10;

// GET /api/dms — the user's visible DM conversations, most-recent first.
dmsRouter.get("/", async (req, res) => {
  const result = await listDmConversations({ userId: req.user._id, vips: req.user.vips || [], includeMetadata: true });
  res.json({ conversations: result.conversations });
});

function isGroupDm(channel) {
  return channel.type === "dm" && channel.members.length > 2;
}

function canManageGroupDm(channel, userId) {
  return isGroupDm(channel)
    && channel.createdBy.equals(userId)
    && channel.members.some((memberId) => memberId.equals(userId));
}

// PATCH /api/dms/:id — rename a group DM.
dmsRouter.patch("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "conversation not found" });
  }
  const channel = await Channel.findOne({ _id: req.params.id, type: "dm", members: req.user._id });
  if (!channel) return res.status(404).json({ error: "conversation not found" });
  if (!canManageGroupDm(channel, req.user._id)) {
    return res.status(403).json({ error: "only the group DM creator can manage this conversation" });
  }
  const name = String(req.body?.name || "").trim();
  if (!name || name.length > 64 || !/^[a-z0-9_-]+$/i.test(name)) {
    return res.status(400).json({ error: "group DM names may contain only English letters (A-Z), numbers, dashes, and underscores" });
  }
  const existing = await Channel.findOne({ name: name.toLowerCase(), _id: { $ne: channel._id } });
  if (existing) return res.status(409).json({ error: "that conversation name is already in use" });
  channel.name = name.toLowerCase();
  await channel.save();
  res.json({ channel: channel.toPublicJSON(), isGroup: true });
});

// POST /api/dms/:id/convert — turn a group DM into a private channel without
// changing its ID, members, messages, or links.
dmsRouter.post("/:id/convert", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "conversation not found" });
  }
  const channel = await Channel.findOne({ _id: req.params.id, type: "dm", members: req.user._id });
  if (!channel) return res.status(404).json({ error: "conversation not found" });
  if (!canManageGroupDm(channel, req.user._id)) {
    return res.status(403).json({ error: "only the group DM creator can convert this conversation" });
  }
  const name = String(req.body?.name || "").trim().toLowerCase();
  if (!isValidChannelName(name)) {
    return res.status(400).json({ error: "channel names cannot contain underscores, consecutive dashes, or start/end with a dash" });
  }
  const existing = await Channel.findOne({ name, _id: { $ne: channel._id } });
  if (existing) return res.status(409).json({ error: "that channel name is already in use" });
  channel.type = "private";
  channel.name = name;
  channel.managers = [channel.createdBy];
  if (req.body?.topic !== undefined) channel.topic = String(req.body.topic).trim().slice(0, 250);
  if (req.body?.description !== undefined) channel.description = String(req.body.description).trim().slice(0, 2000);
  await channel.save();
  await Message.create({
    channel: channel._id,
    author: req.user._id,
    body: `converted this group DM to private channel #${channel.name}`,
    kind: "system",
  });
  res.json({ channel: channel.toPublicJSON(), converted: true });
});

// DELETE /api/dms/:id — remove a DM from the current user's sidebar.
dmsRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "conversation not found" });
  }
  await Channel.updateOne(
    { _id: req.params.id, type: "dm", members: req.user._id },
    { $addToSet: { hiddenFor: req.user._id } }
  );
  res.json({ ok: true });
});

// POST /api/dms { userId } — open (or create) a DM with another user, or with
// yourself (a personal notes/scratchpad conversation).
dmsRouter.post("/", async (req, res) => {
  const { userId, userIds } = req.body || {};
  const requestedIds = Array.isArray(userIds) ? userIds : [userId];
  if (!requestedIds.length || requestedIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ error: "valid userId or userIds are required" });
  }
  const uniqueIds = [...new Set(requestedIds.map(String))];
  // userIds contains people other than the current user, so leave room for
  // the initiator in the total group-DM member limit.
  if (uniqueIds.length > MAX_GROUP_DM_MEMBERS - 1) {
    return res.status(400).json({ error: `group DMs are limited to ${MAX_GROUP_DM_MEMBERS} people` });
  }
  const isGroup = uniqueIds.length > 1;
  if (isGroup && uniqueIds.includes(String(req.user._id))) {
    return res.status(400).json({ error: "select people other than yourself" });
  }

  const isSelf = !isGroup && uniqueIds[0] === String(req.user._id);
  const people = isSelf ? [req.user] : await User.find({ _id: { $in: uniqueIds } });
  if (people.length !== uniqueIds.length) return res.status(404).json({ error: "user not found" });
  const other = isSelf ? req.user : people.find((person) => String(person._id) === uniqueIds[0]);

  let channel;
  if (isSelf) {
    channel = await ensureSelfDmChannel(req.user._id);
  } else if (isGroup) {
    channel = await ensureGroupDmChannel(req.user._id, uniqueIds);
  } else {
    channel = await ensureDmChannel(req.user._id, other._id);
  }

  const read = await Read.findOne({ user: req.user._id, channel: channel._id, thread: null });
  const unread = isSelf
    ? 0
    : await Message.countDocuments({
        channel: channel._id,
        author: { $ne: req.user._id },
        createdAt: { $gt: read?.lastReadAt || new Date(0) },
      });

  res.json({
    channel: { ...channel.toPublicJSON(), unread },
    withUser: other.toPublicJSON(),
    participants: people.map((person) => person.toPublicJSON()),
    isSelf,
    isGroup,
  });
});
