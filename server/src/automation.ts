import crypto from "crypto";
import mongoose from "mongoose";
import { Channel } from "./models/Channel.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import { emitToChannel } from "./realtime.js";
import { sanitizeAttachments } from "./deliver.js";
import { buildMessageActivityMetadata } from "./lib/messageActivity.js";

const STATUS_ICONS = {
  running: "[RUNNING]",
  success: "[SUCCESS]",
  passed: "[SUCCESS]",
  failed: "[FAILED]",
  failure: "[FAILED]",
  cancelled: "[CANCELLED]",
  canceled: "[CANCELLED]",
  warning: "[WARNING]",
  skipped: "[SKIPPED]",
};

export function hashWebhookToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function createWebhookToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function normalizeChannelName(name) {
  return String(name || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

export function normalizeFields(fields) {
  if (!fields) return [];
  const entries = Array.isArray(fields)
    ? fields.map((f) => [f?.name ?? f?.label, f?.value])
    : Object.entries(fields);
  return entries
    .filter(([name, value]) => name !== undefined && value !== undefined && value !== null)
    .slice(0, 20)
    .map(([name, value]) => ({
      name: String(name).trim().slice(0, 64),
      value: String(value).trim().slice(0, 400),
    }))
    .filter((f) => f.name && f.value);
}

export function renderAutomationBody({ body, text, status, title, fields }) {
  const explicit = String(body ?? text ?? "").trim();
  const cleanStatus = String(status || "").trim().toLowerCase();
  const cleanTitle = String(title || "").trim();
  const parts = [];
  if (cleanTitle || cleanStatus) {
    const icon = STATUS_ICONS[cleanStatus] || (cleanStatus ? "•" : "");
    const label = cleanStatus ? cleanStatus.toUpperCase() : "";
    parts.push(`**${[icon, label, cleanTitle].filter(Boolean).join(" ")}**`);
  }
  if (explicit) parts.push(explicit);
  const normalizedFields = normalizeFields(fields);
  if (normalizedFields.length) {
    parts.push(normalizedFields.map((f) => `- **${f.name}:** ${f.value}`).join("\n"));
  }
  return parts.join("\n\n").trim();
}

export async function resolveAutomationChannel({ userId, channelId, channelName, fallbackChannelId }) {
  let channel = null;
  if (channelId && mongoose.isValidObjectId(channelId)) {
    channel = await Channel.findById(channelId);
  } else if (channelName) {
    channel = await Channel.findOne({ name: normalizeChannelName(channelName), isArchived: false });
  } else if (fallbackChannelId) {
    channel = await Channel.findById(fallbackChannelId);
  }
  if (!channel || channel.isArchived) {
    const err = new Error("channel not found");
    err.status = 404;
    throw err;
  }
  if (channel.type !== "public" && !channel.members.some((m) => m.equals(userId))) {
    const err = new Error("access denied");
    err.status = 403;
    throw err;
  }
  return channel;
}

function cleanKey(value, max = 256) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

async function createMessage({ channel, authorId, body, parentId, attachments, idempotencyKey, externalKey, automation }) {
  const doc = {
    channel: channel._id,
    author: authorId,
    body,
    parentId: parentId || null,
    attachments,
    automation,
    ...(await buildMessageActivityMetadata({ body, parentId })),
  };
  const idem = cleanKey(idempotencyKey, 128);
  const ext = cleanKey(externalKey);
  if (idem) doc.idempotencyKey = idem;
  if (ext) doc.externalKey = ext;
  const message = await Message.create({
    ...doc,
  });
  await message.populate("author");
  const payload = message.toPublicJSON();
  emitToChannel(channel._id.toString(), "message:new", payload);
  return payload;
}

export async function postAutomationMessage({
  channel,
  authorId,
  payload,
  source = "api",
  idempotencyKey,
}) {
  const body = renderAutomationBody(payload);
  const files = sanitizeAttachments(payload.attachments);
  if (!body && files.length === 0) {
    const err = new Error("message needs text or an attachment");
    err.status = 400;
    throw err;
  }

  const idem = cleanKey(idempotencyKey || payload.idempotencyKey, 128);
  if (idem) {
    const existing = await Message.findOne({ channel: channel._id, author: authorId, idempotencyKey: idem }).populate("author");
    if (existing) return { message: existing.toPublicJSON(), created: false, idempotent: true };
  }

  const fields = normalizeFields(payload.fields);
  const automation = {
    source,
    status: cleanKey(payload.status, 32),
    title: cleanKey(payload.title, 200),
    threadKey: cleanKey(payload.threadKey),
    fields,
  };
  const externalKey = cleanKey(payload.externalKey);
  const threadKey = cleanKey(payload.threadKey);
  let parentId = payload.parentId && mongoose.isValidObjectId(payload.parentId) ? payload.parentId : null;

  if (threadKey) {
    let root = await Message.findOne({
      channel: channel._id,
      author: authorId,
      externalKey: threadKey,
      parentId: null,
    });
    if (!root) {
      const rootBody = renderAutomationBody({
        status: payload.status,
        title: payload.threadTitle || payload.title || `Thread ${threadKey}`,
        body: payload.threadBody || "Updates for this run will appear in this thread.",
        fields: payload.threadFields,
      });
      root = await Message.create({
        channel: channel._id,
        author: authorId,
        body: rootBody,
        externalKey: threadKey,
        automation: { ...automation, title: payload.threadTitle || payload.title || `Thread ${threadKey}`, threadKey },
        ...(await buildMessageActivityMetadata({ body: rootBody, parentId: null })),
      });
      await root.populate("author");
      emitToChannel(channel._id.toString(), "message:new", root.toPublicJSON());
    }
    if (!externalKey || externalKey === threadKey) {
      const updated = await updateExistingMessage(root, { body, files, automation, idempotencyKey: idem });
      return { message: updated, created: false, updated: true };
    }
    parentId = root._id;
  }

  if (externalKey) {
    const existing = await Message.findOne({ channel: channel._id, author: authorId, externalKey }).populate("author");
    if (existing) {
      const updated = await updateExistingMessage(existing, { body, files, automation, idempotencyKey: idem });
      return { message: updated, created: false, updated: true };
    }
  }

  const message = await createMessage({
    channel,
    authorId,
    body,
    parentId,
    attachments: files,
    idempotencyKey: idem,
    externalKey,
    automation,
  });
  return { message, created: true };
}

async function updateExistingMessage(message, { body, files, automation, idempotencyKey }) {
  message.body = body;
  message.attachments = files;
  message.automation = automation;
  Object.assign(message, await buildMessageActivityMetadata({ body, parentId: message.parentId }));
  if (idempotencyKey) message.idempotencyKey = idempotencyKey;
  message.editedAt = new Date();
  await message.save();
  await message.populate("author");
  const payload = message.toPublicJSON();
  emitToChannel(message.channel.toString(), "message:update", {
    id: payload.id,
    channelId: payload.channelId,
    parentId: payload.parentId,
    body: payload.body,
    editedAt: payload.editedAt,
    externalKey: payload.externalKey,
    automation: payload.automation,
  });
  return payload;
}

export async function findUserById(id) {
  return mongoose.isValidObjectId(id) ? User.findById(id) : null;
}
