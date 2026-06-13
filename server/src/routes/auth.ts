import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Channel } from "../models/Channel.js";
import { signToken } from "../auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { emitAll } from "../realtime.js";
import { passwordProblem } from "../password.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});
const authRateLimit =
  process.env.NODE_ENV === "production"
    ? authLimiter
    : (_req, _res, next) => next();

// GET /api/auth/setup-status — public. Tells the login screen whether the
// workspace still needs its first (admin) account created.
authRouter.get("/setup-status", async (_req, res) => {
  const count = await User.countDocuments({ username: { $ne: "system" } });
  res.json({ needsSetup: count === 0 });
});

// POST /api/auth/register
authRouter.post("/register", authRateLimit, async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  const weak = passwordProblem(password);
  if (weak) {
    return res.status(400).json({ error: weak });
  }

  const existing = await User.findOne({ username: String(username).toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: "username is already taken" });
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), 10);
    // Atomically claim the admin slot: only the very first real account gets it.
    // Using findOneAndUpdate with $setOnInsert avoids a TOCTOU race where two
    // concurrent registrations both observe count === 0 and both get isAdmin.
    const existing2 = await User.findOne({ username: { $ne: "system" } }, { _id: 1 });
    const isFirstUser = !existing2;
    const user = await User.create({
      username,
      displayName: displayName?.trim() || username,
      passwordHash,
      isAdmin: isFirstUser,
    });
    // Every member of the workspace belongs to #general.
    await Channel.updateOne({ name: "general" }, { $addToSet: { members: user._id } });
    // Let everyone's client pick up the new user live (search, @mentions) so
    // they don't have to refresh to find them.
    emitAll("user:new", user.toPublicJSON());
    return res.status(201).json({ token: signToken(user), user: user.toPublicJSON() });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// POST /api/auth/login
authRouter.post("/login", authRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const user = await User.findOne({ username: String(username).toLowerCase() });
  // Compare even when the user is missing to avoid leaking which step failed.
  const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Reject expired admin-issued OTPs.
  if (user.mustResetPassword && user.otpExpiresAt && user.otpExpiresAt < new Date()) {
    return res.status(401).json({ error: "Temporary password has expired. Ask an admin to issue a new one." });
  }

  return res.json({ token: signToken(user), user: user.toPublicJSON() });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});
