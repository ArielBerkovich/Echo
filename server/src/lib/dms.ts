import { Channel } from "../models/Channel.js";

// Deterministic channel name for the DM between two users, regardless of order.
export function dmName(a, b) {
  return `dm-${[String(a), String(b)].sort().join("-")}`;
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
