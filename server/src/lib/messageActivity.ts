import mongoose from "mongoose";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

const MENTION_RE = /@([\w.-]+)/g;

export function extractMentionHandles(body) {
  const handles = new Set();
  for (const match of String(body || "").matchAll(MENTION_RE)) {
    const handle = match[1].toLowerCase();
    if (handle && handle !== "everyone") handles.add(handle);
  }
  return [...handles];
}

export function mentionsEveryone(body) {
  return /(?:^|[^\w.-])@everyone(?=$|[\s,;:!?()[\]{}"']|\.(?:\s|$))/i.test(String(body || ""));
}

export async function buildMessageActivityMetadata({ body, parentId }) {
  const [mentionedUsers, root] = await Promise.all([
    findMentionedUsers(body),
    parentId && mongoose.isValidObjectId(parentId)
      ? Message.findById(parentId, { author: 1 }).lean()
      : Promise.resolve(null),
  ]);

  return {
    mentionedUserIds: mentionedUsers.map((u) => u._id),
    mentionsEveryone: mentionsEveryone(body),
    threadRootAuthor: root?.author || null,
  };
}

async function findMentionedUsers(body) {
  const handles = extractMentionHandles(body);
  if (!handles.length) return [];
  return User.find({ username: { $in: handles } }, { _id: 1 }).lean();
}
