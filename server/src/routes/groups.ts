import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { Channel } from "../models/Channel.js";
import { Group, GroupChannel, GroupMembership, getGroup, groupSummary, listGroups, groupUsers } from "../groupDirectory.js";

export const groupsRouter = Router();
groupsRouter.use(requireAuth);
const validId = (value) => mongoose.isValidObjectId(value);
const objectId = (value) => new mongoose.Types.ObjectId(value);
const handlePattern = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const activeGroup = (groupId) => validId(groupId) ? Group.findOne({ _id: groupId, archivedAt: null, deletedAt: null }) : null;
const membership = (groupId, userId) => GroupMembership.findOne({ group: groupId, user: userId });

async function requireMember(req, res) {
  const group = await activeGroup(req.params.groupId);
  if (!group) { res.status(404).json({ error: "group not found" }); return null; }
  if (!await membership(group._id, req.user._id)) { res.status(403).json({ error: "group member only" }); return null; }
  return group;
}

groupsRouter.get("/", async (req, res) => res.json({ groups: await listGroups(req.user._id) }));

groupsRouter.post("/", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const handle = String(req.body?.handle || "").trim().toLowerCase();
  if (name.length < 1 || name.length > 80 || !handlePattern.test(handle)) return res.status(400).json({ error: "name and a valid 2-32 character handle are required" });
  try {
    const group = await Group.create({ name, handle, description: String(req.body?.description || "").trim(), owner: req.user._id, createdBy: req.user._id });
    await GroupMembership.create({ group: group._id, user: req.user._id, role: "owner" });
    res.status(201).json({ group: await groupSummary(group, req.user._id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "that group handle is already in use" });
    throw error;
  }
});

groupsRouter.get("/:groupId", async (req, res) => {
  const group = await getGroup(req.params.groupId, req.user._id);
  if (!group) return res.status(404).json({ error: "group not found" });
  res.json({ group });
});

groupsRouter.patch("/:groupId", async (req, res) => {
  const group = await activeGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: "group not found" });
  if (!group.owner.equals(req.user._id)) return res.status(403).json({ error: "group owner only" });
  if (req.body?.name !== undefined) group.name = String(req.body.name).trim();
  if (req.body?.description !== undefined) group.description = String(req.body.description).trim();
  if (req.body?.handle !== undefined) group.handle = String(req.body.handle).trim().toLowerCase();
  if (!group.name || group.name.length > 80 || !handlePattern.test(group.handle)) return res.status(400).json({ error: "invalid group name or handle" });
  try { await group.save(); } catch (error) { if (error?.code === 11000) return res.status(409).json({ error: "that group handle is already in use" }); throw error; }
  res.json({ group: await groupSummary(group, req.user._id) });
});

groupsRouter.delete("/:groupId", async (req, res) => {
  const group = await activeGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: "group not found" });
  if (!group.owner.equals(req.user._id) && !req.user.isAdmin) return res.status(403).json({ error: "group owner or admin only" });
  group.deletedAt = new Date(); group.archivedBy = req.user._id; await group.save();
  await Promise.all([GroupMembership.deleteMany({ group: group._id }), GroupChannel.deleteMany({ group: group._id })]);
  res.json({ ok: true });
});

groupsRouter.get("/:groupId/members", async (req, res) => {
  if (!await requireMember(req, res)) return;
  const rows = await GroupMembership.find({ group: req.params.groupId }).populate("user").sort({ createdAt: 1 });
  res.json({ members: rows.filter((row) => row.user).map((row) => ({ ...row.user.toPublicJSON(), role: row.role })) });
});

groupsRouter.post("/:groupId/members", async (req, res) => {
  const group = await requireMember(req, res); if (!group) return;
  const userId = req.body?.userId;
  if (!validId(userId)) return res.status(400).json({ error: "valid user id is required" });
  if (!(await groupUsers([userId])).length) return res.status(404).json({ error: "user not found" });
  await GroupMembership.updateOne({ group: group._id, user: objectId(userId) }, { $setOnInsert: { role: "member" } }, { upsert: true });
  res.json({ group: await groupSummary(group, req.user._id) });
});

async function removeMember(req, res, self) {
  const group = await requireMember(req, res); if (!group) return;
  const userId = self ? req.user._id : req.params.userId;
  if (!self && !validId(userId)) return res.status(400).json({ error: "valid user id is required" });
  const target = await membership(group._id, userId);
  if (!target) return res.status(404).json({ error: "member not found" });
  const count = await GroupMembership.countDocuments({ group: group._id });
  if (count === 1) {
    group.archivedAt = new Date(); group.archivedBy = req.user._id; await group.save();
    await Promise.all([GroupMembership.deleteMany({ group: group._id }), GroupChannel.deleteMany({ group: group._id })]);
    return res.json({ archived: true });
  }
  if (target.role === "owner") {
    const replacement = req.body?.replacementOwnerId || (!self ? req.user._id : null);
    if (!validId(replacement) || String(replacement) === String(userId) || !await membership(group._id, replacement)) return res.status(400).json({ error: "choose a remaining member as the replacement owner" });
    await GroupMembership.updateOne({ group: group._id, user: replacement }, { $set: { role: "owner" } });
    group.owner = replacement; await group.save();
  }
  await GroupMembership.deleteOne({ group: group._id, user: userId });
  res.json({ group: await groupSummary(group, req.user._id) });
}
groupsRouter.post("/:groupId/leave", (req, res) => removeMember(req, res, true));
groupsRouter.delete("/:groupId/members/:userId", (req, res) => removeMember(req, res, false));

groupsRouter.post("/:groupId/transfer", async (req, res) => {
  const group = await requireMember(req, res); if (!group) return;
  if (!group.owner.equals(req.user._id)) return res.status(403).json({ error: "group owner only" });
  const target = req.body?.userId;
  if (!validId(target) || !await membership(group._id, target)) return res.status(400).json({ error: "choose a group member" });
  await GroupMembership.updateOne({ group: group._id, user: req.user._id }, { $set: { role: "member" } });
  await GroupMembership.updateOne({ group: group._id, user: target }, { $set: { role: "owner" } });
  group.owner = target; await group.save(); res.json({ group: await groupSummary(group, req.user._id) });
});

groupsRouter.get("/:groupId/channels", async (req, res) => {
  if (!await requireMember(req, res)) return;
  const group = await getGroup(req.params.groupId, req.user._id); res.json({ channels: group.channels });
});

groupsRouter.post("/:groupId/channels", async (req, res) => {
  const group = await requireMember(req, res); if (!group) return;
  if (!group.owner.equals(req.user._id)) return res.status(403).json({ error: "group owner only" });
  const channel = await Channel.findOne({ _id: req.body?.channelId, isArchived: false, type: { $in: ["public", "private"] } });
  if (!channel) return res.status(404).json({ error: "channel not found" });
  if (channel.type === "private" && !channel.members.some((userId) => userId.equals(req.user._id))) return res.status(403).json({ error: "you cannot assign a private channel you cannot access" });
  await GroupChannel.updateOne({ group: group._id, channel: channel._id }, { $setOnInsert: { createdBy: req.user._id } }, { upsert: true });
  res.json({ group: await groupSummary(group, req.user._id) });
});

groupsRouter.delete("/:groupId/channels/:channelId", async (req, res) => {
  const group = await requireMember(req, res); if (!group) return;
  if (!group.owner.equals(req.user._id)) return res.status(403).json({ error: "group owner only" });
  await GroupChannel.deleteOne({ group: group._id, channel: req.params.channelId }); res.json({ group: await groupSummary(group, req.user._id) });
});
