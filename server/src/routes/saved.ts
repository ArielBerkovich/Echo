import { Router } from "express";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const savedRouter = Router();
savedRouter.use(requireAuth);

function canAccess(channel, userId) {
  return channel.type === "public" || channel.members.some((m) => m.equals(userId));
}

// POST /api/saved/:messageId — toggle the saved ("save for later") state of a
// message for the current user. Returns the new state.
savedRouter.post("/:messageId", async (req, res) => {
  const me = req.user;
  const msg = await Message.findById(req.params.messageId);
  if (!msg) return res.status(404).json({ error: "message not found" });

  const idx = me.savedMessages.findIndex((m) => m.equals(msg._id));
  let saved;
  if (idx >= 0) {
    me.savedMessages.splice(idx, 1);
    saved = false;
  } else {
    me.savedMessages.push(msg._id);
    saved = true;
  }
  await me.save();
  res.json({ saved });
});

// GET /api/saved — the current user's saved messages that are still accessible,
// most-recently-saved first, with channel/DM context for display + jumping.
savedRouter.get("/", async (req, res) => {
  const me = req.user;
  const ids = me.savedMessages || [];
  if (ids.length === 0) return res.json({ items: [] });

  const docs = await Message.find({ _id: { $in: ids } }).populate("author");
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));

  const chanIds = [...new Set(docs.map((d) => d.channel.toString()))];
  const channels = await Channel.find({ _id: { $in: chanIds } });
  const chanMap = new Map(channels.map((c) => [c._id.toString(), c]));

  // Resolve the other participant's name for DM channels.
  const dmOtherIds = channels
    .filter((c) => c.type === "dm")
    .map((c) => c.members.find((m) => !m.equals(me._id)))
    .filter(Boolean);
  const others = await User.find({ _id: { $in: dmOtherIds } });
  const otherMap = new Map(others.map((u) => [u._id.toString(), u]));

  const items = [];
  // Walk newest-saved first (savedMessages is appended to on save).
  for (let i = ids.length - 1; i >= 0; i--) {
    const d = byId.get(ids[i].toString());
    if (!d) continue;
    const c = chanMap.get(d.channel.toString());
    if (!c || !canAccess(c, me._id)) continue;
    let channelName = c.name;
    if (c.type === "dm") {
      const other = c.members.find((m) => !m.equals(me._id));
      channelName = other ? otherMap.get(other.toString())?.displayName || "Direct message" : "Direct message";
    }
    items.push({
      ...d.toPublicJSON(),
      channelName,
      channelType: c.type,
      threadId: d.parentId ? d.parentId.toString() : null,
    });
  }
  res.json({ items });
});
