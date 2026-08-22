import { ActivityEvent } from "../models/ActivityEvent.js";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";

export const ACTIVITY_WINDOW_DAYS = 30;

function messageActivityType(message, recipientId, channelType) {
  if (channelType === "dm") return "dm";
  if (message.parentId && message.threadRootAuthor?.toString() === recipientId.toString()) return "reply";
  if (message.mentionsEveryone) return "broadcast";
  return "mention";
}

function messageRecipients(message, channel) {
  const recipients = new Set((message.mentionedUserIds || []).map((id) => id.toString()));
  if (channel?.type === "dm") {
    for (const member of channel.members || []) recipients.add(member.toString());
  }
  if (message.mentionsEveryone) {
    for (const member of channel?.members || []) recipients.add(member.toString());
  }
  if (message.threadRootAuthor) recipients.add(message.threadRootAuthor.toString());
  recipients.delete(message.author.toString());
  return recipients;
}

// Create one Activity notification per recipient/message. Re-running this is
// safe and preserves an existing read state, which makes it usable for the
// data migration as well as live delivery.
export async function recordMessageActivity(message, channel = null, { readAtByRecipient = null } = {}) {
  const recipients = messageRecipients(message, channel);
  if (!recipients.size) return;
  const ops = [...recipients].map((recipient) => ({
    updateOne: {
      filter: { sourceKey: `message:${message._id}:${recipient}` },
      update: {
        $set: {
          recipient,
          actor: message.author,
          type: messageActivityType(message, recipient, channel?.type),
          channel: message.channel,
          message: message._id,
          createdAt: message.createdAt,
        },
        $setOnInsert: { readAt: readAtByRecipient?.get(recipient) || null },
      },
      upsert: true,
    },
  }));
  await ActivityEvent.bulkWrite(ops, { ordered: false });
}

// Converts the existing message-derived feed into persistent notifications.
// It is intentionally bounded to the same rolling window shown by Activity.
export async function backfillMessageActivity() {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const reads = await Read.find({}, { user: 1, channel: 1, thread: 1, lastReadAt: 1 }).lean();
  const readMap = new Map(reads.map((read) => [
    `${read.user}:${read.channel}:${read.thread || ""}`,
    read.lastReadAt,
  ]));
  const cursor = Message.find({
    author: { $exists: true },
    createdAt: { $gte: since },
    $or: [
      { mentionedUserIds: { $exists: true, $not: { $size: 0 } } },
      { mentionsEveryone: true },
      { threadRootAuthor: { $ne: null } },
    ],
  }, {
    _id: 1,
    author: 1,
    channel: 1,
    parentId: 1,
    mentionedUserIds: 1,
    mentionsEveryone: 1,
    threadRootAuthor: 1,
    createdAt: 1,
  }).cursor();
  for await (const message of cursor) {
    const channel = await Channel.findById(message.channel, { members: 1, type: 1 }).lean();
    const recipients = messageRecipients(message, channel);
    const readAtByRecipient = new Map();
    const thread = message.parentId?.toString() || "";
    for (const recipient of recipients) {
      const lastRead = readMap.get(`${recipient}:${message.channel}:${thread}`);
      if (lastRead && new Date(lastRead) >= new Date(message.createdAt)) {
        readAtByRecipient.set(recipient, message.createdAt);
      }
    }
    await recordMessageActivity(message, channel, { readAtByRecipient });
  }
}
