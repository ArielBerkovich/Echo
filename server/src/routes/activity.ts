import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";
import { ActivityEvent } from "../models/ActivityEvent.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const activityRouter = Router();
activityRouter.use(requireAuth);

// POST /api/activity/read — mark reaction activity seen (clears its unread).
activityRouter.post("/read", async (req, res) => {
  req.user.activitySeenAt = new Date();
  await req.user.save();
  res.json({ ok: true });
});

// DELETE /api/activity/:id — dismiss one activity item for the current user.
// Stored events can be removed directly; message-derived activity is hidden
// with a per-user dismissal so the source message remains untouched.
activityRouter.delete("/:id", async (req, res) => {
  const rawId = String(req.params.id || "");
  const eventMatch = rawId.match(/^(?:rx|ca|cr)-([a-f\d]{24})$/i);
  if (eventMatch) {
    await ActivityEvent.deleteOne({ _id: eventMatch[1], recipient: req.user._id });
    return res.json({ ok: true });
  }
  if (!mongoose.isValidObjectId(rawId)) {
    return res.status(400).json({ error: "invalid activity id" });
  }
  await User.updateOne(
    { _id: req.user._id },
    { $addToSet: { dismissedActivityIds: `message:${rawId}` } }
  );
  res.json({ ok: true });
});

// Always surface a rolling 30-day window of activity.
const ACTIVITY_WINDOW_DAYS = 30;

// GET /api/activity — your @mentions, channel-wide broadcasts, and replies in
// threads you started from the last 30 days. Each item is flagged `unread`
// until you've opened its conversation.
activityRouter.get("/", async (req, res) => {
  const me = req.user;
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const visible = await Channel.find(
    { isArchived: { $ne: true }, $or: [{ type: "public" }, { members: me._id }] },
    { _id: 1, name: 1, type: 1, members: 1 }
  );
  const chanMap = new Map(visible.map((c) => [c._id.toString(), c]));
  const memberChanIds = visible
    .filter((c) => c.members.some((m) => m.equals(me._id)))
    .map((c) => c._id);
  const visibleChanIds = visible.map((c) => c._id);
  const dismissedMessageIds = (me.dismissedActivityIds || [])
    .filter((key) => key.startsWith("message:"))
    .map((key) => key.slice("message:".length))
    .filter((id) => mongoose.isValidObjectId(id));

  const docs = await Message.find({
    author: { $ne: me._id },
    createdAt: { $gte: since }, // rolling 30-day window
    channel: { $in: visibleChanIds },
    _id: { $nin: dismissedMessageIds },
    $or: [
      { mentionedUserIds: me._id },
      { channel: { $in: memberChanIds }, mentionsEveryone: true },
      { threadRootAuthor: me._id },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("author");

  // When did I last open each conversation? An item is "unread" (not yet seen)
  // until I've read where it lives: the channel's main timeline for top-level
  // messages, or the specific thread for replies. Tracking these separately
  // means a mention buried in a thread stays in Activity until I open that
  // thread — opening the channel's main view doesn't silently clear it.
  const reads = await Read.find({ user: me._id, channel: { $in: visibleChanIds } });
  const channelReadMap = new Map(); // channelId -> lastReadAt (main timeline)
  const threadReadMap = new Map(); // threadRootId -> lastReadAt
  for (const r of reads) {
    if (r.thread) threadReadMap.set(r.thread.toString(), r.lastReadAt);
    else channelReadMap.set(r.channel.toString(), r.lastReadAt);
  }

  const items = docs.map((m) => {
    const c = chanMap.get(m.channel.toString());
    const isReply = !!m.parentId;
    const isBroadcast = !!m.mentionsEveryone;
    const threadId = isReply ? m.parentId.toString() : null;
    const lastRead = isReply ? threadReadMap.get(threadId) : channelReadMap.get(m.channel.toString());
    const unread = !lastRead || new Date(m.createdAt) > new Date(lastRead);
    return {
      id: m._id.toString(),
      channelId: m.channel.toString(),
      channelName: c?.name,
      channelType: c?.type,
      messageId: m._id.toString(),
      threadId,
      author: m.author?.toPublicJSON?.() || null,
      body: m.body,
      createdAt: m.createdAt,
      kind: isReply ? "reply" : isBroadcast ? "broadcast" : "mention",
      unread,
    };
  });

  // Stored activity events: reactions to my messages and channels I was added
  // to. Reactions are unread until I open the Activity panel; channel-adds are
  // unread until I open the channel (like a mention).
  // Remove stale persisted activity as soon as access is lost. Removal notices
  // are intentionally kept so the user can still understand why the channel
  // disappeared; they contain no channel message content.
  await ActivityEvent.deleteMany({
    recipient: me._id,
    channel: { $nin: visibleChanIds },
    type: { $ne: "channel_remove" },
  }).catch(() => {});
  const events = await ActivityEvent.find({ recipient: me._id, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("actor");
  // A removal from a private channel means the channel is no longer in the
  // normal visible set, but the removal event itself must remain readable.
  const eventChannelIds = events
    .filter((e) => e.type === "channel_remove")
    .map((e) => e.channel)
    .filter(Boolean);
  if (eventChannelIds.length) {
    const eventChannels = await Channel.find(
      { _id: { $in: eventChannelIds } },
      { _id: 1, name: 1, type: 1, members: 1 }
    );
    for (const c of eventChannels) chanMap.set(c._id.toString(), c);
  }
  const reactedMsgs = await Message.find(
    { _id: { $in: events.filter((e) => e.type === "reaction").map((e) => e.message) } },
    { body: 1, channel: 1, parentId: 1 }
  );
  const reactedMap = new Map(reactedMsgs.map((m) => [m._id.toString(), m]));
  const seenAt = me.activitySeenAt ? new Date(me.activitySeenAt) : null;
  const eventItems = events
    .map((e) => {
      const c = chanMap.get(e.channel.toString());
      if (!c) return null; // channel no longer visible to me
      if (e.type === "channel_add") {
        const lastRead = channelReadMap.get(e.channel.toString());
        return {
          id: `ca-${e._id.toString()}`,
          channelId: e.channel.toString(),
          channelName: c.name,
          channelType: c.type,
          messageId: null,
          threadId: null,
          author: e.actor?.toPublicJSON?.() || null, // who added me
          body: "",
        createdAt: e.createdAt,
        kind: "channel_add",
          unread: !lastRead || new Date(e.createdAt) > new Date(lastRead),
        };
      }
      if (e.type === "channel_remove") {
        return {
          id: `cr-${e._id.toString()}`,
          channelId: e.channel.toString(),
          channelName: c.name,
          channelType: c.type,
          messageId: null,
          threadId: null,
          author: e.actor?.toPublicJSON?.() || null,
          body: "",
          createdAt: e.createdAt,
          kind: "channel_remove",
          unread: !seenAt || new Date(e.createdAt) > seenAt,
        };
      }
      // reaction
      const m = reactedMap.get(e.message.toString());
      if (!m) return null;
      return {
        id: `rx-${e._id.toString()}`,
        channelId: m.channel.toString(),
        channelName: c.name,
        channelType: c.type,
        messageId: m._id.toString(),
        threadId: m.parentId ? m.parentId.toString() : null,
        author: e.actor?.toPublicJSON?.() || null, // the person who reacted
        body: m.body,
        emoji: e.emoji,
        createdAt: e.createdAt,
        kind: "reaction",
        unread: !seenAt || new Date(e.createdAt) > seenAt,
      };
    })
    .filter(Boolean);

  const all = [...items, ...eventItems]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 200);

  res.json({ items: all });
});
