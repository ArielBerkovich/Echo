import { Message } from "../models/Message.js";

export type MessageHistoryActor = string | { toString(): string };

export async function queryChannelHistory({ channelId, limit, before, around, forwardNote, includeBroadcastReplies = true, includeReplyStats = true }: {
  channelId: MessageHistoryActor;
  limit: number;
  before?: Date;
  around?: MessageHistoryActor;
  forwardNote?: string;
  includeBroadcastReplies?: boolean;
  includeReplyStats?: boolean;
}) {
  const base: Record<string, unknown> = {
    channel: channelId,
    ...(includeBroadcastReplies
      ? { $or: [{ parentId: null }, { parentId: { $ne: null }, broadcastToChannel: true }] }
      : { parentId: null }),
  };
  if (forwardNote !== undefined) base.forwardNote = forwardNote;

  let docs;
  if (around) {
    const target = await Message.findOne({ _id: around, ...base });
    if (!target) return null;
    const half = Math.floor(limit / 2);
    const [olderOrEqual, newer] = await Promise.all([
      Message.find({ ...base, createdAt: { $lte: target.createdAt } })
        .sort({ createdAt: -1 })
        .limit(half + 1)
        .populate("author"),
      Message.find({ ...base, createdAt: { $gt: target.createdAt } })
        .sort({ createdAt: -1 })
        .limit(half)
        .populate("author"),
    ]);
    docs = [...newer, ...olderOrEqual];
  } else {
    const query = { ...base };
    if (before) query.createdAt = { $lt: before };
    docs = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("author");
  }

  if (!includeReplyStats) return { docs, statMap: new Map() };

  const ids = docs.map((message) => message._id);
  const stats = await Message.aggregate([
    { $match: { parentId: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$parentId",
        count: { $sum: 1 },
        lastReplyAt: { $max: "$createdAt" },
        replyParticipantIds: { $push: "$author" },
      },
    },
  ]);
  const statMap = new Map(stats.map((stat) => [stat._id.toString(), stat]));
  return { docs, statMap };
}
