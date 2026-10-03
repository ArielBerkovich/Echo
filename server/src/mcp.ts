import mongoose from "mongoose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Channel, canPostToChannel, isChannelManager } from "./models/Channel.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import { Read } from "./models/Read.js";
import { ActivityEvent } from "./models/ActivityEvent.js";
import { ScheduledMessage } from "./models/ScheduledMessage.js";
import { ThreadFollow } from "./models/ThreadFollow.js";
import { CustomEmoji } from "./models/CustomEmoji.js";
import { deliverMessage, sanitizeAttachments, attachmentLimitError, sanitizeSurvey, surveyError, sanitizeRetro, retroError, updateRetro } from "./deliver.js";
import { sanitizeCard, cardError } from "./lib/messageCard.js";
import { normalizeChannelName } from "./automation.js";
import { emitAll, emitToChannel, joinUserToChannel, removeUserFromChannel } from "./realtime.js";
import { ensureDmChannel, ensureGroupDmChannel, ensureSelfDmChannel } from "./lib/dms.js";
import { applyReaction, reactionSummary } from "./lib/reactions.js";
import { isValidChannelName } from "./lib/channelName.js";
import { putObject } from "./storage.js";
import { fileTypeFromBuffer } from "file-type";
import { config } from "./config.js";

const MAX_RESULTS = 50;

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

function toolError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function canAccess(channel, userId) {
  return channel.type === "public" || channel.members.some((member) => member.equals(userId));
}

async function findVisibleChannel(channelKey, userId) {
  const key = String(channelKey || "").trim();
  const channel = mongoose.isValidObjectId(key)
    ? await Channel.findById(key)
    : await Channel.findOne({ name: normalizeChannelName(key) });
  if (!channel || channel.isArchived || !canAccess(channel, userId)) return null;
  return channel;
}

async function joinPublicChannel(channelKey, userId) {
  const key = String(channelKey || "").trim();
  const channel = mongoose.isValidObjectId(key)
    ? await Channel.findById(key)
    : await Channel.findOne({ name: normalizeChannelName(key) });
  if (!channel || channel.isArchived) return { error: "Channel not found" };
  if (channel.type !== "public") return { error: "Private channels are invite-only" };

  const already = channel.members.some((memberId) => memberId.equals(userId));
  if (!already) {
    await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: userId } });
    await Read.updateOne(
      { user: userId, channel: channel._id, thread: null },
      { $set: { lastReadAt: new Date() } },
      { upsert: true }
    );
    joinUserToChannel(userId.toString(), channel._id.toString());
    const systemMessage = await Message.create({ channel: channel._id, author: userId, body: "joined", kind: "system" });
    await systemMessage.populate("author");
    emitToChannel(channel._id.toString(), "message:new", {
      ...systemMessage.toPublicJSON(),
      replyCount: 0,
      lastReplyAt: null,
    });
  }

  const updated = await Channel.findById(channel._id);
  const payload = updated.toPublicJSON();
  if (!already) {
    emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
    emitAll("channel:catalog", { channel: payload });
  }
  return { channel: payload, joined: !already };
}

async function leaveChannel(channelKey, userId, managerId) {
  const key = String(channelKey || "").trim();
  const channel = mongoose.isValidObjectId(key)
    ? await Channel.findById(key)
    : await Channel.findOne({ name: normalizeChannelName(key) });
  if (!channel || channel.isArchived) return { error: "Channel not found" };
  if (channel.type === "dm") return { error: "Cannot leave a direct message" };
  if (!channel.members.some((memberId) => memberId.equals(userId))) {
    return { error: "You are not a member of this channel" };
  }
  if ((channel.name || "").toLowerCase() === "general") {
    return { error: "#general is the default channel and cannot be left" };
  }

  const remainingMembers = channel.members.filter((memberId) => !memberId.equals(userId));
  const isCreator = channel.createdBy.equals(userId);
  const hasRemainingManager = (channel.managers || []).some(
    (manager) => remainingMembers.some((memberId) => memberId.equals(manager))
  );
  let transferredTo = null;
  if (isCreator && remainingMembers.length > 0 && !hasRemainingManager) {
    if (!mongoose.isValidObjectId(managerId)) return { error: "Choose a manager before leaving" };
    if (!remainingMembers.some((memberId) => memberId.equals(managerId))) {
      return { error: "Manager must be a member of the channel" };
    }
    channel.managers = [...new Set([...(channel.managers || []).map(String), String(managerId)])];
    transferredTo = String(managerId);
  }
  if (isCreator && remainingMembers.length === 0) {
    return { error: "Empty channels must be deleted instead" };
  }

  if (channel.type === "private") {
    const messages = await Message.find({ channel: channel._id }, { _id: 1 }).lean();
    if (messages.length) {
      await User.updateOne(
        { _id: userId },
        { $pull: { savedMessages: { $in: messages.map((message) => message._id) } } }
      );
    }
  }
  await User.updateOne({ _id: userId }, { $pull: { starredChannels: channel._id } });
  await ActivityEvent.deleteMany({ recipient: userId, channel: channel._id, type: { $ne: "channel_remove" } }).catch(() => {});
  channel.members = remainingMembers;
  channel.managers = (channel.managers || []).filter((manager) => !manager.equals(userId));
  await channel.save();

  const payload = channel.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
  removeUserFromChannel(userId.toString(), channel._id.toString());
  return { channel: payload, left: true, ...(transferredTo ? { managerTransferredTo: transferredTo } : {}) };
}

async function resolveChannel(channelKey) {
  const key = String(channelKey || "").trim();
  return mongoose.isValidObjectId(key)
    ? Channel.findById(key)
    : Channel.findOne({ name: normalizeChannelName(key) });
}

async function visibleMessage(channelKey, messageId, userId) {
  if (!mongoose.isValidObjectId(messageId)) return null;
  const channel = await findVisibleChannel(channelKey, userId);
  if (!channel) return null;
  const message = await Message.findOne({ _id: messageId, channel: channel._id }).populate("author");
  return message ? { channel, message } : null;
}

function validObjectId(value) {
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

async function createChannel({ name, type, topic, description, readOnly, userId }) {
  const normalized = String(name || "").trim().toLowerCase();
  const visibility = type === "private" ? "private" : "public";
  if (!isValidChannelName(normalized) || normalized === "general") return { error: "Invalid or reserved channel name" };
  if (await Channel.exists({ name: normalized })) return { error: "Channel name already exists" };
  const channel = await Channel.create({
    name: normalized,
    type: visibility,
    topic: String(topic || "").trim().slice(0, 250),
    description: String(description || "").trim().slice(0, 2000),
    members: [userId],
    createdBy: userId,
    managers: [userId],
    readOnly: !!readOnly,
  });
  joinUserToChannel(userId.toString(), channel._id.toString());
  emitAll("channel:catalog", { channel: channel.toPublicJSON() });
  return { channel: channel.toPublicJSON() };
}

async function uploadAttachment({ data, name, contentType }) {
  const buffer = Buffer.from(String(data || ""), "base64");
  if (!buffer.length) return { error: "File data is empty or invalid base64" };
  if (buffer.length > config.maxUploadBytes) return { error: "File exceeds Echo's upload size limit" };
  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime || String(contentType || "application/octet-stream");
  if (["image/svg+xml", "text/html", "text/javascript", "application/javascript"].includes(mime)) return { error: "This file type is not allowed" };
  const key = await putObject({ buffer, name: String(name || "file").slice(0, 255), contentType: mime });
  return { key, name: String(name || "file").slice(0, 255), size: buffer.length, contentType: mime, isImage: /^image\//.test(mime) };
}

function publicMessage(message) {
  return message.toPublicJSON();
}

function registerTools(server, user) {
  const userId = user._id;

  server.registerTool(
    "echo_list_channels",
    {
      title: "List Echo channels",
      description: "List public Echo channels and private channels the authenticated user belongs to.",
      inputSchema: { includeArchived: z.boolean().optional().default(false) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ includeArchived }) => {
      const channels = await Channel.find({
        ...(includeArchived ? {} : { isArchived: false }),
        $or: [{ type: "public" }, { members: userId }],
      }).sort({ name: 1 });
      return textResult({ channels: channels.map((channel) => channel.toPublicJSON()) });
    }
  );

  server.registerTool(
    "echo_create_channel",
    {
      title: "Create an Echo channel",
      description: "Create a public or private channel and make the authenticated user its owner and manager.",
      inputSchema: {
        name: z.string().min(1).max(64),
        type: z.enum(["public", "private"]).optional().default("public"),
        topic: z.string().max(250).optional(),
        description: z.string().max(2000).optional(),
        readOnly: z.boolean().optional().default(false),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (input) => {
      const result = await createChannel({ ...input, userId });
      return result.error ? toolError(result.error) : textResult(result);
    }
  );

  server.registerTool(
    "echo_update_channel",
    {
      title: "Update an Echo channel",
      description: "Update channel name, visibility, topic, description, or read-only posting settings according to Echo permissions.",
      inputSchema: {
        channel: z.string().min(1).max(64),
        name: z.string().max(64).optional(),
        type: z.enum(["public", "private"]).optional(),
        topic: z.string().max(250).optional(),
        description: z.string().max(2000).optional(),
        readOnly: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, name, type, topic, description, readOnly }) => {
      const channel = await resolveChannel(channelKey);
      if (!channel || channel.isArchived || channel.type === "dm") return toolError("Channel not found or cannot be updated");
      const manager = isChannelManager(channel, userId);
      const member = channel.members.some((id) => id.equals(userId));
      if ((name !== undefined || type !== undefined || readOnly !== undefined) && !manager) return toolError("Only the channel creator or a manager can change these settings");
      if ((topic !== undefined || description !== undefined) && !member) return toolError("Join the channel to edit its details");
      if (name !== undefined) {
        const normalized = String(name).trim().toLowerCase();
        if (channel.name === "general" || normalized === "general" || !isValidChannelName(normalized)) return toolError("Invalid or reserved channel name");
        if (await Channel.exists({ name: normalized, _id: { $ne: channel._id } })) return toolError("Channel name already exists");
        channel.name = normalized;
      }
      if (type !== undefined) {
        if (channel.type === "public" && type === "private") return toolError("Public channels cannot be made private");
        if (!channel.createdBy.equals(userId)) return toolError("Only the channel creator can change visibility");
        channel.type = type;
      }
      if (topic !== undefined) channel.topic = String(topic).trim();
      if (description !== undefined) channel.description = String(description).trim();
      if (readOnly !== undefined) channel.readOnly = readOnly;
      await channel.save();
      const payload = channel.toPublicJSON();
      emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
      emitAll("channel:catalog", { channel: payload });
      return textResult({ channel: payload });
    }
  );

  server.registerTool(
    "echo_delete_channel",
    {
      title: "Archive an Echo channel",
      description: "Archive an empty channel owned by the authenticated user.",
      inputSchema: { channel: z.string().min(1).max(64) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey }) => {
      const channel = await resolveChannel(channelKey);
      if (!channel || channel.isArchived || channel.type === "dm") return toolError("Channel not found or cannot be archived");
      if (!channel.createdBy.equals(userId)) return toolError("Only the channel creator can archive it");
      if (channel.members.some((id) => !id.equals(userId))) return toolError("Remove all other members before archiving the channel");
      channel.isArchived = true;
      channel.members = [];
      channel.managers = [];
      await channel.save();
      removeUserFromChannel(userId.toString(), channel._id.toString());
      emitAll("channel:catalog", { channel: channel.toPublicJSON() });
      return textResult({ ok: true, channel: channel.toPublicJSON() });
    }
  );

  server.registerTool(
    "echo_add_channel_member",
    {
      title: "Add a member to an Echo channel",
      description: "Add a user to a public or private channel. Public channels allow self-service membership; private channels require an existing member.",
      inputSchema: { channel: z.string().min(1).max(64), user: z.string().min(1).max(128) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, user: userKey }) => {
      const channel = await resolveChannel(channelKey);
      if (!channel || channel.isArchived || channel.type === "dm") return toolError("Channel not found or cannot add members");
      const target = validObjectId(userKey) ? await User.findById(userKey) : await User.findOne({ username: String(userKey).toLowerCase() });
      if (!target) return toolError("User not found");
      const requesterMember = channel.members.some((id) => id.equals(userId));
      if (channel.type === "private" && !requesterMember) return toolError("Join the private channel before adding others");
      if (channel.name === "general" && target._id.equals(userId)) return textResult({ channel: channel.toPublicJSON(), added: false });
      const already = channel.members.some((id) => id.equals(target._id));
      if (!already) {
        channel.members.push(target._id);
        await channel.save();
        await Read.updateOne({ user: target._id, channel: channel._id, thread: null }, { $set: { lastReadAt: new Date() } }, { upsert: true });
        joinUserToChannel(target._id.toString(), channel._id.toString());
        emitToChannel(channel._id.toString(), "channel:update", { channel: channel.toPublicJSON() });
        emitAll("channel:catalog", { channel: channel.toPublicJSON() });
      }
      return textResult({ channel: channel.toPublicJSON(), added: !already, user: target.toPublicJSON() });
    }
  );

  server.registerTool(
    "echo_remove_channel_member",
    {
      title: "Remove a member from an Echo channel",
      description: "Remove a member from a channel. Managers cannot remove the channel creator.",
      inputSchema: { channel: z.string().min(1).max(64), user: z.string().min(1).max(128) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey, user: userKey }) => {
      const channel = await resolveChannel(channelKey);
      if (!channel || channel.isArchived || channel.type === "dm") return toolError("Channel not found or cannot remove members");
      if (!isChannelManager(channel, userId)) return toolError("Only the channel creator or a manager can remove members");
      const target = validObjectId(userKey) ? await User.findById(userKey) : await User.findOne({ username: String(userKey).toLowerCase() });
      if (!target || !channel.members.some((id) => id.equals(target._id))) return toolError("Member not found in channel");
      if (target._id.equals(channel.createdBy)) return toolError("The channel creator cannot be removed");
      channel.members = channel.members.filter((id) => !id.equals(target._id));
      channel.managers = (channel.managers || []).filter((id) => !id.equals(target._id));
      await channel.save();
      removeUserFromChannel(target._id.toString(), channel._id.toString());
      emitToChannel(channel._id.toString(), "channel:update", { channel: channel.toPublicJSON() });
      emitAll("channel:catalog", { channel: channel.toPublicJSON() });
      return textResult({ channel: channel.toPublicJSON(), removed: true, user: target.toPublicJSON() });
    }
  );

  server.registerTool(
    "echo_promote_channel_manager",
    {
      title: "Promote an Echo channel manager",
      description: "Promote an existing channel member to manager.",
      inputSchema: { channel: z.string().min(1).max(64), user: z.string().min(1).max(128) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, user: userKey }) => {
      const channel = await resolveChannel(channelKey);
      if (!channel || channel.isArchived || channel.type === "dm") return toolError("Channel not found or cannot manage");
      if (!isChannelManager(channel, userId)) return toolError("Only the channel creator or a manager can promote managers");
      const target = validObjectId(userKey) ? await User.findById(userKey) : await User.findOne({ username: String(userKey).toLowerCase() });
      if (!target || !channel.members.some((id) => id.equals(target._id))) return toolError("Manager must be a channel member");
      if (!channel.managers.some((id) => id.equals(target._id))) channel.managers.push(target._id);
      await channel.save();
      emitToChannel(channel._id.toString(), "channel:update", { channel: channel.toPublicJSON() });
      return textResult({ channel: channel.toPublicJSON(), promoted: true });
    }
  );

  server.registerTool(
    "echo_search_messages",
    {
      title: "Search Echo messages",
      description: "Search messages visible to the authenticated Echo user. Searches message text only.",
      inputSchema: {
        query: z.string().min(1).max(200),
        channel: z.string().max(64).optional(),
        limit: z.number().int().min(1).max(MAX_RESULTS).optional().default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, channel: channelKey, limit }) => {
      const visibleChannels = await Channel.find({
        isArchived: false,
        $or: [{ type: "public" }, { members: userId }],
      }, { _id: 1, name: 1, type: 1 });
      let channels = visibleChannels;
      if (channelKey) {
        const requested = visibleChannels.find((item) => item.name === normalizeChannelName(channelKey));
        if (!requested) return textResult({ query, results: [] });
        channels = [requested];
      }
      const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      const filter = {
        channel: { $in: channels.map((item) => item._id) },
        kind: { $ne: "system" },
        $and: terms.map((term) => ({ body: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } })),
      };
      const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).populate("author");
      const channelNames = new Map(channels.map((item) => [item._id.toString(), item.name]));
      return textResult({
        query,
        results: docs.map((message) => ({
          ...publicMessage(message),
          channelName: channelNames.get(message.channel.toString()) || null,
        })),
      });
    }
  );

  server.registerTool(
    "echo_join_channel",
    {
      title: "Join an Echo channel",
      description: "Join a public Echo channel. Private channels are invite-only.",
      inputSchema: { channel: z.string().min(1).max(64) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey }) => {
      const result = await joinPublicChannel(channelKey, userId);
      if (result.error) return toolError(result.error);
      return textResult(result);
    }
  );

  server.registerTool(
    "echo_leave_channel",
    {
      title: "Leave an Echo channel",
      description: "Leave a channel. Channel owners must transfer management to an existing member before leaving; #general and direct messages cannot be left.",
      inputSchema: {
        channel: z.string().min(1).max(64),
        managerId: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey, managerId }) => {
      const result = await leaveChannel(channelKey, userId, managerId);
      if (result.error) return toolError(result.error);
      return textResult(result);
    }
  );

  server.registerTool(
    "echo_get_channel_messages",
    {
      title: "Read Echo channel messages",
      description: "Read recent messages from a channel visible to the authenticated Echo user.",
      inputSchema: {
        channel: z.string().min(1).max(64),
        limit: z.number().int().min(1).max(MAX_RESULTS).optional().default(20),
        before: z.string().datetime().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey, limit, before }) => {
      const channel = await findVisibleChannel(channelKey, userId);
      if (!channel) return toolError("Channel not found or access denied");
      const query = {
        channel: channel._id,
        parentId: null,
        ...(before ? { createdAt: { $lt: new Date(before) } } : {}),
      };
      const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).populate("author");
      return textResult({ channel: channel.toPublicJSON(), messages: messages.reverse().map(publicMessage) });
    }
  );

  server.registerTool(
    "echo_send_message",
    {
      title: "Send an Echo message",
      description: "Send a text, threaded, structured, or attachment message to an Echo channel as the authenticated user.",
      inputSchema: {
        channel: z.string().min(1).max(64),
        body: z.string().max(4000).optional().default(""),
        parentId: z.string().optional(),
        broadcastToChannel: z.boolean().optional().default(false),
        idempotencyKey: z.string().max(128).optional(),
        attachments: z.array(z.object({ key: z.string(), name: z.string().optional(), size: z.number().optional(), contentType: z.string().optional(), isImage: z.boolean().optional(), width: z.number().optional(), height: z.number().optional() })).max(10).optional(),
        survey: z.object({ question: z.string(), options: z.array(z.object({ label: z.string() })), allowMultiple: z.boolean().optional() }).optional(),
        retro: z.object({ title: z.string() }).optional(),
        card: z.record(z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, body, parentId, broadcastToChannel, idempotencyKey, attachments, survey: rawSurvey, retro: rawRetro, card: rawCard }) => {
      const channel = await findVisibleChannel(channelKey, userId);
      if (!channel) return toolError("Channel not found or access denied");
      if (!canPostToChannel(channel, userId)) return toolError("Only channel managers can post in this channel");
      if (parentId && !mongoose.isValidObjectId(parentId)) return toolError("Invalid parent message id");
      const attachmentError = attachmentLimitError(attachments);
      if (attachmentError) return toolError(attachmentError);
      if (surveyError(rawSurvey)) return toolError(surveyError(rawSurvey));
      if (retroError(rawRetro)) return toolError(retroError(rawRetro));
      const card = sanitizeCard(rawCard);
      if (cardError(rawCard)) return toolError(cardError(rawCard));
      const survey = sanitizeSurvey(rawSurvey);
      const retro = sanitizeRetro(rawRetro);
      const files = sanitizeAttachments(attachments);
      if (!String(body || "").trim() && !files.length && !survey && !retro && !card) return toolError("Message needs text, an attachment, or structured content");
      if (idempotencyKey) {
        const existing = await Message.findOne({ channel: channel._id, author: userId, idempotencyKey }).populate("author");
        if (existing) return textResult({ message: publicMessage(existing), idempotent: true });
      }
      const message = await deliverMessage({
        channel,
        authorId: userId,
        body: String(body || "").trim(),
        parentId: parentId || null,
        broadcastToChannel,
        idempotencyKey: idempotencyKey || null,
        attachments: files,
        survey,
        retro,
        card,
      });
      return textResult({ message });
    }
  );

  server.registerTool(
    "echo_create_dm",
    {
      title: "Open an Echo direct message",
      description: "Open or create a direct message with one user, several users, or yourself.",
      inputSchema: { users: z.array(z.string().min(1).max(128)).max(9).optional().default([]) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ users: userKeys }) => {
      const targets = [];
      for (const key of userKeys) {
        const target = validObjectId(key) ? await User.findById(key) : await User.findOne({ username: String(key).toLowerCase() });
        if (!target) return toolError(`User not found: ${key}`);
        if (!target._id.equals(userId)) targets.push(target._id);
      }
      const channel = targets.length === 0
        ? await ensureSelfDmChannel(userId)
        : targets.length === 1
          ? await ensureDmChannel(userId, targets[0])
          : await ensureGroupDmChannel(userId, targets);
      return textResult({ channel: channel.toPublicJSON() });
    }
  );

  server.registerTool(
    "echo_upload_file",
    {
      title: "Upload an Echo file",
      description: "Upload a base64-encoded file to Echo and return an attachment descriptor for echo_send_message or echo_schedule_message.",
      inputSchema: { data: z.string().min(1), name: z.string().max(255).optional(), contentType: z.string().max(100).optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (input) => {
      const result = await uploadAttachment(input);
      return result.error ? toolError(result.error) : textResult({ attachment: result });
    }
  );

  server.registerTool(
    "echo_list_dms",
    {
      title: "List Echo direct messages",
      description: "List direct-message and group-DM conversations visible to the authenticated user.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const channels = await Channel.find({ type: "dm", members: userId }).sort({ updatedAt: -1 });
      return textResult({ channels: channels.map((channel) => channel.toPublicJSON()) });
    }
  );

  server.registerTool(
    "echo_get_thread",
    {
      title: "Read an Echo thread",
      description: "Read a thread root and its replies in a visible channel.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found) return toolError("Thread not found or access denied");
      const rootId = found.message.parentId || found.message._id;
      const root = await Message.findOne({ _id: rootId, channel: found.channel._id }).populate("author");
      const replies = await Message.find({ channel: found.channel._id, parentId: rootId }).sort({ createdAt: 1 }).populate("author");
      return textResult({ channel: found.channel.toPublicJSON(), root: publicMessage(root), replies: replies.map(publicMessage) });
    }
  );

  server.registerTool(
    "echo_react_to_message",
    {
      title: "React to an Echo message",
      description: "Toggle the authenticated user's reaction on a visible message.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string(), emoji: z.string().min(1).max(64), present: z.boolean().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId, emoji, present }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found) return toolError("Message not found or access denied");
      const result = await applyReaction({ messageId: found.message._id, userId, emoji: emoji.trim(), present });
      const reactions = reactionSummary(result.message);
      emitToChannel(found.channel._id.toString(), "message:reaction", { messageId: messageId.toString(), reactions });
      return textResult({ messageId: messageId.toString(), reactions, added: result.added, changed: result.changed });
    }
  );

  server.registerTool(
    "echo_save_message",
    {
      title: "Save an Echo message",
      description: "Toggle a visible message in the authenticated user's saved messages.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string(), saved: z.boolean().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId, saved }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found) return toolError("Message not found or access denied");
      const me = await User.findById(userId);
      const index = me.savedMessages.findIndex((id) => id.equals(found.message._id));
      const next = saved === undefined ? index < 0 : saved;
      if (next && index < 0) me.savedMessages.push(found.message._id);
      if (!next && index >= 0) me.savedMessages.splice(index, 1);
      await me.save();
      return textResult({ messageId: messageId.toString(), saved: next });
    }
  );

  server.registerTool(
    "echo_pin_message",
    {
      title: "Pin an Echo message",
      description: "Pin or unpin a visible message in a channel.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string(), pinned: z.boolean().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId, pinned }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found) return toolError("Message not found or access denied");
      const next = pinned === undefined ? !found.message.pinnedAt : pinned;
      found.message.pinnedAt = next ? new Date() : null;
      found.message.pinnedBy = next ? userId : null;
      await found.message.save();
      emitToChannel(found.channel._id.toString(), "message:update", publicMessage(found.message));
      return textResult({ messageId: messageId.toString(), pinned: next });
    }
  );

  server.registerTool(
    "echo_list_saved_messages",
    {
      title: "List saved Echo messages",
      description: "List the authenticated user's saved messages that remain accessible.",
      inputSchema: { limit: z.number().int().min(1).max(MAX_RESULTS).optional().default(20) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      const me = await User.findById(userId);
      const ids = (me.savedMessages || []).slice().reverse();
      const messages = await Message.find({ _id: { $in: ids } }).populate("author");
      const visibleResults = await Promise.all(messages.map(async (message) => ({ message, channel: await findVisibleChannel(message.channel.toString(), userId) })));
      const visible = visibleResults.filter((item) => item.channel).map((item) => item.message);
      const byId = new Map(visible.map((message) => [message._id.toString(), message]));
      return textResult({ messages: ids.map((id) => byId.get(id.toString())).filter(Boolean).slice(0, limit).map(publicMessage) });
    }
  );

  server.registerTool(
    "echo_list_pinned_messages",
    {
      title: "List pinned Echo messages",
      description: "List pinned messages in a visible channel.",
      inputSchema: { channel: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey }) => {
      const channel = await findVisibleChannel(channelKey, userId);
      if (!channel) return toolError("Channel not found or access denied");
      const messages = await Message.find({ channel: channel._id, pinnedAt: { $ne: null } }).sort({ pinnedAt: 1 }).populate("author");
      return textResult({ channel: channel.toPublicJSON(), messages: messages.map(publicMessage) });
    }
  );

  server.registerTool(
    "echo_mark_read",
    {
      title: "Mark an Echo channel read",
      description: "Mark a channel or thread as read for the authenticated user.",
      inputSchema: { channel: z.string().min(1).max(64), thread: z.string().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, thread }) => {
      const found = await findVisibleChannel(channelKey, userId);
      if (!found) return toolError("Channel not found or access denied");
      if (thread && !mongoose.isValidObjectId(thread)) return toolError("Invalid thread id");
      await Read.updateOne({ user: userId, channel: found._id, thread: thread || null }, { $set: { lastReadAt: new Date() } }, { upsert: true });
      return textResult({ channelId: found._id.toString(), thread: thread || null, read: true });
    }
  );

  server.registerTool(
    "echo_follow_thread",
    {
      title: "Follow an Echo thread",
      description: "Follow or mute a thread in a visible channel.",
      inputSchema: { channel: z.string().min(1).max(64), thread: z.string(), following: z.boolean().nullable() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, thread, following }) => {
      const found = await visibleMessage(channelKey, thread, userId);
      if (!found || found.message.parentId) return toolError("Thread not found or access denied");
      if (following === null) await ThreadFollow.deleteOne({ user: userId, thread: found.message._id });
      else await ThreadFollow.updateOne({ user: userId, thread: found.message._id }, { $set: { following }, $setOnInsert: { channel: found.channel._id } }, { upsert: true });
      return textResult({ threadId: found.message._id.toString(), following: following === true, muted: following === false });
    }
  );

  server.registerTool(
    "echo_edit_message",
    {
      title: "Edit an Echo message",
      description: "Edit a message authored by the authenticated user.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string(), body: z.string().min(1).max(4000) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId, body }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found) return toolError("Message not found or access denied");
      if (!found.message.author._id.equals(userId)) return toolError("You can only edit your own messages");
      found.message.body = body.trim();
      found.message.editedAt = new Date();
      await found.message.save();
      emitToChannel(found.channel._id.toString(), "message:update", publicMessage(found.message));
      return textResult({ message: publicMessage(found.message) });
    }
  );

  server.registerTool(
    "echo_delete_message",
    {
      title: "Delete an Echo message",
      description: "Delete a message authored by the authenticated user by marking it as deleted.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found) return toolError("Message not found or access denied");
      if (!found.message.author._id.equals(userId)) return toolError("You can only delete your own messages");
      found.message.body = "[deleted]";
      found.message.attachments = [];
      found.message.editedAt = new Date();
      await found.message.save();
      emitToChannel(found.channel._id.toString(), "message:update", publicMessage(found.message));
      return textResult({ messageId: messageId.toString(), deleted: true });
    }
  );

  server.registerTool(
    "echo_vote_survey",
    {
      title: "Vote in an Echo survey",
      description: "Replace the authenticated user's survey selection; pass an empty optionIds array to clear it.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string(), optionIds: z.array(z.string()).max(10) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId, optionIds }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found || !found.message.survey) return toolError("Survey not found or access denied");
      try {
        const updated = await (await import("./deliver.js")).applySurveyVote(found.message, userId, optionIds);
        const survey = updated.toPublicJSON().survey;
        emitToChannel(found.channel._id.toString(), "message:survey", { messageId: messageId.toString(), survey });
        return textResult({ messageId: messageId.toString(), survey });
      } catch (error) {
        return toolError(error.message);
      }
    }
  );

  server.registerTool(
    "echo_update_retro",
    {
      title: "Update an Echo retrospective",
      description: "Add, move, edit, or delete an item on a retrospective message.",
      inputSchema: { channel: z.string().min(1).max(64), messageId: z.string(), action: z.enum(["add", "move", "edit", "delete"]), text: z.string().optional(), column: z.string().optional(), itemId: z.string().optional(), link: z.string().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, messageId, action, text: itemText, column, itemId, link }) => {
      const found = await visibleMessage(channelKey, messageId, userId);
      if (!found || !found.message.retro) return toolError("Retrospective not found or access denied");
      try {
        const updated = await updateRetro(found.message, userId, { action, text: itemText, column, itemId, link });
        emitToChannel(found.channel._id.toString(), "message:update", publicMessage(updated));
        return textResult({ message: publicMessage(updated) });
      } catch (error) {
        return toolError(error.message);
      }
    }
  );

  server.registerTool(
    "echo_schedule_message",
    {
      title: "Schedule an Echo message",
      description: "Schedule a message for future delivery in a visible channel.",
      inputSchema: { channel: z.string().min(1).max(64), body: z.string().max(4000).optional().default(""), scheduledFor: z.string().datetime(), parentId: z.string().optional(), attachments: z.array(z.object({ key: z.string(), name: z.string().optional(), size: z.number().optional(), contentType: z.string().optional(), isImage: z.boolean().optional() })).max(10).optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ channel: channelKey, body, scheduledFor, parentId, attachments }) => {
      const channel = await findVisibleChannel(channelKey, userId);
      if (!channel) return toolError("Channel not found or access denied");
      if (!canPostToChannel(channel, userId)) return toolError("Only channel managers can post in this channel");
      const when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime()) || when <= new Date()) return toolError("scheduledFor must be a future time");
      const files = sanitizeAttachments(attachments);
      const scheduled = await ScheduledMessage.create({ channel: channel._id, author: userId, body: String(body || "").trim(), parentId: parentId && validObjectId(parentId), attachments: files, scheduledFor: when });
      return textResult({ scheduled: scheduled.toPublicJSON() });
    }
  );

  server.registerTool(
    "echo_list_scheduled_messages",
    {
      title: "List scheduled Echo messages",
      description: "List the authenticated user's pending scheduled messages.",
      inputSchema: { channel: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey }) => {
      const filter = { author: userId, scheduledFor: { $gt: new Date() } };
      if (channelKey) {
        const channel = await findVisibleChannel(channelKey, userId);
        if (!channel) return toolError("Channel not found or access denied");
        filter.channel = channel._id;
      }
      const scheduled = await ScheduledMessage.find(filter).sort({ scheduledFor: 1 });
      return textResult({ scheduled: scheduled.map((item) => item.toPublicJSON()) });
    }
  );

  server.registerTool(
    "echo_cancel_scheduled_message",
    {
      title: "Cancel a scheduled Echo message",
      description: "Cancel one of the authenticated user's pending scheduled messages.",
      inputSchema: { messageId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ messageId }) => {
      if (!mongoose.isValidObjectId(messageId)) return toolError("Scheduled message not found");
      const deleted = await ScheduledMessage.deleteOne({ _id: messageId, author: userId });
      if (!deleted.deletedCount) return toolError("Scheduled message not found");
      return textResult({ messageId, cancelled: true });
    }
  );

  server.registerTool(
    "echo_list_users",
    {
      title: "List Echo users",
      description: "List users in the Echo workspace.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const users = await User.find({ username: { $ne: "system" } }).sort({ displayName: 1 }).limit(500);
      return textResult({ users: users.map((item) => item.toPublicJSON()) });
    }
  );
}

export function createMcpServer(user) {
  const server = new McpServer({ name: "echo", version: "0.42.0" });
  registerTools(server, user);
  return server;
}

// Stateless Streamable HTTP is intentional: Echo can run multiple server
// replicas without keeping MCP sessions in process memory.
export async function handleMcpRequest(req, res) {
  const server = createMcpServer(req.user);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  } finally {
    await server.close().catch(() => {});
  }
}
