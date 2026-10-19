import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

export type MessageSearchActor = string | { toString(): string };

export function escapeSearchRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchMessages({ userId, channelId, excludeArchived = false, terms = [], authorId, has, skip = 0, limit }: {
  userId: MessageSearchActor;
  channelId?: MessageSearchActor;
  excludeArchived?: boolean;
  terms?: string[];
  authorId?: MessageSearchActor;
  has?: string | null;
  skip?: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {
    kind: { $ne: "system" },
  };
  if (channelId) filter.channel = channelId;
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
  return Message.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: Channel.collection.name,
        let: { channelId: "$channel" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$channelId"] } } },
          { $match: { $or: [{ type: "public" }, { members: userId }], ...(excludeArchived ? { isArchived: false } : {}) } },
          ...(channelId ? [{ $match: { _id: channelId } }] : []),
          { $project: { name: 1, type: 1 } },
        ],
        as: "channelInfo",
      },
    },
    { $unwind: "$channelInfo" },
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: User.collection.name,
        localField: "author",
        foreignField: "_id",
        pipeline: [{ $project: {
          username: 1,
          displayName: 1,
          avatarUrlOverride: 1,
          avatarKey: 1,
          isAdmin: 1,
          deprecated: 1,
          authOrigin: 1,
          rhssoSubject: 1,
          mustResetPassword: 1,
          onboarded: 1,
        } }],
        as: "authorInfo",
      },
    },
    { $unwind: { path: "$authorInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        channel: "$channelInfo._id",
        channelName: "$channelInfo.name",
        channelType: "$channelInfo.type",
        parentId: 1,
        body: 1,
        createdAt: 1,
        authorInfo: 1,
      },
    },
  ]);
}
