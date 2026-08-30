import crypto from "crypto";
import { MentionWebhook } from "./models/MentionWebhook.js";
import { User } from "./models/User.js";
import { config } from "./config.js";

const DELIVERY_TIMEOUT_MS = 8_000;
const DELIVERY_ATTEMPTS = 3;

export function mentionWebhookSigningSecret(userId) {
  return crypto.createHmac("sha256", config.jwtSecret).update(`mention-webhook:${userId}`).digest("base64url");
}

function signature(secret, timestamp, payload) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

async function deliver(url, secret, event) {
  const payload = JSON.stringify(event);
  const timestamp = String(Date.now());
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-echo-event": event.type,
          "x-echo-delivery": event.id,
          "x-echo-timestamp": timestamp,
          "x-echo-signature": `sha256=${signature(secret, timestamp, payload)}`,
        },
        body: payload,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      if (response.ok) return;
      console.warn(`Mention webhook delivery ${event.id} failed with ${response.status} (attempt ${attempt})`);
    } catch (error) {
      console.warn(`Mention webhook delivery ${event.id} failed (attempt ${attempt}):`, error?.message || error);
    }
    if (attempt < DELIVERY_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
}

export function webhookRecipients(message, channel, authorId) {
  const author = String(authorId);
  const recipients = new Map((message.mentionedUserIds || []).map((userId) => [String(userId), "user_mentioned"]));
  // A direct conversation delivers to every other participant, including a
  // group DM. Direct delivery takes precedence when a recipient is also
  // mentioned in the same message.
  if (channel.type === "dm") {
    for (const memberId of channel.members || []) {
      const userId = String(memberId);
      if (userId !== author) recipients.set(userId, "direct_message");
    }
  }
  recipients.delete(author);
  return recipients;
}

// Delivery is deliberately asynchronous so a receiver cannot delay normal
// message sending. Recipients are explicit mentions or DM participants.
export function dispatchMentionWebhooks({ message, channel, author }) {
  if (!message.mentionedUserIds?.length && channel.type !== "dm") return;
  queueMicrotask(() => void dispatch({ message, channel, author }).catch((error) => {
    console.error("Could not dispatch mention webhooks:", error);
  }));
}

async function dispatch({ message, channel, author }) {
  const recipientEvents = webhookRecipients(message, channel, author._id);
  if (!recipientEvents.size) return;
  const recipientIds = [...recipientEvents.keys()];
  const [webhooks, recipients] = await Promise.all([
    MentionWebhook.find({ user: { $in: recipientIds }, enabled: true }),
    User.find({ _id: { $in: recipientIds } }),
  ]);
  const recipientsById = new Map(recipients.map((recipient) => [recipient._id.toString(), recipient]));
  for (const webhook of webhooks) {
    const recipient = recipientsById.get(webhook.user.toString());
    if (!recipient) continue;
    const event = {
      id: crypto.randomUUID(),
      type: recipientEvents.get(recipient._id.toString()),
      occurredAt: new Date().toISOString(),
      recipient: recipient.toPublicJSON(),
      message: message.toPublicJSON(),
      channel: channel.toPublicJSON(),
      author: author.toPublicJSON(),
    };
    void deliver(webhook.url, mentionWebhookSigningSecret(recipient._id.toString()), event);
  }
}
