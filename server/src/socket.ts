import { Server } from "socket.io";
import mongoose from "mongoose";
import { createAdapter } from "@socket.io/mongo-adapter";
import { verifyToken } from "./auth.js";
import { config } from "./config.js";
import { User } from "./models/User.js";
import { Channel } from "./models/Channel.js";
import { Message } from "./models/Message.js";
import { ActivityEvent } from "./models/ActivityEvent.js";
import { setIO } from "./realtime.js";
import { deliverMessage, sanitizeAttachments } from "./deliver.js";
import { buildMessageActivityMetadata } from "./lib/messageActivity.js";
import { roomFor, userRoom } from "./lib/rooms.js";
import { activeConnections, recordSocketError } from "./metrics.js";

// Wire up the real-time messaging layer on top of the HTTP server.
export function attachSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, !origin || origin === "null" || origin === config.clientOrigin),
      credentials: true,
    },
  });

  // Use MongoDB as the Socket.IO event bus when the database is available.
  // This keeps the single-process development setup working while allowing
  // multiple HTTP/Socket.IO replicas to share rooms and broadcasts.
  const mongoClient = mongoose.connection.getClient?.();
  const topologyType = mongoClient?.topology?.description?.type;
  if (mongoose.connection.readyState === 1 && topologyType !== "Single" && process.env.SOCKET_IO_MONGO_ADAPTER !== "false") {
    const events = mongoClient.db().collection("echo-socket-events");
    io.adapter(createAdapter(events, { addCreatedAtField: true }));
    // Keep adapter events bounded. The adapter itself remains usable if index
    // creation is delayed or permissions do not allow index management.
    events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }).catch((err) => {
      console.warn("Could not create Socket.IO adapter TTL index:", err.message);
    });
    console.log("Socket.IO MongoDB adapter enabled");
  } else {
    console.warn("Socket.IO MongoDB adapter unavailable; using process-local realtime events");
  }
  setIO(io); // let REST routes emit real-time events too

  // Presence is calculated from the adapter's cluster-wide socket view rather
  // than a process-local map, so it remains correct when replicas are added.
  async function broadcastPresence() {
    const sockets = await io.fetchSockets().catch(() => []);
    const online = [...new Set(sockets.map((s) => s.data?.userId).filter(Boolean))];
    io.emit("presence", { online });
    return online;
  }

  function connectionError(message, code) {
    const error = new Error(message);
    error.data = { code };
    return error;
  }

  function ackError(ack, type, message) {
    recordSocketError(type);
    ack?.({ error: message });
  }

  // Authenticate every socket from the handshake before it can do anything.
  io.use(async (socket, next) => {
    let payload;
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        recordSocketError("authentication");
        return next(connectionError("Missing token", "AUTH_INVALID"));
      }
      payload = verifyToken(token);
    } catch {
      recordSocketError("authentication");
      return next(connectionError("Authentication failed", "AUTH_INVALID"));
    }

    try {
      const user = await User.findById(payload.sub);
      if (!user || (payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
        recordSocketError("authentication");
        return next(connectionError("Authentication failed", "AUTH_INVALID"));
      }
      socket.user = user;
      next();
    } catch {
      // A database/server startup failure is recoverable and must not be
      // presented to the client as an expired login.
      recordSocketError("authentication");
      next(connectionError("Echo is temporarily unavailable", "TEMPORARY_UNAVAILABLE"));
    }
  });

  io.on("connection", (socket) => {
    activeConnections.inc();
    socket.on("error", () => recordSocketError("connection"));

    // A personal room so we can reach this user's sockets later (e.g. to pull
    // them into a DM created after they connected).
    socket.join(userRoom(socket.user._id.toString()));

    // Mark online, and hand the newcomer the current online roster.
    const uid = socket.user._id.toString();
    socket.data.userId = uid;
    broadcastPresence().then((online) => {
      socket.emit("presence", { online });
    }).catch(() => {});
    socket.on("disconnect", () => {
      activeConnections.dec();
      broadcastPresence().catch(() => {});
    });

    // Join rooms for every channel the user belongs to, so they receive live
    // messages (and notifications) across all their channels and DMs.
    Channel.find({ members: socket.user._id }, { _id: 1 })
      .then((channels) => channels.forEach((c) => socket.join(roomFor(c._id.toString()))))
      .catch(() => {});

    // Join a channel room so this socket receives its live messages.
    socket.on("channel:join", async (channelId, ack) => {
      try {
        const channel = await Channel.findById(channelId);
        if (!channel) return ackError(ack, "channel_join", "channel not found");
        if (
          channel.type !== "public" &&
          !channel.members.some((m) => m.equals(socket.user._id))
        ) {
          return ackError(ack, "channel_join", "access denied");
        }
        socket.join(roomFor(channelId));
        ack?.({ ok: true });
      } catch {
        ackError(ack, "channel_join", "could not join channel");
      }
    });

    socket.on("channel:leave", async (channelId) => {
      if (!channelId) return;
      const channel = await Channel.findById(channelId).catch(() => {
        recordSocketError("channel_leave");
        return null;
      });
      if (!channel || !canAccess(channel, socket.user._id)) return;
      socket.leave(roomFor(channelId));
    });

    // Relay an ephemeral typing signal to everyone else in the channel.
    socket.on("typing", async ({ channelId, typing } = {}) => {
      if (!channelId) return;
      const channel = await Channel.findById(channelId).catch(() => {
        recordSocketError("typing");
        return null;
      });
      if (!channel || !canAccess(channel, socket.user._id)) return;
      socket.to(roomFor(channelId)).emit("typing", {
        channelId,
        typing: !!typing,
        user: { id: socket.user._id.toString(), displayName: socket.user.displayName },
      });
    });

    // Toggle the current user's emoji reaction on a message.
    socket.on("reaction:toggle", async ({ messageId, emoji } = {}, ack) => {
      try {
        if (!messageId || !emoji) return ackError(ack, "reaction", "messageId and emoji required");
        const message = await Message.findById(messageId);
        if (!message) return ackError(ack, "reaction", "message not found");
        const channel = await Channel.findById(message.channel);
        if (
          !channel ||
          (channel.type !== "public" && !channel.members.some((m) => m.equals(socket.user._id)))
        ) {
          return ackError(ack, "reaction", "access denied");
        }

        const uid = socket.user._id;
        let added = false;
        let entry = message.reactions.find((r) => r.emoji === emoji);
        if (!entry) {
          message.reactions.push({ emoji, users: [uid] });
          added = true;
        } else {
          const i = entry.users.findIndex((u) => u.equals(uid));
          if (i >= 0) entry.users.splice(i, 1);
          else {
            entry.users.push(uid);
            added = true;
          }
          if (entry.users.length === 0) {
            message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
          }
        }
        await message.save();

        // Reacting to someone else's message is activity for its author.
        if (added && message.kind !== "system" && !message.author.equals(uid)) {
          await ActivityEvent.updateOne(
            { recipient: message.author, actor: uid, message: message._id, emoji },
            { $set: { channel: message.channel, createdAt: new Date() } },
            { upsert: true }
          ).catch(() => {});
          io.to(userRoom(message.author.toString())).emit("activity:bump");
        }

        io.to(roomFor(message.channel.toString())).emit("message:reaction", {
          messageId: message._id.toString(),
          reactions: message.reactions.map((r) => ({
            emoji: r.emoji,
            users: r.users.map((u) => u.toString()),
          })),
        });
        ack?.({ ok: true });
      } catch (err) {
        ackError(ack, "reaction", err.message || "could not react");
      }
    });

    // Persist an incoming message and fan it out to everyone in the room.
    socket.on("message:send", async ({ channelId, body, parentId, attachments } = {}, ack) => {
      try {
        const text = String(body || "").trim();
        const files = sanitizeAttachments(attachments);
        if (!text && files.length === 0) {
          return ackError(ack, "message_send", "message needs text or an attachment");
        }

        const channel = await Channel.findById(channelId);
        if (!channel) return ackError(ack, "message_send", "channel not found");
        if (
          channel.type !== "public" &&
          !channel.members.some((m) => m.equals(socket.user._id))
        ) {
          return ackError(ack, "message_send", "access denied");
        }

        const payload = await deliverMessage({
          channel,
          authorId: socket.user._id,
          body: text,
          parentId,
          attachments: files,
        });
        ack?.({ ok: true, message: payload });
      } catch (err) {
        ackError(ack, "message_send", err.message || "could not send message");
      }
    });

    // Edit one of your own messages; broadcast the new body to the room.
    socket.on("message:edit", async ({ messageId, body, attachments } = {}, ack) => {
      try {
        const text = String(body || "").trim();
        const files = sanitizeAttachments(attachments);
        if (!messageId || (!text && files.length === 0)) {
          return ackError(ack, "message_edit", "messageId and body or attachments are required");
        }

        const message = await Message.findById(messageId);
        if (!message) return ackError(ack, "message_edit", "message not found");
        if (message.kind === "system") return ackError(ack, "message_edit", "system messages cannot be edited");
        if (!message.author.equals(socket.user._id)) {
          return ackError(ack, "message_edit", "you can only edit your own messages");
        }
        const editChannel = await Channel.findById(message.channel);
        if (!editChannel || !canAccess(editChannel, socket.user._id)) {
          return ackError(ack, "message_edit", "access denied");
        }

        message.body = text;
        message.attachments = files;
        message.editedAt = new Date();
        await message.save();

        io.to(roomFor(message.channel.toString())).emit("message:update", {
          id: message._id.toString(),
          channelId: message.channel.toString(),
          parentId: message.parentId ? message.parentId.toString() : null,
          body: message.body,
          attachments: message.toPublicJSON().attachments,
          editedAt: message.editedAt,
        });
        ack?.({ ok: true });
      } catch (err) {
        ackError(ack, "message_edit", err.message || "could not edit message");
      }
    });

    // Delete one of your own messages (and any thread replies under it).
    socket.on("message:delete", async ({ messageId } = {}, ack) => {
      try {
        if (!messageId) return ackError(ack, "message_delete", "messageId is required");

        const message = await Message.findById(messageId);
        if (!message) return ackError(ack, "message_delete", "message not found");
        if (!message.author.equals(socket.user._id)) {
          return ackError(ack, "message_delete", "you can only delete your own messages");
        }
        const deleteChannel = await Channel.findById(message.channel);
        if (!deleteChannel || !canAccess(deleteChannel, socket.user._id)) {
          return ackError(ack, "message_delete", "access denied");
        }

        const channelId = message.channel.toString();
        const parentId = message.parentId ? message.parentId.toString() : null;
        await Message.deleteOne({ _id: message._id });
        // A thread root takes its replies with it.
        if (!parentId) await Message.deleteMany({ parentId: message._id });

        io.to(roomFor(channelId)).emit("message:deleted", {
          id: message._id.toString(),
          channelId,
          parentId,
        });
        ack?.({ ok: true });
      } catch (err) {
        ackError(ack, "message_delete", err.message || "could not delete message");
      }
    });

    // Pin or unpin a message — any channel member can do this.
    socket.on("message:pin", async ({ messageId } = {}, ack) => {
      try {
        if (!messageId) return ackError(ack, "message_pin", "messageId is required");
        const message = await Message.findById(messageId).populate("author");
        if (!message) return ackError(ack, "message_pin", "message not found");
        if (message.kind === "system") return ackError(ack, "message_pin", "system messages cannot be pinned");
        const channel = await Channel.findById(message.channel);
        if (!channel || !canAccess(channel, socket.user._id)) {
          return ackError(ack, "message_pin", "access denied");
        }

        const alreadyPinned = !!message.pinnedAt;
        message.pinnedAt = alreadyPinned ? null : new Date();
        message.pinnedBy = alreadyPinned ? null : socket.user._id;
        await message.save();

        io.to(roomFor(message.channel.toString())).emit("message:pin", {
          messageId: message._id.toString(),
          channelId: message.channel.toString(),
          pinnedAt: message.pinnedAt || null,
          pinnedBy: message.pinnedBy ? message.pinnedBy.toString() : null,
        });
        ack?.({ ok: true });
      } catch (err) {
        ackError(ack, "message_pin", err.message || "could not pin message");
      }
    });

    // Forward an existing message into another channel/DM you can access.
    socket.on("message:forward", async ({ messageId, channelId, note = "" } = {}, ack) => {
      try {
        if (!messageId || !channelId) {
          return ackError(ack, "message_forward", "messageId and channelId are required");
        }

        const source = await Message.findById(messageId);
        if (!source) return ackError(ack, "message_forward", "message not found");
        if (source.kind === "system") return ackError(ack, "message_forward", "cannot forward this message");

        const sourceChannel = await Channel.findById(source.channel);
        if (!sourceChannel || !canAccess(sourceChannel, socket.user._id)) {
          return ackError(ack, "message_forward", "access denied");
        }

        const target = await Channel.findById(channelId);
        if (!target) return ackError(ack, "message_forward", "destination not found");
        if (!canAccess(target, socket.user._id)) {
          return ackError(ack, "message_forward", "access denied to destination");
        }

        const author = await User.findById(source.author);
        const sourceAttachments = (source.attachments || []).map((a) => ({
          key: a.key,
          name: a.name,
          size: a.size,
          contentType: a.contentType,
          isImage: a.isImage,
          width: a.width,
          height: a.height,
        }));
        const message = await Message.create({
          channel: target._id,
          author: socket.user._id,
          body: source.body,
          attachments: sourceAttachments,
          ...(await buildMessageActivityMetadata({ body: source.body, parentId: null })),
          forwardNote: String(note || "").trim(),
          forwardedFrom: {
            authorName: author?.displayName || "unknown",
            ...(author?.avatarKey ? { authorAvatarUrl: `/api/files/${author.avatarKey}` } : {}),
            channelName: originLabel(sourceChannel),
            channelId: sourceChannel._id.toString(),
            messageId: source._id.toString(),
            threadId: source.parentId ? source.parentId.toString() : null,
            channelType: sourceChannel.type,
          },
        });
        message.author = socket.user; // avoid an extra populate round-trip

        // Bring a hidden DM back for its participants.
        if (target.type === "dm" && target.hiddenFor?.length) {
          await Channel.updateOne({ _id: target._id }, { $set: { hiddenFor: [] } });
        }

        const payload = message.toPublicJSON();
        io.to(roomFor(target._id.toString())).emit("message:new", payload);
        ack?.({ ok: true, message: payload });
      } catch (err) {
        ackError(ack, "message_forward", err.message || "could not forward message");
      }
    });
  });

  return io;
}

// A user may access a channel if it's public, or they're a member.
function canAccess(channel, userId) {
  return channel.type === "public" || channel.members.some((m) => m.equals(userId));
}

// Human-readable origin label for a forwarded message.
function originLabel(channel) {
  return channel.type === "dm" ? "a direct message" : `#${channel.name}`;
}
