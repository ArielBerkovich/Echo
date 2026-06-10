import { Channel } from "./models/Channel.js";
import { Message } from "./models/Message.js";
import { getIO } from "./realtime.js";
import { roomFor, userRoom } from "./lib/rooms.js";
import { buildMessageActivityMetadata } from "./lib/messageActivity.js";

// Validate and normalise client-supplied attachment descriptors before they're
// persisted on a message: keep at most 10, require a safe storage key, and cap
// the free-text fields. Shared by every message-creation path.
export function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a.key === "string" && /^[a-z0-9-]+\.[a-z0-9]+$/i.test(a.key))
    .slice(0, 10)
    .map((a) => ({
      key: a.key,
      name: String(a.name || "file").slice(0, 255),
      size: Number(a.size) || 0,
      contentType: String(a.contentType || "application/octet-stream").slice(0, 100),
      isImage: !!a.isImage,
      width: Number(a.width) || undefined,
      height: Number(a.height) || undefined,
    }));
}

// Persist a message and fan it out in real time: a `message:new` to the
// channel room, DM room joins so both participants receive it, and
// `activity:bump` to anyone it's "activity" for. Shared by the live socket
// sender and the scheduled-message dispatcher so both behave identically.
export async function deliverMessage({ channel, authorId, body, parentId, attachments, idempotencyKey }) {
  const io = getIO();
  const cid = channel._id.toString();

  const activityMetadata = await buildMessageActivityMetadata({ body, parentId });
  const doc = {
    channel: channel._id,
    author: authorId,
    body: body || "",
    parentId: parentId || null,
    attachments: attachments || [],
    ...activityMetadata,
  };
  const idem = String(idempotencyKey || "").trim().slice(0, 128);
  if (idem) doc.idempotencyKey = idem;
  const message = await Message.create(doc);
  await message.populate("author");

  // A new DM message brings the conversation back for anyone who hid it.
  if (channel.type === "dm" && channel.hiddenFor?.length) {
    await Channel.updateOne({ _id: channel._id }, { $set: { hiddenFor: [] } });
  }

  // For DMs, ensure both participants' sockets are in the room before emitting.
  if (io && channel.type === "dm") {
    for (const memberId of channel.members) {
      io.in(userRoom(memberId.toString())).socketsJoin(roomFor(cid));
    }
  }

  const payload = message.toPublicJSON();
  io?.to(roomFor(cid)).emit("message:new", payload);

  // Activity badge bumps for @mentions / @everyone / thread-root authors, so it
  // updates live even for recipients not in this channel's room.
  if (channel.type !== "dm") {
    const notify = new Set();
    activityMetadata.mentionedUserIds.forEach((id) => notify.add(id.toString()));
    if (activityMetadata.mentionsEveryone) {
      channel.members.forEach((m) => notify.add(m.toString()));
    }
    if (activityMetadata.threadRootAuthor) notify.add(activityMetadata.threadRootAuthor.toString());
    notify.delete(authorId.toString()); // not your own message
    for (const uid of notify) io?.to(userRoom(uid)).emit("activity:bump");
  }

  return payload;
}
