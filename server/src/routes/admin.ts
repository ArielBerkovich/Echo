import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Message } from "../models/Message.js";
import { Channel } from "../models/Channel.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { deliverMessage } from "../deliver.js";
import { emitToChannel } from "../realtime.js";

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

async function issueOneTimePassword(target) {
  const tempPassword = generateOtp();
  target.passwordHash = await bcrypt.hash(tempPassword, 10);
  target.mustResetPassword = true;
  target.otpExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  target.tokenVersion = (target.tokenVersion ?? 0) + 1;
  await target.save();
  return tempPassword;
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
  if (target.isAdmin) {
    return res.status(403).json({ error: "admin passwords cannot be reset with a one-time password" });
  }
  const tempPassword = await issueOneTimePassword(target);
  console.info(`[admin] password reset issued for user ${target._id} by admin ${req.user._id}`);
  res.json({ ok: true, tempPassword, user: target.toPublicJSON() });
});

// POST /api/admin/password-help/:messageId/issue
// Fulfil a structured request from Echo's admin DM. The target comes from the
// server-authored message, and the generated OTP is posted back into that DM.
adminRouter.post("/password-help/:messageId/issue", async (req, res) => {
  const { messageId } = req.params;
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(404).json({ error: "password-help request not found" });
  }

  const requestMessage = await Message.findById(messageId);
  if (!requestMessage?.passwordHelpRequest) {
    return res.status(404).json({ error: "password-help request not found" });
  }
  const channel = await Channel.findById(requestMessage.channel);
  if (
    !channel ||
    channel.type !== "dm" ||
    !channel.members.some((memberId) => memberId.equals(req.user._id))
  ) {
    return res.status(403).json({ error: "access denied" });
  }

  const claimed = await Message.findOneAndUpdate(
    { _id: requestMessage._id, "passwordHelpRequest.status": "pending" },
    { $set: { "passwordHelpRequest.status": "issuing" } },
    { new: true }
  );
  if (!claimed) {
    return res.status(409).json({ error: "This password-help request has already been handled." });
  }

  try {
    const target = await User.findById(claimed.passwordHelpRequest.user);
    if (!target || target.username === "system" || target.isAdmin || target.rhssoSubject) {
      throw Object.assign(new Error("This account cannot use a one-time password."), { status: 400 });
    }

    const tempPassword = await issueOneTimePassword(target);
    const reply = await deliverMessage({
      channel,
      authorId: req.user._id,
      body:
        `One-time password for @${target.username}: **${tempPassword}**\n\n` +
        `It expires in 1 hour. Share it securely; the user will be required to choose a new password after signing in.`,
    });

    claimed.passwordHelpRequest.status = "issued";
    claimed.passwordHelpRequest.issuedAt = new Date();
    claimed.passwordHelpRequest.issuedBy = req.user._id;
    await claimed.save();
    const updatedRequest = claimed.toPublicJSON();
    emitToChannel(channel._id.toString(), "message:update", {
      id: updatedRequest.id,
      channelId: updatedRequest.channelId,
      parentId: updatedRequest.parentId,
      passwordHelpRequest: updatedRequest.passwordHelpRequest,
    });

    console.info(`[admin] password-help request ${claimed._id} fulfilled for user ${target._id} by admin ${req.user._id}`);
    return res.json({ ok: true, request: updatedRequest.passwordHelpRequest, reply });
  } catch (error) {
    await Message.updateOne(
      { _id: claimed._id, "passwordHelpRequest.status": "issuing" },
      { $set: { "passwordHelpRequest.status": "pending" } }
    ).catch(() => {});
    throw error;
  }
});
