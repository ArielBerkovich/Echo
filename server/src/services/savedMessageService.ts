import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

export type SavedMessageActor = string | { toString(): string };

function canAccess(channel, userId: SavedMessageActor) {
  return channel.type === "public" || channel.members.some((member) => member.equals(userId));
}

export async function listSavedMessages({ userId, limit, includeContext = false, excludeArchived = false }: {
  userId: SavedMessageActor;
  limit?: number;
  includeContext?: boolean;
  excludeArchived?: boolean;
}) {
  const user = await User.findById(userId);
  if (!user) return null;

  const ids = (user.savedMessages || []).slice().reverse();
  if (ids.length === 0) return { messages: [], items: [] };

  const docs = await Message.find({ _id: { $in: ids } }).populate("author");
  const byId = new Map(docs.map((message) => [message._id.toString(), message]));
  const channelIds = [...new Set(docs.map((message) => message.channel.toString()))];
  const channels = await Channel.find({ _id: { $in: channelIds } });
  const channelMap = new Map(channels.map((channel) => [channel._id.toString(), channel]));

  const visible = ids
    .map((id) => {
      const message = byId.get(id.toString());
      const channel = message && channelMap.get(message.channel.toString());
      if (!message || !channel || (excludeArchived && channel.isArchived) || !canAccess(channel, userId)) return null;
      return { message, channel };
    })
    .filter(Boolean)
    .slice(0, limit === undefined ? undefined : limit);

  const messages = visible.map(({ message }) => message);
  if (!includeContext) return { messages, items: [] };

  const dmOtherIds = visible
    .map(({ channel }) => channel)
    .filter((channel) => channel.type === "dm")
    .map((channel) => channel.members.find((member) => !member.equals(userId)))
    .filter(Boolean);
  const others = await User.find({ _id: { $in: dmOtherIds } });
  const otherMap = new Map(others.map((other) => [other._id.toString(), other]));
  const items = visible.map(({ message, channel }) => {
    let channelName = channel.name;
    if (channel.type === "dm") {
      const other = channel.members.find((member) => !member.equals(userId));
      channelName = other ? otherMap.get(other.toString())?.displayName || "Direct message" : "Direct message";
    }
    return {
      ...message.toPublicJSON(),
      channelName,
      channelType: channel.type,
      threadId: message.parentId ? message.parentId.toString() : null,
    };
  });
  return { messages, items };
}
