import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

// GET /api/messages/:messageId/preview — permission-aware payload used when an
// Echo message permalink is pasted into another message.
messagesRouter.get("/:messageId/preview", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.messageId)) {
    return res.status(404).json({ error: "message not found" });
  }

  const message = await Message.findById(req.params.messageId).populate("author");
  if (!message) return res.status(404).json({ error: "message not found" });

  const channel = await Channel.findById(message.channel);
  if (!channel || channel.isArchived) return res.status(404).json({ error: "message not found" });
  if (channel.type !== "public" && !channel.members.some((member) => member.equals(req.user._id))) {
    return res.status(403).json({ error: "access denied" });
  }

  res.json({ message: message.toPublicJSON(), channel: channel.toPublicJSON() });
});
