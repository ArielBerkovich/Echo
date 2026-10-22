import { ScheduledMessage } from "../models/ScheduledMessage.js";

export type ScheduledMessageActor = string | { toString(): string };

export async function createScheduledMessage({ channelId, authorId, body, parentId = null, attachments = [], scheduledFor }: {
  channelId: ScheduledMessageActor;
  authorId: ScheduledMessageActor;
  body: string;
  parentId?: ScheduledMessageActor | null;
  attachments?: unknown[];
  scheduledFor: Date;
}) {
  return ScheduledMessage.create({
    channel: channelId,
    author: authorId,
    body,
    parentId,
    attachments,
    scheduledFor,
  });
}

export async function listScheduledMessages({ authorId, channelId, pendingOnly = false }: {
  authorId: ScheduledMessageActor;
  channelId?: ScheduledMessageActor;
  pendingOnly?: boolean;
}) {
  const filter: Record<string, unknown> = { author: authorId };
  if (pendingOnly) {
    filter.scheduledFor = { $gt: new Date() };
    filter.status = "pending";
  }
  if (channelId) filter.channel = channelId;
  return ScheduledMessage.find(filter).sort({ scheduledFor: 1 });
}

export async function updateScheduledMessage({ messageId, authorId, body, scheduledFor }: {
  messageId: ScheduledMessageActor;
  authorId: ScheduledMessageActor;
  body?: string;
  scheduledFor?: Date;
}) {
  const message = await findScheduledMessage({ messageId, authorId });
  if (!message) return null;
  if (body !== undefined) message.body = body;
  if (scheduledFor !== undefined) message.scheduledFor = scheduledFor;
  message.status = "pending";
  message.attemptCount = 0;
  message.nextAttemptAt = null;
  message.lastError = "";
  await message.save();
  return message;
}

export async function findScheduledMessage({ messageId, authorId }: {
  messageId: ScheduledMessageActor;
  authorId: ScheduledMessageActor;
}) {
  return ScheduledMessage.findOne({ _id: messageId, author: authorId });
}

export async function cancelScheduledMessage({ messageId, authorId }: {
  messageId: ScheduledMessageActor;
  authorId: ScheduledMessageActor;
}) {
  const result = await ScheduledMessage.deleteOne({ _id: messageId, author: authorId });
  return result.deletedCount > 0;
}
