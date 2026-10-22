import { Router } from "express";
import bcrypt from "bcryptjs";
import { Channel } from "../models/Channel.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signToken, signApiToken } from "../auth.js";
import { setFileCategory, FILE_CATEGORY } from "../storage.js";
import { emitAll, syncUserSockets } from "../realtime.js";
import { passwordProblem } from "../password.js";
import { aliasesByUserId } from "../lib/userAliases.js";
import { sanitizeAttachments, attachmentLimitError, sanitizeSurvey, surveyError } from "../deliver.js";
import { cardError, sanitizeCard } from "../lib/messageCard.js";
import { ThreadFollow } from "../models/ThreadFollow.js";
import { findUserById, findUserByUsername, listDirectoryUsers, userExists } from "../services/userDirectoryService.js";
import { ensureDmChannel, ensureSelfDmChannel } from "../services/conversationService.js";
import { sendMessage } from "../services/messageService.js";
import { isValidObjectId } from "../lib/objectId.js";
import { decodePathValue } from "../lib/uri.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Personal notification rules follow the user across devices. Conversation
// overrides are per-user; unread/read state remains entirely independent.
usersRouter.get("/notification-settings", async (req, res) => {
  const conversations = Object.fromEntries(req.user.conversationNotifications || []);
  const channels = await Channel.find({ _id: { $in: Object.keys(conversations) } }).populate("members", "displayName");
  const labels = Object.fromEntries(channels.map((channel) => {
    const names = (channel.members || []).filter((member) => !member._id.equals(req.user._id)).map((member) => member.displayName);
    return [channel._id.toString(), channel.type === "dm" ? names.join(", ") || "Direct message" : `#${channel.name}`];
  }));
  const [followedThreads, mutedThreads] = await Promise.all([
    ThreadFollow.find({ user: req.user._id, following: { $ne: false } }).select("thread -_id").lean(),
    ThreadFollow.find({ user: req.user._id, following: false }).select("thread -_id").lean(),
  ]);
  res.json({
    defaults: req.user.notificationDefaults || "mentions",
    display: req.user.notificationDisplay || "minimized",
    conversations,
    labels,
    followedThreads: followedThreads.map((item) => String(item.thread)),
    mutedThreads: mutedThreads.map((item) => String(item.thread)),
  });
});

usersRouter.put("/notification-settings", async (req, res) => {
  const { defaults, display, conversationId, rule } = req.body || {};
  if (defaults !== undefined) {
    if (!["mentions", "all"].includes(defaults)) return res.status(400).json({ error: "invalid notification default" });
    req.user.notificationDefaults = defaults;
  }
  if (display !== undefined) {
    if (!["minimized", "always"].includes(display)) return res.status(400).json({ error: "invalid notification display preference" });
    req.user.notificationDisplay = display;
  }
  if (conversationId !== undefined) {
    if (!/^[a-f0-9]{24}$/i.test(String(conversationId))) return res.status(400).json({ error: "invalid conversation id" });
    if (!["default", "all", "mentions", "mute"].includes(rule)) return res.status(400).json({ error: "invalid conversation notification rule" });
    const channel = await Channel.findById(conversationId).select("members");
    if (!channel || !channel.members.some((id) => id.equals(req.user._id))) return res.status(404).json({ error: "conversation not found" });
    const rules = new Map(req.user.conversationNotifications || []);
    if (rule === "default") rules.delete(String(conversationId));
    else rules.set(String(conversationId), rule);
    req.user.conversationNotifications = rules;
  }
  await req.user.save();
  const conversations = Object.fromEntries(req.user.conversationNotifications || []);
  const channels = await Channel.find({ _id: { $in: Object.keys(conversations) } }).populate("members", "displayName");
  const labels = Object.fromEntries(channels.map((channel) => {
    const names = (channel.members || []).filter((member) => !member._id.equals(req.user._id)).map((member) => member.displayName);
    return [channel._id.toString(), channel.type === "dm" ? names.join(", ") || "Direct message" : `#${channel.name}`];
  }));
  const [followedThreads, mutedThreads] = await Promise.all([
    ThreadFollow.find({ user: req.user._id, following: { $ne: false } }).select("thread -_id").lean(),
    ThreadFollow.find({ user: req.user._id, following: false }).select("thread -_id").lean(),
  ]);
  res.json({
    defaults: req.user.notificationDefaults || "mentions",
    display: req.user.notificationDisplay || "minimized",
    conversations,
    labels,
    followedThreads: followedThreads.map((item) => String(item.thread)),
    mutedThreads: mutedThreads.map((item) => String(item.thread)),
  });
});

// GET /api/users — directory used to power @mention autocomplete.
// Excludes the internal system account.
usersRouter.get("/", async (req, res) => {
  const users = await listDirectoryUsers();
  // Keep the signed-in user discoverable even when a large directory pushes
  // them past the autocomplete limit.
  if (!users.some((user) => user._id.equals(req.user._id))) {
    const currentUser = await findUserById(req.user._id);
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
      $or: [{ type: "public" }, { members: req.user._id }],
    }, { _id: 1 }).lean();
  res.json({
    vipIds: (req.user.vips || []).map((id) => id.toString()),
    channelIds: visibleChannels.map((channel) => channel._id.toString()),
  });
});

// POST /api/users/:username/messages — open or reuse a DM by username and send.
usersRouter.post("/:username/messages", async (req, res) => {
  if (req.body?.body !== undefined && typeof req.body.body !== "string") return res.status(400).json({ error: "body must be text" });
  const text = String(req.body?.body || "").trim();
  if (text.length > 4000) return res.status(400).json({ error: "message body must be 4000 characters or fewer" });
  const decodedUsername = decodePathValue(String(req.params.username));
  if (decodedUsername === null) return res.status(400).json({ error: "invalid username" });
  const username = decodedUsername.trim().toLowerCase();
  const recipient = username === "system" ? null : await findUserByUsername(username);
  if (!recipient) return res.status(404).json({ error: "user not found" });

  const isSelf = recipient._id.equals(req.user._id);
  const channel = isSelf
    ? await ensureSelfDmChannel(req.user._id)
    : await ensureDmChannel(req.user._id, recipient._id);
  const survey = sanitizeSurvey(req.body?.survey);
  const card = sanitizeCard(req.body?.card);
  const invalidCard = cardError(req.body?.card);
  if (surveyError(req.body?.survey)) return res.status(400).json({ error: surveyError(req.body?.survey) });
  if (invalidCard) return res.status(400).json({ error: invalidCard });
  const attachmentError = attachmentLimitError(req.body?.attachments);
  if (attachmentError) return res.status(400).json({ error: attachmentError });
  const attachments = sanitizeAttachments(req.body?.attachments);
  if (!text && attachments.length === 0 && !survey && !card) {
    return res.status(400).json({ error: "message needs text, an attachment, or a card" });
  }
  if (req.body?.parentId != null && !isValidObjectId(req.body.parentId)) return res.status(400).json({ error: "invalid parent message" });
  const parentId = req.body?.parentId || null;
  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  const result = await sendMessage({
    channel,
    authorId: req.user._id,
    body: text,
    parentId,
    attachments,
    survey,
    card,
    idempotencyKey: idempotencyKey || null,
  });
  res.status(result.idempotent ? 200 : 201).json({
    message: result.message,
    channel: channel.toPublicJSON(),
    withUser: recipient.toPublicJSON(),
    isSelf,
    ...(result.idempotent ? { idempotent: true } : {}),
  });
});

// Resolve a directory entry for message authors that arrived before the
// client refreshed its full user list.
usersRouter.get("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "valid user id is required" });
  const user = await findUserById(req.params.id);
  if (!user || user.username === "system") return res.status(404).json({ error: "user not found" });
  const aliases = await aliasesByUserId([user._id]);
  res.json({ user: { ...user.toPublicJSON(), aliases: aliases.get(user._id.toString()) || [] } });
});

// POST /api/users/:id/vip — toggle whether :id is a VIP for the current user.
usersRouter.post("/:id/vip", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
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
    if (!(await userExists(id))) {
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
    if (typeof displayName !== "string") return res.status(400).json({ error: "display name must be text" });
    const name = String(displayName).trim();
    if (name.length < 1 || name.length > 64) {
      return res.status(400).json({ error: "display name must be 1-64 characters" });
    }
    req.user.displayName = name;
  }
  if (avatarKey !== undefined) {
    if (avatarKey !== null && typeof avatarKey !== "string") return res.status(400).json({ error: "invalid avatar reference" });
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
  if (req.user.authOrigin === "rhsso" || req.user.rhssoSubject) {
    return res.status(403).json({ error: "SSO passwords must be changed through your identity provider" });
  }
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
