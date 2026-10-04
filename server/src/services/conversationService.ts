import { createHash } from "node:crypto";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";

export type ConversationActor = string | { toString(): string };

export function dmName(a: ConversationActor | ConversationActor[], b?: ConversationActor) {
  const ids = (Array.isArray(a) ? a : [a, b]).map(String).sort();
  const signature = ids.join("-");
  const readableName = `dm-${signature}`;
  if (readableName.length <= 64) return readableName;
  return `dm-${createHash("sha256").update(signature).digest("hex").slice(0, 60)}`;
}

export async function ensureGroupDmChannel(currentUserId: ConversationActor, otherUserIds: ConversationActor[]) {
  const memberIds = [...new Set([currentUserId, ...otherUserIds].map(String))];
  const name = dmName(memberIds);
  const candidates = await Channel.find({ type: "dm", members: { $all: memberIds } });
  const memberSet = new Set(memberIds);
  const existing = candidates.find(
    (candidate) => candidate.members.length === memberSet.size
      && candidate.members.every((member) => memberSet.has(String(member)))
  );
  if (existing) {
    return Channel.findOneAndUpdate(
      { _id: existing._id },
      { $pull: { hiddenFor: currentUserId } },
      { new: true }
    );
  }
  return Channel.create({ name, type: "dm", members: memberIds, createdBy: currentUserId });
}

export function ensureDmChannel(currentUserId: ConversationActor, otherUserId: ConversationActor) {
  const name = dmName(currentUserId, otherUserId);
  return Channel.findOneAndUpdate(
    { name },
    {
      $setOnInsert: { name, type: "dm", members: [currentUserId, otherUserId], createdBy: currentUserId },
      $pull: { hiddenFor: currentUserId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: false }
  );
}

export async function ensureSelfDmChannel(userId: ConversationActor) {
  const name = `dm-self-${userId}`;
  const channel = await Channel.findOne({ name });
  if (channel) {
    await Channel.updateOne({ _id: channel._id }, { $pull: { hiddenFor: userId } });
    return Channel.findById(channel._id);
  }
  return Channel.create({ name, type: "dm", members: [userId], createdBy: userId });
}

export async function listDmConversations({ userId, vips = [], includeMetadata = false }: {
  userId: ConversationActor;
  vips?: ConversationActor[];
  includeMetadata?: boolean;
}) {
  if (!includeMetadata) {
    const channels = await Channel.find({ type: "dm", members: userId }).sort({ updatedAt: -1 });
    return { channels, conversations: [] };
  }

  const dms = await Channel.find({
    type: "dm",
    members: userId,
    $or: [
      { hiddenFor: { $ne: userId } },
      { members: { $in: vips } },
    ],
  }).populate("members");

  const ids = dms.map((channel) => channel._id);
  const reads = await Read.find({ user: userId, channel: { $in: ids }, thread: null });
  const readMap = new Map(reads.map((read) => [read.channel.toString(), read.lastReadAt]));

  const [lasts, counts] = ids.length
    ? await Promise.all([
        Message.aggregate([
          { $match: { channel: { $in: ids } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: "$channel", body: { $first: "$body" }, createdAt: { $first: "$createdAt" }, author: { $first: "$author" } } },
        ]),
        Message.aggregate([
          { $match: { $or: ids.map((id) => ({ channel: id, author: { $ne: userId }, createdAt: { $gt: readMap.get(id.toString()) || new Date(0) } })) } },
          { $group: { _id: "$channel", unread: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const lastMap = new Map(lasts.map((last) => [last._id.toString(), last]));
  const countMap = new Map(counts.map((count) => [count._id.toString(), count.unread]));

  const conversations = dms.map((channel) => {
    const isSelf = channel.name?.startsWith("dm-self-");
    const participants = channel.members.filter((member) => !member._id.equals(userId));
    const other = isSelf ? channel.members[0] : (participants[0] || channel.members[0]);
    const last = lastMap.get(channel._id.toString());
    return {
      id: channel._id.toString(),
      name: channel.name,
      memberCount: channel.members.length,
      createdBy: channel.createdBy?.toString() || null,
      withUser: other.toPublicJSON(),
      participants: channel.members.map((member) => member.toPublicJSON()),
      isGroup: !isSelf && participants.length > 1,
      isSelf,
      lastAt: last?.createdAt || channel.createdAt,
      lastBody: last?.body || null,
      lastFromMe: last ? String(last.author) === String(userId) : false,
      unread: countMap.get(channel._id.toString()) || 0,
    };
  });

  conversations.sort((left, right) => new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime());
  return { channels: [], conversations };
}
