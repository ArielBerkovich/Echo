import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { ActivityEvent } from "../models/ActivityEvent.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { ActivityRead } from "../models/ActivityRead.js";
import { emitToUser } from "../realtime.js";

export const activityRouter = Router();
activityRouter.use(requireAuth);

// Acknowledge only the exact activity versions the client actually displayed.
activityRouter.post("/read", async (req, res) => {
  const entries = req.body?.items;
  if (!Array.isArray(entries) || entries.length > 200 || entries.some((entry) =>
    !entry || typeof entry.id !== "string" || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))
  )) return res.status(400).json({ error: "items must contain activity ids and createdAt timestamps" });
  const visible = new Map((await getActivityItems(req.user)).map((item) => [item.id, item]));
  const accepted = entries.filter((entry) => {
    const item = visible.get(entry.id);
    return item && new Date(item.createdAt).getTime() === Date.parse(entry.createdAt);
  });
  if (accepted.length) {
    await ActivityRead.bulkWrite(accepted.map((entry) => ({ updateOne: {
      filter: { user: req.user._id, activityId: entry.id },
      update: {
        $max: { seenThrough: new Date(entry.createdAt) },
        $set: { activityCreatedAt: new Date(entry.createdAt) },
      },
      upsert: true,
    } })));
    emitToUser(req.user._id.toString(), "activity:bump");
  }
  res.json({ ok: true });
});

// DELETE /api/activity — dismiss the current user's complete rolling activity feed.
activityRouter.delete("/", async (req, res) => {
  const me = req.user;
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const visible = await Channel.find(
    { isArchived: { $ne: true }, $or: [{ type: "public" }, { members: me._id }] },
    { _id: 1, members: 1 }
  );
  const visibleChanIds = visible.map((channel) => channel._id);
  const memberChanIds = visible
    .filter((channel) => channel.members.some((member) => member.equals(me._id)))
    .map((channel) => channel._id);
  const messages = await Message.find(
    {
      author: { $ne: me._id },
      createdAt: { $gte: since },
      channel: { $in: visibleChanIds },
      $or: [
        { mentionedUserIds: me._id },
        { channel: { $in: memberChanIds }, mentionsEveryone: true },
        { threadRootAuthor: me._id },
      ],
    },
    { _id: 1 }
  );
  const dismissedIds = messages.map((message) => `message:${message._id.toString()}`);
  const updates = [
    ActivityEvent.deleteMany({ recipient: me._id }),
    dismissedIds.length
      ? User.updateOne({ _id: me._id }, { $addToSet: { dismissedActivityIds: { $each: dismissedIds } } })
      : Promise.resolve(),
  ];
  await Promise.all(updates);
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
// threads you started from the last 30 days, with per-item read state.
activityRouter.get("/", async (req, res) => {
  res.json({ items: await getActivityItems(req.user) });
});

async function getActivityItems(me) {
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

  // Preserve historical read state using the frozen pre-upgrade markers.
  // New channel/thread read timestamps never clear activity implicitly.
  const reads = me.activityReadBaseline.reads || [];
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

  // Stored events retain their legacy state below; explicit acknowledgments
  // are applied to all activity kinds at the end.
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
  const seenAt = me.activityReadBaseline.seenAt ? new Date(me.activityReadBaseline.seenAt) : null;
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

  const acknowledged = await ActivityRead.find({ user: me._id, activityId: { $in: all.map((item) => item.id) } });
  const readMap = new Map(acknowledged.map((read) => [read.activityId, read.seenThrough]));
  return all.map((item) => ({ ...item, unread: item.unread &&
    !(readMap.has(item.id) && new Date(readMap.get(item.id)) >= new Date(item.createdAt)) }));
}
