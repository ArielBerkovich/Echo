import { Router } from "express";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { listSavedMessages } from "../services/savedMessageService.js";
import { toggleSavedMessage } from "../services/userStateService.js";
import { isValidObjectId } from "../lib/objectId.js";

export const savedRouter = Router();
savedRouter.use(requireAuth);

function canAccess(channel, userId) {
  return channel.type === "public" || channel.members.some((m) => m.equals(userId));
}

// POST /api/saved/:messageId — toggle the saved ("save for later") state of a
// message for the current user. Returns the new state.
savedRouter.post("/:messageId", async (req, res) => {
  const me = req.user;
  if (!isValidObjectId(req.params.messageId)) return res.status(400).json({ error: "invalid message id" });
  const msg = await Message.findById(req.params.messageId);
  if (!msg) return res.status(404).json({ error: "message not found" });
  const channel = await Channel.findById(msg.channel);
  if (!channel || channel.isArchived) return res.status(404).json({ error: "message not found" });
  if (!canAccess(channel, me._id)) return res.status(403).json({ error: "access denied" });

  const result = await toggleSavedMessage({ userId: me._id, messageId: msg._id });
  if (!result) return res.status(401).json({ error: "user not found" });
  res.json(result);
});

// GET /api/saved — the current user's saved messages that are still accessible,
// most-recently-saved first, with channel/DM context for display + jumping.
savedRouter.get("/", async (req, res) => {
  const result = await listSavedMessages({ userId: req.user._id, includeContext: true });
  if (!result) return res.status(401).json({ error: "user not found" });
  res.json({ items: result.items });
});
