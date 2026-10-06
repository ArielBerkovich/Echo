import { Message } from "../models/Message.js";

export type MessageQueryActor = string | { toString(): string };

export function findMessageInChannel({ channelId, messageId }: {
  channelId: MessageQueryActor;
  messageId: MessageQueryActor;
}) {
  return Message.findOne({ _id: messageId, channel: channelId }).populate("author");
}

export async function getThreadMessages({ channelId, messageId, resolveParent = true, limit = 50 }: {
  channelId: MessageQueryActor;
  messageId: MessageQueryActor;
  resolveParent?: boolean;
  limit?: number;
}) {
  const root = await Message.findOne({ _id: messageId, channel: channelId }).populate("author");
  if (!root) return null;
  const threadRootId = resolveParent && root.parentId ? root.parentId : root._id;
  const actualRoot = resolveParent && root.parentId
    ? await Message.findOne({ _id: threadRootId, channel: channelId }).populate("author")
    : root;
  if (!actualRoot) return null;
  const replies = await Message.find({ channel: channelId, parentId: threadRootId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate("author");
  return { root: actualRoot, replies };
}

export function listPinnedMessages(channelId: MessageQueryActor, limit = 50) {
  return Message.find({ channel: channelId, pinnedAt: { $ne: null } })
    .sort({ pinnedAt: 1 })
    .limit(limit)
    .populate("author");
}
