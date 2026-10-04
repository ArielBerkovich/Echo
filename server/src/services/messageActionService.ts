import { ActivityEvent } from "../models/ActivityEvent.js";
import { Message } from "../models/Message.js";
import { applySurveyVote } from "../deliver.js";
import { applyReaction, reactionSummary } from "../lib/reactions.js";
import { buildMessageActivityMetadata } from "../lib/messageActivity.js";
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

export async function editMessage({ channel, message, userId, body, attachments }) {
  message.body = body;
  if (attachments !== undefined) message.attachments = attachments;
  Object.assign(message, await buildMessageActivityMetadata({
    body,
    parentId: message.parentId,
    authorId: userId,
  }));
  message.editedAt = new Date();
  await message.save();

  const payload = {
    id: message._id.toString(),
    channelId: channel._id.toString(),
    parentId: message.parentId ? message.parentId.toString() : null,
    body: message.body,
    attachments: message.toPublicJSON().attachments,
    editedAt: message.editedAt,
    mentionedUserIds: message.mentionedUserIds.map((id) => id.toString()),
    mentionedChannels: message.mentionedChannels.map((mention) => ({
      channelId: mention.channelId.toString(),
      name: mention.name,
    })),
  };
  emitToChannel(channel._id.toString(), "message:update", payload);
  return { message, payload };
}

export async function deleteMessage({ channel, message, softDelete = false }) {
  if (softDelete) {
    message.body = "[deleted]";
    message.attachments = [];
    message.editedAt = new Date();
    await message.save();
    emitToChannel(channel._id.toString(), "message:update", message.toPublicJSON());
    return { messageId: message._id.toString(), channelId: channel._id.toString(), softDeleted: true };
  }

  const parentId = message.parentId ? message.parentId.toString() : null;
  const removedMessages = await Message.find(
    parentId
      ? { _id: message._id, channel: channel._id }
      : { $or: [{ _id: message._id }, { parentId: message._id }], channel: channel._id },
    { mentionedUserIds: 1, threadRootAuthor: 1, author: 1 },
  );
  await Message.deleteOne({ _id: message._id, channel: channel._id });
  if (!parentId) await Message.deleteMany({ parentId: message._id, channel: channel._id });

  const channelId = channel._id.toString();
  emitToChannel(channelId, "message:deleted", {
    id: message._id.toString(),
    channelId,
    parentId,
  });
  const recipients = new Set(channel.members.map((id) => id.toString()));
  for (const removed of removedMessages) {
    for (const id of [...(removed.mentionedUserIds || []), removed.threadRootAuthor, removed.author]) {
      if (id) recipients.add(id.toString());
    }
  }
  for (const id of recipients) emitToUser(id, "activity:bump");
  return { messageId: message._id.toString(), channelId, parentId };
}

export async function toggleMessagePin({ channel, message, userId, pinned: requestedPinned }) {
  const pinned = requestedPinned === undefined ? !message.pinnedAt : requestedPinned;
  message.pinnedAt = pinned ? new Date() : null;
  message.pinnedBy = pinned ? userId : null;
  await message.save();
  const payload = {
    messageId: message._id.toString(),
    channelId: channel._id.toString(),
    pinnedAt: message.pinnedAt || null,
    pinnedBy: message.pinnedBy ? message.pinnedBy.toString() : null,
  };
  emitToChannel(channel._id.toString(), "message:pin", payload);
  return { pinned, payload, message };
}
