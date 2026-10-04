import mongoose from "mongoose";
import { ActivityEvent } from "../models/ActivityEvent.js";
import { Channel, isChannelManager } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";
import { User } from "../models/User.js";
import { normalizeChannelName } from "../automation.js";
import { isValidChannelName } from "../lib/channelName.js";
import { emitAll, emitToChannel, emitToUser, joinUserToChannel, removeUserFromChannel } from "../realtime.js";

export type ChannelActor = mongoose.Types.ObjectId | string;

export type ChannelOperationResult<T> = T | { error: string };

function sameId(left: ChannelActor | undefined, right: ChannelActor | undefined) {
  return String(left) === String(right);
}

async function logSystem(channelId: ChannelActor, authorId: ChannelActor, body: string) {
  const message = await Message.create({ channel: channelId, author: authorId, body, kind: "system" });
  await message.populate("author");
  emitToChannel(String(channelId), "message:new", {
    ...message.toPublicJSON(),
    replyCount: 0,
    lastReplyAt: null,
  });
  return message;
}

async function markChannelReadAtJoin(channelId: ChannelActor, userId: ChannelActor) {
  await Read.updateOne(
    { user: userId, channel: channelId, thread: null },
    { $set: { lastReadAt: new Date() } },
    { upsert: true },
  );
}

async function clearChannelStar(userId: ChannelActor, channelId: ChannelActor) {
  const user = await User.findById(userId);
  if (!user) return;
  const starredChannels = user.starredChannels || [];
  if (!starredChannels.some((id) => sameId(id, channelId))) return;
  user.starredChannels = starredChannels.filter((id) => !sameId(id, channelId));
  await user.save();
  emitToUser(String(userId), "starred:update", {
    channelId: String(channelId),
    starred: false,
  });
}

export async function resolveChannel(channelKey: string) {
  const key = String(channelKey || "").trim();
  return mongoose.isValidObjectId(key)
    ? Channel.findById(key)
    : Channel.findOne({ name: normalizeChannelName(key) });
}

export async function findVisibleChannel(channelKey: string, userId: ChannelActor) {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived) return null;
  if (channel.type !== "public" && !channel.members.some((member) => sameId(member, userId))) return null;
  return channel;
}

export async function createChannel({ name, type = "public", topic, description, readOnly = false, userId }: {
  name: string;
  type?: "public" | "private";
  topic?: string;
  description?: string;
  readOnly?: boolean;
  userId: ChannelActor;
}): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]> }>> {
  const normalized = String(name || "").trim().toLowerCase();
  if (!isValidChannelName(normalized) || normalized === "general") return { error: "Invalid or reserved channel name" };
  if (await Channel.exists({ name: normalized })) return { error: "Channel name already exists" };
  try {
    const channel = await Channel.create({
      name: normalized,
      type: type === "private" ? "private" : "public",
      topic: String(topic || "").trim().slice(0, 250),
      description: String(description || "").trim().slice(0, 2000),
      members: [userId],
      createdBy: userId,
      managers: [userId],
      readOnly: !!readOnly,
    });
    await logSystem(channel._id, userId, "created this channel");
    joinUserToChannel(String(userId), channel._id.toString());
    if (channel.type === "public") emitAll("channel:catalog", { channel: channel.toPublicJSON() });
    return { channel: channel.toPublicJSON() };
  } catch (error) {
    if (error?.name === "ValidationError") return { error: error.message };
    throw error;
  }
}

export async function joinChannel(channelKey: string, userId: ChannelActor): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]>; joined: boolean }>> {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived) return { error: "Channel not found" };
  const already = channel.members.some((member) => sameId(member, userId));
  if (channel.type !== "public" && !already) return { error: "Private channels are invite-only" };

  joinUserToChannel(String(userId), channel._id.toString());
  if (!already) {
    await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: userId } });
    await logSystem(channel._id, userId, "joined");
    await markChannelReadAtJoin(channel._id, userId);
  }
  const updated = await Channel.findById(channel._id);
  const payload = updated.toPublicJSON();
  if (!already) {
    emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
    if (channel.type === "public") emitAll("channel:catalog", { channel: payload });
  }
  return { channel: payload, joined: !already };
}

export async function addChannelMember(channelKey: string, actorId: ChannelActor, targetId: ChannelActor): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]>; added: boolean }>> {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived) return { error: "Channel not found or cannot add members" };
  if (channel.name === "general") return { error: "everyone is automatically a member of #general" };
  const isGroupDm = channel.type === "dm" && channel.members.length > 2;
  if (channel.type === "dm" && !isGroupDm) return { error: "Channel not found or cannot add members" };
  if (isGroupDm && channel.members.length >= 10) return { error: "group DMs are limited to 10 people" };
  const actorIsMember = channel.members.some((member) => sameId(member, actorId));
  if ((channel.type === "private" || isGroupDm) && !actorIsMember) return { error: "join the channel before adding others" };
  const target = await User.findById(targetId);
  if (!target) return { error: "User not found" };
  const already = channel.members.some((member) => sameId(member, target._id));
  if (!already) {
    await Channel.updateOne({ _id: channel._id }, { $addToSet: { members: target._id } });
    joinUserToChannel(target._id.toString(), channel._id.toString());
    emitToUser(target._id.toString(), "channel:added", { channelId: channel._id.toString() });
    if (!sameId(target._id, actorId)) {
      await ActivityEvent.updateOne(
        { recipient: target._id, actor: actorId, message: channel._id, emoji: "" },
        { $set: { type: "channel_add", channel: channel._id, createdAt: new Date() } },
        { upsert: true },
      ).catch(() => {});
      emitToUser(target._id.toString(), "activity:bump");
    }
    await logSystem(channel._id, target._id, "was added");
    await markChannelReadAtJoin(channel._id, target._id);
  }
  const updated = await Channel.findById(channel._id);
  const payload = updated.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
  if (channel.type === "public") emitAll("channel:catalog", { channel: payload });
  return { channel: payload, added: !already };
}

export async function promoteChannelManager(channelKey: string, actorId: ChannelActor, targetId: ChannelActor): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]>; promoted: boolean }>> {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived || channel.type === "dm") return { error: "Channel not found or cannot manage" };
  if (channel.name === "general") return { error: "#general does not have delegated managers" };
  if (!isChannelManager(channel, actorId)) return { error: "Only the channel creator or a manager can promote managers" };
  if (!channel.members.some((member) => sameId(member, targetId))) return { error: "Manager must be a channel member" };
  if (sameId(channel.createdBy, targetId)) return { error: "The channel creator is already the owner" };
  const already = (channel.managers || []).some((manager) => sameId(manager, targetId));
  if (!already) await Channel.updateOne({ _id: channel._id }, { $addToSet: { managers: targetId } });
  const updated = await Channel.findById(channel._id);
  const payload = updated.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
  if (channel.type === "public") emitAll("channel:catalog", { channel: payload });
  return { channel: payload, promoted: !already };
}

export async function removeChannelMember(channelKey: string, actorId: ChannelActor, targetId: ChannelActor): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]>; removed: boolean }>> {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived || channel.type === "dm") return { error: "Channel not found or cannot remove members" };
  if (channel.name === "general") return { error: "everyone is a member of #general" };
  if (!isChannelManager(channel, actorId)) return { error: "Only the channel creator or a manager can remove members" };
  if (sameId(channel.createdBy, targetId)) return { error: "The channel creator cannot be removed" };
  const wasMember = channel.members.some((member) => sameId(member, targetId));
  await Channel.updateOne({ _id: channel._id }, { $pull: { members: targetId, managers: targetId } });
  const updated = await Channel.findById(channel._id);
  if (wasMember) {
    await ActivityEvent.deleteMany({ recipient: targetId, channel: channel._id, type: { $ne: "channel_remove" } }).catch(() => {});
    removeUserFromChannel(String(targetId), channel._id.toString());
    await clearChannelStar(targetId, channel._id);
    emitToUser(String(targetId), "channel:removed", { channelId: channel._id.toString() });
    const systemMessage = await logSystem(channel._id, targetId, "was removed from the channel");
    await ActivityEvent.updateOne(
      { recipient: targetId, actor: actorId, message: systemMessage._id, emoji: "" },
      { $set: { type: "channel_remove", channel: channel._id, createdAt: new Date() } },
      { upsert: true },
    ).catch(() => {});
    emitToUser(String(targetId), "activity:bump");
  }
  return { channel: updated.toPublicJSON(), removed: wasMember };
}

export async function updateChannel(channelKey: string, actorId: ChannelActor, changes: {
  name?: unknown;
  type?: unknown;
  topic?: unknown;
  description?: unknown;
  readOnly?: unknown;
}): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]> }>> {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived) return { error: "channel not found" };
  if (channel.type === "dm") return { error: "cannot change a direct message" };

  const currentName = channel.name;
  let renamed = false;
  if (changes.name !== undefined) {
    if (!isChannelManager(channel, actorId)) return { error: "only the channel creator or a manager can rename this channel" };
    if (currentName.toLowerCase() === "general") return { error: "the general channel cannot be renamed" };
    if (typeof changes.name !== "string") return { error: "channel name must be a string" };
    const normalizedName = changes.name.trim().toLowerCase();
    if (!isValidChannelName(normalizedName)) return { error: "channel names must use lowercase letters, numbers, and single dashes" };
    if (normalizedName === "general") return { error: "general is reserved for the default channel" };
    if (normalizedName !== currentName) {
      const existing = await Channel.findOne({ name: normalizedName, _id: { $ne: channel._id } }).select({ _id: 1 }).lean();
      if (existing) return { error: "channel name already exists" };
      channel.name = normalizedName;
      renamed = true;
    }
  }

  if (changes.readOnly !== undefined) {
    if (typeof changes.readOnly !== "boolean") return { error: "readOnly must be a boolean" };
    if (!isChannelManager(channel, actorId)) return { error: "only the channel creator or a manager can change posting settings" };
    channel.readOnly = changes.readOnly;
  }

  if (changes.type !== undefined) {
    if (changes.type !== "public" && changes.type !== "private") return { error: "type must be 'public' or 'private'" };
    if (!sameId(channel.createdBy, actorId)) return { error: "only the channel creator can change visibility" };
    if (channel.type === "public" && changes.type === "private") return { error: "public channels cannot be made private" };
    channel.type = changes.type;
  }

  if (changes.topic !== undefined || changes.description !== undefined) {
    if (!channel.members.some((member) => sameId(member, actorId))) return { error: "join the channel to edit its details" };
    if (changes.topic !== undefined) {
      if (String(changes.topic).length > 250) return { error: "topic must be 250 characters or fewer" };
      channel.topic = String(changes.topic).trim();
    }
    if (changes.description !== undefined) {
      if (String(changes.description).length > 2000) return { error: "description must be 2000 characters or fewer" };
      channel.description = String(changes.description).trim();
    }
  }

  try {
    await channel.save();
  } catch (error) {
    if (error?.code === 11000 && (error?.keyPattern?.name || error?.keyValue?.name)) return { error: "channel name already exists" };
    throw error;
  }
  if (renamed) await logSystem(channel._id, actorId, `renamed this channel to #${channel.name}`);
  const payload = channel.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
  emitAll("channel:catalog", { channel: payload });
  return { channel: payload };
}

export async function leaveChannel(channelKey: string, userId: ChannelActor, managerId?: ChannelActor): Promise<ChannelOperationResult<{ channel: ReturnType<Channel["toPublicJSON"]>; left: boolean; managerTransferredTo?: string }>> {
  const channel = await resolveChannel(channelKey);
  if (!channel || channel.isArchived) return { error: "Channel not found" };
  if (channel.type === "dm") return { error: "Cannot leave a direct message" };
  if (!channel.members.some((member) => sameId(member, userId))) return { error: "You are not a member of this channel" };
  if (channel.name.toLowerCase() === "general") return { error: "#general is the default channel and cannot be left" };

  const remainingMembers = channel.members.filter((member) => !sameId(member, userId));
  const isCreator = sameId(channel.createdBy, userId);
  const hasRemainingManager = (channel.managers || []).some((manager) => remainingMembers.some((member) => sameId(member, manager)));
  let transferredTo: string | undefined;
  if (isCreator && remainingMembers.length > 0 && !hasRemainingManager) {
    if (!managerId || !mongoose.isValidObjectId(String(managerId))) return { error: "Choose a manager before leaving" };
    if (!remainingMembers.some((member) => sameId(member, managerId))) return { error: "Manager must be a member of the channel" };
    channel.managers = [...new Set([...(channel.managers || []).map(String), String(managerId)])];
    transferredTo = String(managerId);
  }
  if (isCreator && remainingMembers.length === 0) return { error: "Empty channels must be deleted instead" };

  if (channel.type === "private") {
    const messages = await Message.find({ channel: channel._id }, { _id: 1 }).lean();
    if (messages.length) await User.updateOne({ _id: userId }, { $pull: { savedMessages: { $in: messages.map((message) => message._id) } } });
  }
  await User.updateOne({ _id: userId }, { $pull: { starredChannels: channel._id } });
  await ActivityEvent.deleteMany({ recipient: userId, channel: channel._id, type: { $ne: "channel_remove" } }).catch(() => {});
  channel.members = remainingMembers;
  channel.managers = (channel.managers || []).filter((manager) => !sameId(manager, userId));
  await channel.save();

  const payload = channel.toPublicJSON();
  emitToChannel(channel._id.toString(), "channel:update", { channel: payload });
  removeUserFromChannel(String(userId), channel._id.toString());
  return { channel: payload, left: true, ...(transferredTo ? { managerTransferredTo: transferredTo } : {}) };
}
