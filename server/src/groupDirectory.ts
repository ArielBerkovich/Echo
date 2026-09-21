import mongoose from "mongoose";
import { Group, GroupMembership } from "./models/Group.js";
import { User } from "./models/User.js";

export const GROUP_PROVIDER = "echo";
export async function groupSummary(group, userId) {
  const [memberships, viewer] = await Promise.all([
    GroupMembership.find({ group: group._id }).populate("user").sort({ createdAt: 1 }),
    User.findById(userId, { isAdmin: 1 }).lean(),
  ]);
  const members = memberships.filter((item) => item.user).map((item) => ({ ...item.user.toPublicJSON(), role: item.role }));
  return { ...group.toPublicJSON(), memberCount: members.length, members, currentUserId: String(userId), isMember: memberships.some((item) => String(item.user?._id) === String(userId)), currentUserRole: memberships.find((item) => String(item.user?._id) === String(userId))?.role || null, canDelete: !!viewer?.isAdmin || String(group.owner) === String(userId) };
}

export async function listGroups(userId) {
  const groups = await Group.find({ archivedAt: null, deletedAt: null }).sort({ name: 1 });
  const summaries = await Promise.all(groups.map((group) => groupSummary(group, userId)));
  return summaries.sort((left, right) => {
    if (left.isMember !== right.isMember) return left.isMember ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export async function getGroup(id, userId) {
  if (!mongoose.isValidObjectId(id)) return null;
  const group = await Group.findOne({ _id: id, deletedAt: null, archivedAt: null });
  return group ? groupSummary(group, userId) : null;
}

export async function resolveGroupMentions(body) {
  const ids = [...new Set([...String(body || "").matchAll(/@group\.(?:(echo)\.)?([a-f\d]{24})\b/gi)].map((match) => match[2]))].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return [];
  const groups = await Group.find({ _id: { $in: ids }, archivedAt: null, deletedAt: null });
  return Promise.all(groups.map(async (group) => {
    const members = await GroupMembership.find({ group: group._id }, { user: 1 });
    return { provider: GROUP_PROVIDER, id: group._id.toString(), name: group.name, path: `@${group.handle}`, memberCount: members.length, echoMemberIds: members.map((item) => item.user) };
  }));
}

export async function groupUsers(ids) {
  return User.find({ _id: { $in: ids }, username: { $ne: "system" } });
}

export { Group, GroupMembership };
