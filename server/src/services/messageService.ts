import { Message } from "../models/Message.js";
import { deliverMessage } from "../deliver.js";
import { expandWorkItemReferences, normalizeWorkItemMarkdownLinks, resolveWorkItemTitles, workItemMessageText } from "../azureWorkItems.js";

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

  const workItemIds = [...new Set([...String(body || "").matchAll(/#(\d{1,10})(?![\w-])/g)].map((match) => match[1]))].slice(0, 20);
  let workItems = [];
  let messageBody = body || "";
  let activityBody = body || "";
  if (workItemIds.length) {
    try {
      const { items } = await resolveWorkItemTitles(workItemIds, { refresh: true });
      workItems = Object.entries(items).map(([id, item]) => ({ id, ...item, text: workItemMessageText(id, item) }));
      const itemMap = Object.fromEntries(workItems.map((item) => [item.id, item]));
      activityBody = normalizeWorkItemMarkdownLinks(messageBody, itemMap);
      messageBody = expandWorkItemReferences(activityBody, itemMap);
    } catch { /* Azure lookup failure must never block sending a message. */ }
  }

  const message = await deliverMessage({
    channel,
    authorId,
    body: messageBody,
    activityBody,
    parentId,
    broadcastToChannel,
    idempotencyKey: idempotencyKey || null,
    attachments,
    survey,
    retro,
    card,
    passwordHelpRequest,
    workItems,
  });
  return { message };
}
