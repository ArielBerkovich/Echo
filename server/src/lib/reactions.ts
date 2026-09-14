import { Message } from "../models/Message.js";

function reactionPipeline(emoji, userId, present) {
  const reactions = { $ifNull: ["$reactions", []] };
  const matching = { $eq: ["$$reaction.emoji", emoji] };
  const users = { $ifNull: ["$$reaction.users", []] };

  if (present) {
    return [{ $set: {
      reactions: {
        $cond: [
          { $in: [emoji, { $map: { input: reactions, as: "reaction", in: "$$reaction.emoji" } }] },
          { $map: { input: reactions, as: "reaction", in: { $cond: [matching, { $mergeObjects: ["$$reaction", { users: { $setUnion: [users, [userId]] } }] }, "$$reaction"] } } },
          { $concatArrays: [reactions, [{ emoji, users: [userId] }]] },
        ],
      },
      updatedAt: new Date(),
    } }];
  }

  return [{ $set: {
    reactions: {
      $filter: {
        input: {
          $map: {
            input: reactions,
            as: "reaction",
            in: {
              $cond: [
                matching,
                {
                  $mergeObjects: [
                    "$$reaction",
                    { users: { $filter: { input: users, as: "user", cond: { $ne: ["$$user", userId] } } } },
                  ],
                },
                "$$reaction",
              ],
            },
          },
        },
        as: "reaction",
        cond: { $gt: [{ $size: { $ifNull: ["$$reaction.users", []] } }, 0] },
      },
    },
    updatedAt: new Date(),
  } }];
}

function addFilter(messageId, emoji, userId) {
  return { _id: messageId, reactions: { $not: { $elemMatch: { emoji, users: userId } } } };
}

function removeFilter(messageId, emoji, userId) {
  return { _id: messageId, reactions: { $elemMatch: { emoji, users: userId } } };
}

export async function applyReaction({ messageId, userId, emoji, present }) {
  if (present === true || present === false) {
    const changed = Boolean(await Message.findOneAndUpdate(
      present ? addFilter(messageId, emoji, userId) : removeFilter(messageId, emoji, userId),
      reactionPipeline(emoji, userId, present),
      { new: true }
    ));
    return { message: await Message.findById(messageId), changed, added: present && changed };
  }

  const addedMessage = await Message.findOneAndUpdate(addFilter(messageId, emoji, userId), reactionPipeline(emoji, userId, true), { new: true });
  if (addedMessage) return { message: addedMessage, changed: true, added: true };
  const removedMessage = await Message.findOneAndUpdate(removeFilter(messageId, emoji, userId), reactionPipeline(emoji, userId, false), { new: true });
  if (removedMessage) return { message: removedMessage, changed: true, added: false };
  return { message: await Message.findById(messageId), changed: false, added: false };
}

export function reactionSummary(message) {
  return (message.reactions || []).map((reaction) => ({ emoji: reaction.emoji, users: reaction.users.map((id) => id.toString()) }));
}
