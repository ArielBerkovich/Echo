import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { canParticipateInChannel, canPostToChannel, isChannelManager } from "./models/Channel.js";
import { sanitizeAttachments, attachmentLimitError, sanitizeSurvey, surveyError, sanitizeRetro, retroError, updateRetro } from "./deliver.js";
import { sanitizeCard, cardError } from "./lib/messageCard.js";
import { normalizeChannelName } from "./automation.js";
import { emitToChannel, joinUserToChannel } from "./realtime.js";
import { deleteMessage, editMessage, reactToMessage, toggleMessagePin, voteInSurvey } from "./services/messageActionService.js";
import { findMessageInChannel, getThreadMessages, listPinnedMessages } from "./services/messageQueryService.js";
import { findSearchableChannels, searchMessages } from "./services/messageSearchService.js";
import { queryChannelHistory } from "./services/messageHistoryService.js";
import { isValidChannelName } from "./lib/channelName.js";
import {
  addChannelMember,
  archiveChannel,
  createChannel,
  findVisibleChannel,
  joinChannel,
  promoteChannelManager,
  removeChannelMember,
  updateChannel,
  leaveChannel,
  listVisibleChannels,
} from "./services/channelService.js";
import { sendMessage } from "./services/messageService.js";
import { markRead, setThreadFollow, toggleSavedMessage } from "./services/userStateService.js";
import { listSavedMessages } from "./services/savedMessageService.js";
import { ensureDmChannel, ensureGroupDmChannel, ensureSelfDmChannel, listDmConversations } from "./services/conversationService.js";
import { findUserByIdOrUsername, listDirectoryUsers } from "./services/userDirectoryService.js";
import { isValidObjectId, validObjectId } from "./lib/objectId.js";
import { storeBase64Attachment } from "./services/attachmentService.js";
import {
  cancelScheduledMessage,
  createScheduledMessage,
  listScheduledMessages,
} from "./services/scheduledMessageService.js";

const MAX_RESULTS = 50;
const MAX_PAGE_SIZE = 100;

// Channel.toPublicJSON() is intentionally rich for the UI, but its members
// array can contain thousands of IDs. MCP callers need a channel reference and
// count, not the full membership roster on every response.
export function compactChannel(channel) {
  const value = typeof channel?.toPublicJSON === "function" ? channel.toPublicJSON() : channel;
  if (!value) return value;
  const compact = {
    id: value.id,
    name: value.name,
    type: value.type,
    topic: value.topic || "",
    description: value.description || "",
    memberCount: value.memberCount ?? value.members?.length ?? 0,
    createdBy: value.createdBy || null,
    readOnly: !!value.readOnly,
    createdAt: value.createdAt || null,
    isArchived: !!value.isArchived,
    external: value.external || null,
  };
  // DM membership is small and useful for identifying participants. Public
  // and private channel rosters stay omitted because they can be huge.
  if (value.type === "dm" && Array.isArray(value.members) && value.members.length <= 10) {
    compact.members = value.members;
  }
  return compact;
}

function compactChannelResult(result) {
  return result?.channel ? { ...result, channel: compactChannel(result.channel) } : result;
}

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

async function visibleMessage(channelKey, messageId, userId) {
  if (!isValidObjectId(messageId)) return null;
  const channel = await findVisibleChannel(channelKey, userId);
  if (!channel) return null;
  const message = await findMessageInChannel({ messageId, channelId: channel._id });
  return message ? { channel, message } : null;
}

function publicMessage(message) {
  return message.toPublicJSON();
}

export function compactMessage(message) {
  const value = typeof message?.toPublicJSON === "function" ? message.toPublicJSON() : message;
  const compact = {
    id: value.id,
    channelId: value.channelId,
    body: value.body,
    createdAt: value.createdAt,
    author: value.author,
  };
  const optionalFields = [
    "editedAt", "parentId", "externalKey", "automation", "passwordHelpRequest",
    "attachments", "survey", "retro", "card", "forwardedFrom", "pinnedAt", "pinnedBy", "reactions",
    "mentionedUserIds", "mentionedGroups", "mentionedChannels",
  ];
  for (const field of optionalFields) {
    const fieldValue = value[field];
    if (fieldValue === null || fieldValue === undefined) continue;
    if (Array.isArray(fieldValue) && fieldValue.length === 0) continue;
    if (fieldValue === "") continue;
    compact[field] = fieldValue;
  }
  if (value.kind && value.kind !== "user") compact.kind = value.kind;
  if (value.broadcastToChannel) compact.broadcastToChannel = true;
  if (value.mentionsEveryone) compact.mentionsEveryone = true;
  if (value.forwardNote) compact.forwardNote = value.forwardNote;
  return compact;
}

function registerTools(server, user) {
  const userId = user._id;

  server.registerTool(
    "echo_list_channels",
    {
      title: "List Echo channels",
      description: "List visible Echo channels in pages. Responses contain channel metadata and member counts, not full membership rosters.",
      inputSchema: {
        includeArchived: z.boolean().optional().default(false),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(50),
        offset: z.number().int().min(0).max(100000).optional().default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ includeArchived, limit, offset }) => {
      const channels = await listVisibleChannels(userId, includeArchived, { skip: offset, limit: limit + 1 });
      const hasMore = channels.length > limit;
      return textResult({
        channels: channels.slice(0, limit).map(compactChannel),
        offset,
        limit,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      });
    }
  );

  server.registerTool(
    "echo_get_channel_id",
    {
      title: "Get an Echo channel ID",
      description: "Get the ID of a visible Echo channel by its name or existing ID.",
      inputSchema: { channel: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ channel: channelKey }) => {
      const channel = await findVisibleChannel(channelKey, userId);
      if (!channel) return toolError("Channel not found or access denied");
      return textResult({ channelId: channel._id.toString() });
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
      return result.error ? toolError(result.error) : textResult(compactChannelResult(result));
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
      const result = await updateChannel(channelKey, userId, { name, type, topic, description, readOnly });
      return result.error ? toolError(result.error) : textResult(compactChannelResult(result));
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
      const result = await archiveChannel(channelKey, userId);
      if (result.error) {
        if (result.error === "only the channel creator can delete it") return toolError("Only the channel creator can archive it");
        if (result.error === "remove all other members before deleting the channel") return toolError("Remove all other members before archiving the channel");
        return toolError("Channel not found or cannot be archived");
      }
      return textResult({ ok: true, channel: compactChannel(result.channel) });
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
      const targetId = (await findUserByIdOrUsername(userKey))?._id;
      if (!targetId) return toolError("User not found");
      const result = await addChannelMember(channelKey, userId, targetId);
      return result.error ? toolError(result.error) : textResult(compactChannelResult(result));
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
      const targetId = (await findUserByIdOrUsername(userKey))?._id;
      if (!targetId) return toolError("Member not found in channel");
      const result = await removeChannelMember(channelKey, userId, targetId);
      return result.error ? toolError(result.error) : textResult(compactChannelResult(result));
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
      const targetId = (await findUserByIdOrUsername(userKey))?._id;
      if (!targetId) return toolError("Manager must be a channel member");
      const result = await promoteChannelManager(channelKey, userId, targetId);
      return result.error ? toolError(result.error) : textResult(compactChannelResult(result));
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
        offset: z.number().int().min(0).max(100000).optional().default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, channel: channelKey, limit, offset }) => {
      const visibleChannels = await findSearchableChannels({ userId, excludeArchived: true });
      let channels = visibleChannels;
      if (channelKey) {
        const requested = visibleChannels.find((item) => item.name === normalizeChannelName(channelKey));
        if (!requested) return textResult({ query, results: [] });
        channels = [requested];
      }
      const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 10);
      const docs = await searchMessages({ channelIds: channels.map((item) => item._id), terms, skip: offset, limit: limit + 1 });
      const channelNames = new Map(channels.map((item) => [item._id.toString(), item.name]));
      const hasMore = docs.length > limit;
      return textResult({
        query,
        results: docs.slice(0, limit).map((message) => ({
          ...compactMessage(message),
          channelName: channelNames.get(message.channel.toString()) || null,
        })),
        offset,
        limit,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
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
      const result = await joinChannel(channelKey, userId);
      if (result.error) return toolError(result.error);
      return textResult(compactChannelResult(result));
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
      return textResult(compactChannelResult(result));
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
      const history = await queryChannelHistory({
        channelId: channel._id,
        limit,
        before: before ? new Date(before) : undefined,
        includeBroadcastReplies: false,
        includeReplyStats: false,
      });
      if (!history) return toolError("Channel not found or access denied");
      const docs = history.docs.slice(0, limit);
      const hasMore = history.docs.length > limit;
      return textResult({
        channel: compactChannel(channel),
        messages: docs.reverse().map(compactMessage),
        hasMore,
        nextBefore: hasMore ? docs[0]?.createdAt || null : null,
      });
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
      if (!canParticipateInChannel(channel, userId)) return toolError("Join the channel to participate");
      if (!canPostToChannel(channel, userId)) return toolError("Only channel managers can post in this channel");
      if (parentId && !isValidObjectId(parentId)) return toolError("Invalid parent message id");
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
      const result = await sendMessage({
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
      return textResult(result);
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
        const target = await findUserByIdOrUsername(key);
        if (!target) return toolError(`User not found: ${key}`);
        if (!target._id.equals(userId)) targets.push(target._id);
      }
      const channel = targets.length === 0
        ? await ensureSelfDmChannel(userId)
        : targets.length === 1
          ? await ensureDmChannel(userId, targets[0])
          : await ensureGroupDmChannel(userId, targets);
      return textResult({ channel: compactChannel(channel) });
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
      const result = await storeBase64Attachment(input);
      return result.error ? toolError(result.error) : textResult({ attachment: result });
    }
  );

  server.registerTool(
    "echo_list_dms",
    {
      title: "List Echo direct messages",
      description: "List direct-message and group-DM conversations visible to the authenticated user. Channel records are compact summaries.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const { channels } = await listDmConversations({ userId });
      return textResult({ channels: channels.map(compactChannel) });
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
      const thread = await getThreadMessages({ channelId: found.channel._id, messageId: found.message._id, limit: MAX_RESULTS + 1 });
      if (!thread) return toolError("Thread not found or access denied");
      const replies = thread.replies.slice(0, MAX_RESULTS);
      return textResult({
        channel: compactChannel(found.channel),
        root: compactMessage(thread.root),
        replies: replies.map(compactMessage),
        hasMore: thread.replies.length > MAX_RESULTS,
      });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
      const result = await reactToMessage({ channel: found.channel, message: found.message, userId, emoji: emoji.trim(), present });
      return textResult({ messageId: messageId.toString(), reactions: result.reactions, added: result.added, changed: result.changed, present: result.present });
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
      const result = await toggleSavedMessage({ userId, messageId: found.message._id, saved });
      if (!result) return toolError("User not found");
      return textResult({ messageId: messageId.toString(), ...result });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
      const result = await toggleMessagePin({ channel: found.channel, message: found.message, userId, pinned });
      return textResult({ messageId: messageId.toString(), pinned: result.pinned });
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
      const result = await listSavedMessages({ userId, limit, excludeArchived: true });
      if (!result) return toolError("User not found");
      return textResult({ messages: result.messages.map(compactMessage) });
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
      const messages = await listPinnedMessages(channel._id, MAX_RESULTS + 1);
      const hasMore = messages.length > MAX_RESULTS;
      return textResult({ channel: compactChannel(channel), messages: messages.slice(0, MAX_RESULTS).map(compactMessage), hasMore });
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
      if (thread && !isValidObjectId(thread)) return toolError("Invalid thread id");
      const result = await markRead({ userId, channelId: found._id, threadId: thread || null });
      return textResult({ channelId: found._id.toString(), thread: result.thread || null, read: true });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
      const result = await setThreadFollow({ userId, threadId: found.message._id, channelId: found.channel._id, following });
      return textResult({ threadId: found.message._id.toString(), ...result });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
      if (!found.message.author._id.equals(userId)) return toolError("You can only edit your own messages");
      const result = await editMessage({ channel: found.channel, message: found.message, userId, body: body.trim() });
      return textResult({ message: publicMessage(result.message) });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
      if (!found.message.author._id.equals(userId)) return toolError("You can only delete your own messages");
      const result = await deleteMessage({ channel: found.channel, message: found.message, softDelete: true });
      return textResult({ messageId: result.messageId, deleted: true });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
      try {
        const result = await voteInSurvey({ channel: found.channel, message: found.message, userId, optionIds });
        return textResult({ messageId: messageId.toString(), survey: result.survey });
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
      if (!canParticipateInChannel(found.channel, userId)) return toolError("Join the channel to participate");
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
      if (!canParticipateInChannel(channel, userId)) return toolError("Join the channel to participate");
      if (!canPostToChannel(channel, userId)) return toolError("Only channel managers can post in this channel");
      const when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime()) || when <= new Date()) return toolError("scheduledFor must be a future time");
      const files = sanitizeAttachments(attachments);
      const scheduled = await createScheduledMessage({ channelId: channel._id, authorId: userId, body: String(body || "").trim(), parentId: parentId && validObjectId(parentId), attachments: files, scheduledFor: when });
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
      let channelId;
      if (channelKey) {
        const channel = await findVisibleChannel(channelKey, userId);
        if (!channel) return toolError("Channel not found or access denied");
        channelId = channel._id;
      }
      const scheduled = await listScheduledMessages({ authorId: userId, channelId, pendingOnly: true });
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
      if (!isValidObjectId(messageId)) return toolError("Scheduled message not found");
      const cancelled = await cancelScheduledMessage({ messageId, authorId: userId });
      if (!cancelled) return toolError("Scheduled message not found");
      return textResult({ messageId, cancelled: true });
    }
  );

  server.registerTool(
    "echo_list_users",
    {
      title: "List Echo users",
      description: "List Echo users in pages.",
      inputSchema: {
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(50),
        offset: z.number().int().min(0).max(100000).optional().default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit, offset }) => {
      const users = await listDirectoryUsers({ skip: offset, limit: limit + 1 });
      const hasMore = users.length > limit;
      return textResult({
        users: users.slice(0, limit).map((item) => item.toPublicJSON()),
        offset,
        limit,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      });
    }
  );
}

export function createMcpServer(user) {
  const server = new McpServer({ name: "echo", version: "0.45.0" });
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
