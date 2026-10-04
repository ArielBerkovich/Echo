import { fileTypeFromBuffer } from "file-type";
import { config } from "../config.js";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { putObject } from "../storage.js";

const BLOCKED_MIME = new Set(["image/svg+xml", "text/html", "text/javascript", "application/javascript"]);

export async function canAccessAttachment(key: string, userId: string | { toString(): string }) {
  const references = await Message.find({ "attachments.key": key }, { channel: 1 }).lean();
  if (references.length === 0) return true;
  const channelIds = [...new Set(references.map((message) => String(message.channel)))];
  const channels = await Channel.find(
    { _id: { $in: channelIds }, isArchived: { $ne: true } },
    { type: 1, members: 1 }
  );
  return channels.some(
    (channel) => channel.type === "public" || channel.members.some((member) => member.equals(userId))
  );
}

export function isImageContentType(contentType: string) {
  return /^image\//.test(contentType || "") && !BLOCKED_MIME.has(contentType);
}

export async function storeAttachment({ buffer, name, declaredContentType, rejectBlocked = false }: {
  buffer: Buffer;
  name: string;
  declaredContentType?: string;
  rejectBlocked?: boolean;
}) {
  const detected = await fileTypeFromBuffer(buffer);
  const detectedType = detected?.mime || declaredContentType || "application/octet-stream";
  if (BLOCKED_MIME.has(detectedType) && rejectBlocked) return { error: "This file type is not allowed" };
  const contentType = BLOCKED_MIME.has(detectedType) ? "application/octet-stream" : detectedType;
  const key = await putObject({ buffer, name, contentType });
  return { key, contentType, size: buffer.length, isImage: isImageContentType(contentType) };
}

export async function storeBase64Attachment({ data, name, contentType }: {
  data: string;
  name?: string;
  contentType?: string;
}) {
  const buffer = Buffer.from(String(data || ""), "base64");
  if (!buffer.length) return { error: "File data is empty or invalid base64" };
  if (buffer.length > config.maxUploadBytes) return { error: "File exceeds Echo's upload size limit" };
  return storeAttachment({
    buffer,
    name: String(name || "file").slice(0, 255),
    declaredContentType: contentType || "application/octet-stream",
    rejectBlocked: true,
  });
}
