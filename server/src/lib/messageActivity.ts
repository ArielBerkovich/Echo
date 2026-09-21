import mongoose from "mongoose";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { UserAlias } from "../models/UserAlias.js";
import { resolveGroupMentions } from "../groupDirectory.js";
import { Channel } from "../models/Channel.js";

const MENTION_RE = /@([a-z0-9_.-]+(?:\\_[a-z0-9_.-]+)*)/gi;
const CHANNEL_MENTION_RE = /#([a-z0-9_-]+)/gi;

function normalizeEscapedHandle(handle) {
  return String(handle || "").replace(/\\_/g, "_").toLowerCase();
}

export function extractMentionHandles(body) {
  const handles = new Set();
  for (const match of String(body || "").matchAll(MENTION_RE)) {
    const handle = normalizeEscapedHandle(match[1]);
    if (handle && handle !== "everyone") handles.add(handle);
  }
  return [...handles];
}

export function mentionsEveryone(body) {
  return /(?:^|[^\w.-])@everyone(?=$|[\s,;:!?()[\]{}"']|\.(?:\s|$))/i.test(String(body || ""));
}

export async function buildMessageActivityMetadata({ body, parentId, authorId }) {
  const [mentionedUsers, root, mentionedGroups, mentionedChannels] = await Promise.all([
    findMentionedUsers(body),
    parentId && mongoose.isValidObjectId(parentId)
      ? Message.findById(parentId, { author: 1 }).lean()
      : Promise.resolve(null),
    // Group mentions are resolved to an ID snapshot; stale or archived IDs
    // remain ordinary text for new messages.
    resolveGroupMentions(body).catch(() => []),
    findMentionedChannels(body, authorId),
  ]);

  return {
    mentionedUserIds: mentionedUsers.map((user) => user._id),
    mentionedGroups,
    mentionedChannels,
    mentionsEveryone: mentionsEveryone(body),
    threadRootAuthor: root?.author || null,
  };
}

async function findMentionedChannels(body, authorId) {
  const names = [...new Set([...String(body || "").matchAll(CHANNEL_MENTION_RE)].map((match) => match[1].toLowerCase()))];
  if (!names.length || !authorId) return [];
  const channels = await Channel.find({ name: { $in: names }, isArchived: false, type: { $in: ["public", "private"] } }, { _id: 1, name: 1, type: 1, members: 1 }).lean();
  return channels
    .filter((channel) => channel.type === "public" || channel.members.some((member) => String(member) === String(authorId)))
    .map((channel) => ({ channelId: channel._id, name: channel.name }));
}

async function findMentionedUsers(body) {
  const handles = extractMentionHandles(body);
  if (!handles.length) return [];
  const [users, aliases] = await Promise.all([
    User.find({ username: { $in: handles } }, { _id: 1 }).lean(),
    UserAlias.find({ aliasUsername: { $in: handles } }, { user: 1 }).lean(),
  ]);
  const ids = new Map(users.map((user) => [user._id.toString(), user._id]));
  for (const alias of aliases) ids.set(alias.user.toString(), alias.user);
  return [...ids.values()].map((_id) => ({ _id }));
}
