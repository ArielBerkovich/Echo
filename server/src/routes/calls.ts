import { Router } from "express";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { Channel } from "../models/Channel.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { config } from "../config.js";
import { emitToUser } from "../realtime.js";

export const callsRouter = Router();
callsRouter.use(requireAuth);

function livekitHost() {
  return config.livekit.apiUrl.replace(/^ws/, "http");
}

function roomName(channelId) {
  return `echo:${channelId}`;
}

callsRouter.get("/status", async (req, res) => {
  const channelId = String(req.query.channelId || "");
  if (!mongoose.isValidObjectId(channelId)) return res.status(400).json({ error: "valid channelId is required" });

  const channel = await Channel.findById(channelId, { name: 1, type: 1, members: 1, isArchived: 1 });
  if (!channel || channel.isArchived) return res.status(404).json({ error: "conversation not found" });
  if (channel.name?.startsWith("dm-self-")) return res.json({ active: false });
  if (channel.type !== "dm" || !channel.members.some((member) => member.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }
  if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) return res.json({ active: false });

  const service = new RoomServiceClient(livekitHost(), config.livekit.apiKey, config.livekit.apiSecret);
  const [room] = await service.listRooms([roomName(channelId)]);
  return res.json({ active: Boolean(room?.numParticipants) });
});

// Calls are intentionally ephemeral. LiveKit creates the room when the first
// participant connects and removes it after the last participant leaves.
callsRouter.post("/token", async (req, res) => {
  if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
    return res.status(503).json({ error: "Voice and video calls are not configured" });
  }

  const channelId = String(req.body?.channelId || "");
  if (!mongoose.isValidObjectId(channelId)) {
    return res.status(400).json({ error: "valid channelId is required" });
  }

  const channel = await Channel.findById(channelId, { name: 1, type: 1, members: 1, isArchived: 1 });
  if (!channel || channel.isArchived) return res.status(404).json({ error: "conversation not found" });
  if (channel.type !== "dm") return res.status(403).json({ error: "Calls are only available in direct messages" });
  if (channel.name?.startsWith("dm-self-")) return res.status(403).json({ error: "You can't call yourself" });
  if (!channel.members.some((member) => member.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  const room = roomName(channel._id.toString());
  const userId = req.user._id.toString();
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    // LiveKit identities must be unique per room. Keep the Echo user ID in
    // metadata, but allow the same user to join from multiple devices.
    identity: `${userId}:${randomUUID()}`,
    name: req.user.displayName,
    ttl: "10m",
  });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  token.metadata = JSON.stringify({ userId, channelId });

  const invitation = {
    channel: { id: channelId, name: channel.name, type: channel.type },
    from: { id: req.user._id.toString(), displayName: req.user.displayName },
  };
  // Invite the other participant through their personal room. This reaches
  // every tab/device and does not depend on either socket having joined the
  // DM channel room yet.
  channel.members
    .filter((member) => !member.equals(req.user._id))
    .forEach((member) => emitToUser(member.toString(), "call:incoming", invitation));

  return res.json({ token: await token.toJwt(), serverUrl: config.livekit.url, room });
});
