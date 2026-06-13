import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signToken, signApiToken } from "../auth.js";
import { setFileCategory, FILE_CATEGORY } from "../storage.js";
import { emitAll, syncUserSockets } from "../realtime.js";
import { passwordProblem } from "../password.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// GET /api/users — directory used to power @mention autocomplete.
// Excludes the internal system account.
usersRouter.get("/", async (_req, res) => {
  const users = await User.find({ username: { $ne: "system" } })
    .sort({ displayName: 1 })
    .limit(500);
  res.json({ users: users.map((u) => u.toPublicJSON()) });
});

// GET /api/users/vips — the ids of users the current user has marked VIP.
usersRouter.get("/vips", (req, res) => {
  res.json({ vipIds: (req.user.vips || []).map((id) => id.toString()) });
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
