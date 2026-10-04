import { Message } from "../models/Message.js";
import { deliverMessage } from "../deliver.js";

/**
 * Application-level message creation used by every transport. Callers are
 * responsible for channel authorization and input sanitization; this service
 * owns idempotency and delivery so REST, MCP, and future transports cannot
 * diverge on persistence or realtime behavior.
 */
export async function sendMessage({
  channel,
  authorId,
  body,
  parentId = null,
  broadcastToChannel = false,
  idempotencyKey = null,
  attachments = [],
  survey = null,
  retro = null,
  card = null,
  passwordHelpRequest = null,
}) {
  if (idempotencyKey) {
    const existing = await Message.findOne({
      channel: channel._id,
      author: authorId,
      idempotencyKey: String(idempotencyKey).slice(0, 128),
    }).populate("author");
    if (existing) return { message: existing.toPublicJSON(), idempotent: true };
  }

  const message = await deliverMessage({
    channel,
    authorId,
    body,
    parentId,
    broadcastToChannel,
    idempotencyKey: idempotencyKey || null,
    attachments,
    survey,
    retro,
    card,
    passwordHelpRequest,
  });
  return { message };
}
