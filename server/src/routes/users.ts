import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Channel } from "../models/Channel.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signToken, signApiToken } from "../auth.js";
import { setFileCategory, FILE_CATEGORY } from "../storage.js";
import { emitAll, syncUserSockets } from "../realtime.js";
import { passwordProblem } from "../password.js";
import { ensureDmChannel } from "../lib/dms.js";
import { aliasesByUserId } from "../lib/userAliases.js";
import { ensureDmChannel, ensureSelfDmChannel } from "../lib/dms.js";
import { deliverMessage, sanitizeAttachments, attachmentLimitError, sanitizeSurvey, surveyError } from "../deliver.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// GET /api/users — directory used to power @mention autocomplete.
// Excludes the internal system account.
usersRouter.get("/", async (req, res) => {
  const users = await User.find({ username: { $ne: "system" } })
    .sort({ displayName: 1 });
  // Keep the signed-in user discoverable even when a large directory pushes
  // them past the autocomplete limit.
  if (!users.some((user) => user._id.equals(req.user._id))) {
    const currentUser = await User.findById(req.user._id);
    if (currentUser && currentUser.username !== "system") users.push(currentUser);
  }
  const aliases = await aliasesByUserId(users.map((u) => u._id));
  res.json({
    users: users.map((u) => ({
      ...u.toPublicJSON(),
      aliases: aliases.get(u._id.toString()) || [],
    })),
  });
});

// GET /api/users/vips — the ids of the users and channels the current user has starred.
usersRouter.get("/vips", async (req, res) => {
  const starredChannelIds = req.user.starredChannels || [];
  const visibleChannels = starredChannelIds.length === 0
    ? []
    : await Channel.find({
      _id: { $in: starredChannelIds },
      isArchived: false,
      type: { $ne: "dm" },
      $or: [{ type: "public" }, { members: req.user._id }],
    }, { _id: 1 }).lean();
  res.json({
    vipIds: (req.user.vips || []).map((id) => id.toString()),
    channelIds: visibleChannels.map((channel) => channel._id.toString()),
  });
});

// POST /api/users/:username/messages — open or reuse a DM by username and send.
usersRouter.post("/:username/messages", async (req, res) => {
  const username = decodeURIComponent(String(req.params.username)).trim().toLowerCase();
  const recipient = username === "system" ? null : await User.findOne({ username });
  if (!recipient) return res.status(404).json({ error: "user not found" });

  const isSelf = recipient._id.equals(req.user._id);
  const channel = isSelf
    ? await ensureSelfDmChannel(req.user._id)
    : await ensureDmChannel(req.user._id, recipient._id);
  const text = String(req.body?.body || "").trim();
  const survey = sanitizeSurvey(req.body?.survey);
  if (surveyError(req.body?.survey)) return res.status(400).json({ error: surveyError(req.body?.survey) });
  const attachmentError = attachmentLimitError(req.body?.attachments);
  if (attachmentError) return res.status(400).json({ error: attachmentError });
  const attachments = sanitizeAttachments(req.body?.attachments);
  if (!text && attachments.length === 0 && !survey) {
    return res.status(400).json({ error: "message needs text or an attachment" });
  }
  const parentId = req.body?.parentId && mongoose.isValidObjectId(req.body.parentId)
    ? req.body.parentId
    : null;
  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const existing = await Message.findOne({
      channel: channel._id,
      author: req.user._id,
      idempotencyKey: idempotencyKey.slice(0, 128),
    }).populate("author");
    if (existing) return res.json({ message: existing.toPublicJSON(), channel: channel.toPublicJSON(), idempotent: true });
  }

  const message = await deliverMessage({
    channel,
    authorId: req.user._id,
    body: text,
    parentId,
    attachments,
    survey,
    idempotencyKey,
  });
  res.status(201).json({ message, channel: channel.toPublicJSON(), withUser: recipient.toPublicJSON(), isSelf });
});

// Resolve a directory entry for message authors that arrived before the
// client refreshed its full user list.
usersRouter.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "valid user id is required" });
  const user = await User.findById(req.params.id);
  if (!user || user.username === "system") return res.status(404).json({ error: "user not found" });
  const aliases = await aliasesByUserId([user._id]);
  res.json({ user: { ...user.toPublicJSON(), aliases: aliases.get(user._id.toString()) || [] } });
});

// POST /api/users/:id/vip — toggle whether :id is a VIP for the current user.
usersRouter.post("/:id/vip", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "valid user id is required" });
  }
  if (String(id) === String(req.user._id)) {
    return res.status(400).json({ error: "you can't VIP yourself" });
  }
  const idx = req.user.vips.findIndex((v) => v.equals(id));
  let vip;
  if (idx >= 0) {
    req.user.vips.splice(idx, 1);
    vip = false;
  } else {
    if (!(await User.exists({ _id: id }))) {
      return res.status(404).json({ error: "user not found" });
    }
    await ensureDmChannel(req.user._id, id);
    req.user.vips.push(id);
    vip = true;
  }
  await req.user.save();
  res.json({ vip });
});

// GET /api/users/me/api-token — mint a long-lived token for API scripting.
usersRouter.get("/me/api-token", (req, res) => {
  res.json({ token: signApiToken(req.user) });
});

// POST /api/users/me/onboarded — mark the first-run walkthrough complete.
usersRouter.post("/me/onboarded", async (req, res) => {
  req.user.onboarded = true;
  await req.user.save();
  res.json({ user: req.user.toPublicJSON() });
});

// PATCH /api/users/me { displayName?, avatarKey? } — update own profile.
// `avatarKey` is the key returned by /api/uploads; null clears the picture.
usersRouter.patch("/me", async (req, res) => {
  const { displayName, avatarKey } = req.body || {};

  if (displayName !== undefined) {
    const name = String(displayName).trim();
    if (name.length < 1 || name.length > 64) {
      return res.status(400).json({ error: "display name must be 1-64 characters" });
    }
    req.user.displayName = name;
  }
  if (avatarKey !== undefined) {
    // Accept our own opaque upload keys, or null to remove the avatar.
    if (avatarKey !== null && !/^[a-z0-9-]+\.[a-z0-9]+$/i.test(String(avatarKey))) {
      return res.status(400).json({ error: "invalid avatar reference" });
    }
    req.user.avatarKey = avatarKey;
    // A profile picture must never be auto-expired — re-tag it as an avatar so
    // the attachment TTL no longer applies to it.
    if (avatarKey) await setFileCategory(avatarKey, FILE_CATEGORY.AVATAR);
  }

  await req.user.save();
  await syncUserSockets(req.user);
  const user = req.user.toPublicJSON();
  emitAll("user:update", { user });
  res.json({ user });
});

// PATCH /api/users/me/password { currentPassword?, newPassword }
// Change your own password. Normally requires the current password; when the
// account is on an admin-issued one-time password (mustResetPassword), the user
// is already authenticated with it, so only the new password is needed.
usersRouter.patch("/me/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  // The admin account isn't allowed to change its own password.
  if (req.user.isAdmin && !req.user.mustResetPassword) {
    return res.status(403).json({ error: "the admin account can't change its own password" });
  }
  const weak = passwordProblem(newPassword);
  if (weak) {
    return res.status(400).json({ error: weak });
  }
  if (!req.user.mustResetPassword) {
    const ok = currentPassword && (await bcrypt.compare(String(currentPassword), req.user.passwordHash));
    if (!ok) return res.status(400).json({ error: "current password is incorrect" });
  }
  req.user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  req.user.mustResetPassword = false;
  req.user.otpExpiresAt = null;
  req.user.tokenVersion = (req.user.tokenVersion ?? 0) + 1;
  await req.user.save();
  res.json({ token: signToken(req.user), user: req.user.toPublicJSON() });
});
