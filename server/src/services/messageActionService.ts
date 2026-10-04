import { ActivityEvent } from "../models/ActivityEvent.js";
import { applySurveyVote } from "../deliver.js";
import { applyReaction, reactionSummary } from "../lib/reactions.js";
import { emitToChannel, emitToUser } from "../realtime.js";

/** Shared message mutations used by REST, Socket.IO, and MCP transports. */
export async function reactToMessage({ channel, message, userId, emoji, present }) {
  const result = await applyReaction({ messageId: message._id, userId, emoji, present });
  const updatedMessage = result.message;
  if (result.added && updatedMessage.kind !== "system" && !updatedMessage.author.equals(userId)) {
    await ActivityEvent.updateOne(
      { recipient: updatedMessage.author, actor: userId, message: updatedMessage._id, emoji },
      { $set: { channel: updatedMessage.channel, createdAt: new Date() } },
      { upsert: true },
    ).catch(() => {});
    emitToUser(updatedMessage.author.toString(), "activity:bump");
  }
  const reactions = reactionSummary(updatedMessage);
  emitToChannel(channel._id.toString(), "message:reaction", {
    messageId: updatedMessage._id.toString(),
    reactions,
  });
  const userIdString = userId.toString();
  return {
    message: updatedMessage,
    reactions,
    added: result.added,
    changed: result.changed,
    present: reactions.some((reaction) => reaction.emoji === emoji && reaction.users.includes(userIdString)),
  };
}

export async function voteInSurvey({ channel, message, userId, optionIds }) {
  const updated = await applySurveyVote(message, userId, optionIds);
  const survey = updated.toPublicJSON().survey;
  emitToChannel(channel._id.toString(), "message:survey", {
    messageId: updated._id.toString(),
    survey,
  });
  return { message: updated, survey };
}
