import { Router } from "express";
import mongoose from "mongoose";
import { Channel } from "../models/Channel.js";
import { User } from "../models/User.js";
import { Message } from "../models/Message.js";
import { Read } from "../models/Read.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const dmsRouter = Router();
dmsRouter.use(requireAuth);

// Deterministic channel name for the DM between two users, regardless of order.
function dmName(a, b) {
  return `dm-${[String(a), String(b)].sort().join("-")}`;
}

// GET /api/dms — the user's visible DM conversations, most-recent first.
dmsRouter.get("/", async (req, res) => {
  const dms = await Channel.find({
    type: "dm",
    members: req.user._id,
    hiddenFor: { $ne: req.user._id }, // not removed from this user's sidebar
  }).populate("members");

  const ids = dms.map((c) => c._id);
  const reads = await Read.find({ user: req.user._id, channel: { $in: ids }, thread: null });
  const readMap = new Map(reads.map((r) => [r.channel.toString(), r.lastReadAt]));

  // Last message per DM and unread-per-DM, each in a single aggregation
  // (instead of two queries per conversation).
  const [lasts, counts] = ids.length
    ? await Promise.all([
        Message.aggregate([
          { $match: { channel: { $in: ids } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: "$channel", body: { $first: "$body" }, createdAt: { $first: "$createdAt" }, author: { $first: "$author" } } },
        ]),
        Message.aggregate([
          { $match: { $or: ids.map((id) => ({ channel: id, author: { $ne: req.user._id }, createdAt: { $gt: readMap.get(id.toString()) || new Date(0) } })) } },
          { $group: { _id: "$channel", unread: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const lastMap = new Map(lasts.map((l) => [l._id.toString(), l]));
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.unread]));

  const conversations = dms.map((c) => {
    const isSelf = c.name?.startsWith("dm-self-");
    const other = isSelf
      ? c.members[0]
      : (c.members.find((m) => !m._id.equals(req.user._id)) || c.members[0]);
    const last = lastMap.get(c._id.toString());
    return {
      id: c._id.toString(),
      withUser: other.toPublicJSON(),
      isSelf,
      lastAt: last?.createdAt || c.createdAt,
      lastBody: last?.body || null,
      lastFromMe: last ? String(last.author) === String(req.user._id) : false,
      unread: countMap.get(c._id.toString()) || 0,
    };
  });

  conversations.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ conversations });
});

// DELETE /api/dms/:id — remove a DM from the current user's sidebar.
dmsRouter.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "conversation not found" });
  }
  await Channel.updateOne(
    { _id: req.params.id, type: "dm", members: req.user._id },
    { $addToSet: { hiddenFor: req.user._id } }
  );
  res.json({ ok: true });
});

// POST /api/dms { userId } — open (or create) a DM with another user, or with
// yourself (a personal notes/scratchpad conversation).
dmsRouter.post("/", async (req, res) => {
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "valid userId is required" });
  }

  const isSelf = String(userId) === String(req.user._id);
  const other = isSelf ? req.user : await User.findById(userId);
  if (!other) return res.status(404).json({ error: "user not found" });

  const name = isSelf ? `dm-self-${req.user._id}` : dmName(req.user._id, other._id);
  const members = isSelf ? [req.user._id] : [req.user._id, other._id];

  const channel = await Channel.findOneAndUpdate(
    { name },
    { $setOnInsert: { name, type: "dm", members, createdBy: req.user._id } },
    { new: true, upsert: true }
  );

  res.json({ channel: channel.toPublicJSON(), withUser: other.toPublicJSON(), isSelf });
});
