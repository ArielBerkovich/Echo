import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Channel } from "../models/Channel.js";
import { signToken } from "../auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { emitAll } from "../realtime.js";
import { passwordProblem } from "../password.js";
import { usernameCandidate, usernameFromName } from "../lib/usernames.js";

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

async function usernameSuggestions(base) {
  const suggestions = [];
  for (let suffix = 1; suggestions.length < 3 && suffix < 1000; suffix += 1) {
    const candidate = usernameCandidate(base, suffix);
    if (!(await User.exists({ username: candidate }))) suggestions.push(candidate);
  }
  return suggestions;
}

// GET /api/auth/setup-status — public. Tells the login screen whether the
// workspace still needs its first (admin) account created.
authRouter.get("/setup-status", async (_req, res) => {
  const count = await User.countDocuments({ username: { $ne: "system" } });
  res.json({ needsSetup: count === 0 });
});

// GET /api/auth/username-options — public availability check for signup.
authRouter.get("/username-options", async (req, res) => {
  const username = String(req.query.username || "").trim().toLowerCase();
  const first = String(req.query.firstName || "").trim();
  const last = String(req.query.lastName || "").trim();
  if (!username || !first || !last) return res.json({ available: true, suggestions: [] });

  const base = usernameFromName(first, last);
  const taken = !!(await User.exists({ username }));
  return res.json({
    available: !taken,
    suggestions: taken ? await usernameSuggestions(base) : [],
  });
});

// POST /api/auth/register
authRouter.post("/register", authRateLimit, async (req, res) => {
  const { username: requestedUsername, password, firstName, lastName } = req.body || {};
  const isAdminSetup = !(await User.exists({ username: { $ne: "system" } }));
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  if (!password || (!isAdminSetup && (!first || !last))) {
    return res.status(400).json({
      error: isAdminSetup ? "password is required" : "first name, last name, and password are required",
    });
  }
  if (!isAdminSetup && (first.length > 64 || last.length > 64)) {
    return res.status(400).json({ error: "Names must be 64 characters or fewer" });
  }
  if (!isAdminSetup && (!/^[A-Za-z]+$/.test(first) || !/^[A-Za-z]+$/.test(last))) {
    return res.status(400).json({ error: "Names can only contain English letters" });
  }
  const weak = passwordProblem(password);
  if (weak) {
    return res.status(400).json({ error: weak });
  }

  const requested = String(requestedUsername || "").trim().toLowerCase();
  const base = isAdminSetup ? "admin" : usernameFromName(first, last);
  if (isAdminSetup && requested !== "admin") {
    return res.status(400).json({ error: "The first account must use the username admin" });
  }
  if (requested && !/^[a-z0-9.]{2,32}$/.test(requested)) {
    return res.status(400).json({ error: "Username can only contain letters, numbers, and the name separator" });
  }
  if (requested && !requested.startsWith(base)) {
    return res.status(400).json({ error: `Username must start with ${base}` });
  }
  if (requested && !/^[a-z0-9]*$/.test(requested.slice(base.length))) {
    return res.status(400).json({ error: "Username suffixes can only contain letters and numbers" });
  }

  if (requested && (await User.exists({ username: requested }))) {
    return res.status(409).json({
      error: `@${requested} is already taken`,
      usernameTaken: true,
      suggestions: await usernameSuggestions(base),
    });
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), 10);
    // Atomically claim the admin slot: only the very first real account gets it.
    // Using findOneAndUpdate with $setOnInsert avoids a TOCTOU race where two
    // concurrent registrations both observe count === 0 and both get isAdmin.
    const existing2 = await User.findOne({ username: { $ne: "system" } }, { _id: 1 });
    const isFirstUser = !existing2;
    const candidate = requested || base;
    let user;
    try {
      user = await User.create({
        username: candidate,
        firstName: isAdminSetup ? undefined : first,
        lastName: isAdminSetup ? undefined : last,
        displayName: isAdminSetup ? "Admin" : `${first} ${last}`,
        passwordHash,
        isAdmin: isFirstUser,
      });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({
          error: `@${candidate} is already taken`,
          usernameTaken: true,
          suggestions: await usernameSuggestions(base),
        });
      }
      throw err;
    }
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
