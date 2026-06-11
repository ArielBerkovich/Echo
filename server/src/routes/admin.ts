import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// A readable random one-time password (no easily-confused characters).
function generateOtp(len = 12) {
  const chars = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// POST /api/admin/users/:id/reset-password
// Issues a one-time password for a user who's locked out: the admin shares it,
// the user logs in with it, and is then forced to set their own new password.
// The admin never sets (or learns) the user's real password.
adminRouter.post("/users/:id/reset-password", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ error: "user not found" });
  }
  const target = await User.findById(id);
  if (!target || target.username === "system") {
    return res.status(404).json({ error: "user not found" });
  }
  const tempPassword = generateOtp();
  target.passwordHash = await bcrypt.hash(tempPassword, 10);
  target.mustResetPassword = true; // force a self-chosen password on next login
  target.otpExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // valid for 1 hour
  target.tokenVersion = (target.tokenVersion ?? 0) + 1; // invalidate existing sessions
  await target.save();
  console.info(`[admin] password reset issued for user ${target._id} by admin ${req.user._id}`);
  res.json({ ok: true, tempPassword, user: target.toPublicJSON() });
});
