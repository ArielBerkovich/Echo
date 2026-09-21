import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { Group, GroupMembership, getGroup, groupSummary, listGroups, groupUsers } from "../groupDirectory.js";

export const groupsRouter = Router();
groupsRouter.use(requireAuth);
const validId = (value) => mongoose.isValidObjectId(value);
const objectId = (value) => new mongoose.Types.ObjectId(value);
const handlePattern = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const activeGroup = (groupId) => validId(groupId) ? Group.findOne({ _id: groupId, archivedAt: null, deletedAt: null }) : null;
const membership = (groupId, userId) => GroupMembership.findOne({ group: groupId, user: userId });
const groupNameMatch = (name, excludedId = null) => ({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }, ...(excludedId ? { _id: { $ne: excludedId } } : {}) });

async function handleForName(name) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "group";
  const normalized = base.length > 1 ? base : `${base}-group`;
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? normalized : `${normalized.slice(0, 32 - String(suffix + 1).length - 1)}-${suffix + 1}`;
    if (!await Group.exists({ handle: candidate })) return candidate;
  }
  throw new Error("could not generate a unique group handle");
}

async function requireMember(req, res) {
  const group = await activeGroup(req.params.groupId);
  if (!group) { res.status(404).json({ error: "group not found" }); return null; }
  if (!await membership(group._id, req.user._id)) { res.status(403).json({ error: "group member only" }); return null; }
  return group;
}

groupsRouter.get("/", async (req, res) => res.json({ groups: await listGroups(req.user._id) }));

groupsRouter.post("/", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const memberIds = [...new Set(Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [])];
  if (name.length < 1 || name.length > 80 || description.length > 160 || memberIds.some((id) => !validId(id))) return res.status(400).json({ error: "invalid group name, description, or member list" });
  try {
    if (await Group.exists(groupNameMatch(name))) return res.status(409).json({ error: "a group with that name already exists" });
    const invitedUsers = memberIds.length ? await groupUsers(memberIds) : [];
    if (invitedUsers.length !== memberIds.length) return res.status(404).json({ error: "one or more selected users could not be found" });
    const handle = await handleForName(name);
    const group = await Group.create({ name, handle, description, owner: req.user._id, createdBy: req.user._id });
    await GroupMembership.insertMany([
      { group: group._id, user: req.user._id, role: "owner" },
      ...memberIds.filter((id) => String(id) !== String(req.user._id)).map((id) => ({ group: group._id, user: objectId(id), role: "member" })),
    ]);
    res.status(201).json({ group: await groupSummary(group, req.user._id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: error.keyPattern?.name ? "a group with that name already exists" : "that group handle is already in use" });
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
  try {
    if (await Group.exists(groupNameMatch(group.name, group._id))) return res.status(409).json({ error: "a group with that name already exists" });
    await group.save();
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: error.keyPattern?.name ? "a group with that name already exists" : "that group handle is already in use" });
    throw error;
  }
  res.json({ group: await groupSummary(group, req.user._id) });
});

groupsRouter.delete("/:groupId", async (req, res) => {
  const group = await activeGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: "group not found" });
  if (!group.owner.equals(req.user._id) && !req.user.isAdmin) return res.status(403).json({ error: "group owner or admin only" });
  group.deletedAt = new Date(); group.archivedBy = req.user._id; await group.save();
  await GroupMembership.deleteMany({ group: group._id });
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
    await GroupMembership.deleteMany({ group: group._id });
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
