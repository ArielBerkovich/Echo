import { Channel } from "../models/Channel.js";

// Deterministic channel name for the DM between two users, regardless of order.
export function dmName(a, b) {
  const ids = Array.isArray(a) ? a : [a, b];
  return `dm-${ids.map(String).sort().join("-")}`;
}

// Group DMs use the same deterministic naming scheme as one-to-one DMs. The
// member set, rather than the order in which people were selected, identifies
// the conversation.
export function ensureGroupDmChannel(currentUserId, otherUserIds) {
  const memberIds = [...new Set([currentUserId, ...otherUserIds].map(String))];
  const name = dmName(memberIds);
  return Channel.findOneAndUpdate(
    {
      type: "dm",
      members: { $all: memberIds },
      $expr: { $eq: [{ $size: "$members" }, memberIds.length] },
    },
    {
      $setOnInsert: {
        name,
        type: "dm",
        members: memberIds,
        createdBy: currentUserId,
      },
      $pull: { hiddenFor: currentUserId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: false }
  );
}

// Create the DM if this pair has never messaged, and make it visible to the
// initiating user. VIPs are displayed through the DM list, so adding a VIP
// must also guarantee that this backing conversation exists.
export function ensureDmChannel(currentUserId, otherUserId) {
  const name = dmName(currentUserId, otherUserId);
  return Channel.findOneAndUpdate(
    { name },
    {
      $setOnInsert: {
        name,
        type: "dm",
        members: [currentUserId, otherUserId],
        createdBy: currentUserId,
      },
      $pull: { hiddenFor: currentUserId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: false }
  );
}

// Create or restore the current user's personal notes conversation.
export async function ensureSelfDmChannel(userId) {
  const name = `dm-self-${userId}`;
  let channel = await Channel.findOne({ name });
  if (channel) {
    await Channel.updateOne({ _id: channel._id }, { $pull: { hiddenFor: userId } });
    return Channel.findById(channel._id);
  }
  return Channel.create({ name, type: "dm", members: [userId], createdBy: userId });
}
