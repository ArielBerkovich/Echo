import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";

export type ConversationActor = string | { toString(): string };

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
