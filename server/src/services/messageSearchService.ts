import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";

export type MessageSearchActor = string | { toString(): string };

export function escapeSearchRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function findSearchableChannels({ userId, excludeArchived = false }: {
  userId: MessageSearchActor;
  excludeArchived?: boolean;
}) {
  return Channel.find({
    ...(excludeArchived ? { isArchived: false } : {}),
    $or: [{ type: "public" }, { members: userId }],
  }, { _id: 1, name: 1, type: 1 });
}

export async function searchMessages({ channelIds, terms = [], authorId, has, skip = 0, limit }: {
  channelIds: MessageSearchActor[];
  terms?: string[];
  authorId?: MessageSearchActor;
  has?: string | null;
  skip?: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {
    channel: { $in: channelIds },
    kind: { $ne: "system" },
  };
  if (authorId) filter.author = authorId;
  if (has === "file") filter["attachments.0"] = { $exists: true };
  else if (has === "image") filter.attachments = { $elemMatch: { isImage: true } };
  else if (has === "link") filter.body = { $regex: /https?:\/\//i };
  if (terms.length) {
    filter.$and = terms
      .filter(Boolean)
      .slice(0, 10)
      .map((term) => ({ body: { $regex: escapeSearchRegex(term), $options: "i" } }));
  }
  return Message.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("author");
}
