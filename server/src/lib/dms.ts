import { createHash } from "node:crypto";
import { Channel } from "../models/Channel.js";

// Deterministic channel name for the DM between two users, regardless of order.
export function dmName(a, b) {
  const ids = Array.isArray(a) ? a : [a, b];
  const signature = ids.map(String).sort().join("-");
  const readableName = `dm-${signature}`;
  if (readableName.length <= 64) return readableName;
  return `dm-${createHash("sha256").update(signature).digest("hex").slice(0, 60)}`;
}

// Group DMs use the same deterministic naming scheme as one-to-one DMs. The
// member set, rather than the order in which people were selected, identifies
// the conversation.
export async function ensureGroupDmChannel(currentUserId, otherUserIds) {
  const memberIds = [...new Set([currentUserId, ...otherUserIds].map(String))];
  const name = dmName(memberIds);
  // MongoDB does not allow $expr in an upsert predicate. Find candidates
  // first, then compare the member sets in application code so renamed group
  // DMs are still reused without matching a smaller group.
  const candidates = await Channel.find({ type: "dm", members: { $all: memberIds } });
  const memberSet = new Set(memberIds);
  const existing = candidates.find(
    (candidate) =>
      candidate.members.length === memberSet.size &&
      candidate.members.every((member) => memberSet.has(String(member)))
  );

  if (existing) {
    return Channel.findOneAndUpdate(
      { _id: existing._id },
      { $pull: { hiddenFor: currentUserId } },
      { new: true }
    );
  }

  return Channel.create({
    name,
    type: "dm",
    members: memberIds,
    createdBy: currentUserId,
  });
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
