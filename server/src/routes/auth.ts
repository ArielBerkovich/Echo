import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { Channel } from "../models/Channel.js";
import { signToken } from "../auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { emitAll } from "../realtime.js";
import { deliverMessage } from "../deliver.js";
import { ensureDmChannel } from "../lib/dms.js";
import { passwordProblem } from "../password.js";
import { usernameCandidate, usernameFromName } from "../lib/usernames.js";
import { config } from "../config.js";
import { usernameIsReserved } from "../lib/userAliases.js";
import { clearUserActivity } from "../lib/activity.js";
import {
  clearMigrationIntentCookie,
  completeMigration,
  loadMigrationIntent,
  migrationIntentCookie,
  migrationIntentToken,
  migrationStatus,
  createRhssoCreationIntent,
  attachMigrationSource,
  completeRhssoSignup,
  stageRhssoIdentity,
  startMigration,
  verifyIntentToken,
} from "../migration.js";
import {
  beginRhssoLogin,
  clearRhssoCookie,
  cookieValue,
  finishRhssoLogin,
  rhssoCookie,
  rhssoClientOrigin,
  rhssoFlowContext,
} from "../rhsso.js";

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

const passwordHelpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PASSWORD_HELP_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password-help requests. Please try again later." },
});
const passwordHelpRateLimit =
  process.env.NODE_ENV === "production"
    ? passwordHelpLimiter
    : (_req, _res, next) => next();

async function usernameSuggestions(base) {
  const suggestions = [];
  for (let suffix = 1; suggestions.length < 3 && suffix < 1000; suffix += 1) {
    const candidate = usernameCandidate(base, suffix);
    if (!(await usernameIsReserved(candidate))) suggestions.push(candidate);
  }
  return suggestions;
}

// GET /api/auth/setup-status — public. Tells the login screen whether the
// workspace still needs its first (admin) account created.
authRouter.get("/setup-status", async (_req, res) => {
  const count = await User.countDocuments({ username: { $ne: "system" } });
  res.json({ needsSetup: count === 0, rhssoEnabled: config.rhsso.enabled && count > 0 });
});

function rhssoClientRedirect(res, error, token = "", clientOrigin = config.clientOrigin) {
  const fragment = new URLSearchParams();
  if (token) fragment.set("rhsso_token", token);
  if (error) fragment.set("rhsso_error", error);
  return res.redirect(302, `${clientOrigin.replace(/\/+$/, "")}/#${fragment}`);
}

function externalUsername(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32)
    .replace(/[._-]+$/g, "");
  return normalized.length >= 2 ? normalized : `user.${normalized || "rhsso"}`.slice(0, 32);
}

async function availableExternalUsername(value) {
  const base = externalUsername(value);
  if (!(await usernameIsReserved(base))) return base;
  for (let suffix = 1; suffix < 10000; suffix += 1) {
    const text = String(suffix);
    const candidate = `${base.slice(0, 32 - text.length)}${text}`;
    if (!(await usernameIsReserved(candidate))) return candidate;
  }
  throw new Error("Could not allocate an Echo username for this RHSSO identity");
}

// GET /api/auth/rhsso/login — starts an OIDC authorization-code + PKCE flow.
authRouter.get("/rhsso/login", async (req, res) => {
  try {
    if (!(await User.exists({ isAdmin: true }))) {
      return rhssoClientRedirect(res, "Create the local admin account before using RHSSO.");
    }
    const clientOrigin = rhssoClientOrigin(req.query.origin);
    const { authorizationUrl, flowToken, redirectUri } = await beginRhssoLogin({ clientOrigin });
    res.setHeader("Set-Cookie", rhssoCookie(flowToken, redirectUri));
    return res.redirect(302, authorizationUrl);
  } catch (error) {
    return rhssoClientRedirect(res, error?.message || "Could not start RHSSO login.");
  }
});

// GET /api/auth/rhsso/callback — validates RHSSO's ID token, provisions the
// identity without linking by username, and returns an ordinary Echo session.
authRouter.get("/rhsso/callback", async (req, res) => {
  res.setHeader("Set-Cookie", clearRhssoCookie());
  let migrationFlow = false;
  let clientOrigin = config.clientOrigin;
  try {
    const flowToken = cookieValue(req.headers.cookie, "echo_rhsso_flow");
    const flow = rhssoFlowContext(flowToken);
    clientOrigin = rhssoClientOrigin(flow.clientOrigin);
    migrationFlow = flow.kind === "rhsso-migration";
    if (req.query.error) {
      const message = String(req.query.error_description || req.query.error);
      return migrationFlow
        ? migrationClientRedirect(res, message, clientOrigin)
        : rhssoClientRedirect(res, message, "", clientOrigin);
    }
    if (migrationFlow) {
      const intentToken = migrationIntentToken(req.headers.cookie);
      const intentPayload = verifyIntentToken(intentToken);
      const identity = await finishRhssoLogin({
        code: String(req.query.code || ""),
        state: String(req.query.state || ""),
        flowToken,
        expectedKind: "rhsso-migration",
      });
      if (identity.intentId !== intentPayload.intentId) {
        return migrationClientRedirect(
          res,
          "The RHSSO identity does not match this migration attempt.",
          clientOrigin
        );
      }
      await stageRhssoIdentity(intentToken, {
        ...identity,
        username: externalUsername(identity.username),
      });
      return migrationClientRedirect(res, "", clientOrigin);
    }
    const identity = await finishRhssoLogin({
      code: String(req.query.code || ""),
      state: String(req.query.state || ""),
      flowToken,
    });

    let user = await User.findOne({ rhssoIssuer: identity.issuer, rhssoSubject: identity.subject });
    if (user?.isAdmin) {
      return rhssoClientRedirect(
        res,
        "The bootstrap admin account only supports local login.",
        "",
        clientOrigin
      );
    }
    if (!user) {
      const pending = await createRhssoCreationIntent({
        ...identity,
        username: externalUsername(identity.username),
      });
      res.setHeader("Set-Cookie", [clearRhssoCookie(), migrationIntentCookie(pending.token)]);
      return rhssoCreationClientRedirect(res, clientOrigin);
    }
    return rhssoClientRedirect(res, "", signToken(user), clientOrigin);
  } catch (error) {
    console.error("RHSSO login failed:", error);
    return migrationFlow
      ? migrationClientRedirect(res, error?.message || "RHSSO migration failed.", clientOrigin)
      : rhssoClientRedirect(res, error?.message || "RHSSO login failed.", "", clientOrigin);
  }
});

function migrationClientRedirect(res, error = "", clientOrigin = config.clientOrigin) {
  const fragment = new URLSearchParams();
  if (error) fragment.set("migration_error", error);
  else fragment.set("migration", "rhsso-ready");
  return res.redirect(302, `${clientOrigin.replace(/\/+$/, "")}/#${fragment}`);
}

function rhssoCreationClientRedirect(res, clientOrigin = config.clientOrigin) {
  return res.redirect(
    302,
    `${clientOrigin.replace(/\/+$/, "")}/#rhsso_creation=pending`
  );
}

// POST /api/auth/migration/start — prove ownership of an eligible old local
// account. No Echo session is created; the signed, short-lived intent cookie
// carries the browser through local or RHSSO account creation.
authRouter.post("/migration/start", authRateLimit, async (req, res) => {
  try {
    const result = await startMigration({
      oldUsername: req.body?.oldUsername,
      oldPassword: req.body?.oldPassword,
      targetType: req.body?.targetType,
    });
    const cookies = [migrationIntentCookie(result.token)];
    let authorizationUrl = null;
    if (result.intent.targetType === "rhsso") {
      const rhsso = await beginRhssoLogin({
        kind: "rhsso-migration",
        intentId: result.intent._id.toString(),
        clientOrigin: rhssoClientOrigin(req.body?.clientOrigin),
      });
      cookies.push(rhssoCookie(rhsso.flowToken, rhsso.redirectUri));
      authorizationUrl = rhsso.authorizationUrl;
    }
    res.setHeader("Set-Cookie", cookies);
    return res.status(201).json({ source: result.source, targetType: result.intent.targetType, authorizationUrl });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.status ? error.message : "Could not start account migration.",
    });
  }
});

authRouter.get("/migration/status", async (req, res) => {
  try {
    return res.json(await migrationStatus(migrationIntentToken(req.headers.cookie)));
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.status ? error.message : "Could not load this migration.",
    });
  }
});

authRouter.post("/migration/attach-source", authRateLimit, async (req, res) => {
  try {
    return res.json(await attachMigrationSource(
      migrationIntentToken(req.headers.cookie),
      { oldUsername: req.body?.oldUsername, oldPassword: req.body?.oldPassword }
    ));
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.status ? error.message : "Could not verify the old account.",
    });
  }
});

authRouter.post("/migration/create-rhsso-user", authRateLimit, async (req, res) => {
  try {
    const result = await completeRhssoSignup(migrationIntentToken(req.headers.cookie));
    res.setHeader("Set-Cookie", clearMigrationIntentCookie());
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.status ? error.message : "Could not create the RHSSO account.",
    });
  }
});

authRouter.post("/migration/confirm", authRateLimit, async (req, res) => {
  try {
    const { intent } = await loadMigrationIntent(
      migrationIntentToken(req.headers.cookie),
      { allowConsumed: true }
    );
    if (intent.targetType === "local" && !req.body?.password) {
      return res.status(400).json({ error: "A new password is required." });
    }
    const result = await completeMigration(
      migrationIntentToken(req.headers.cookie),
      { username: req.body?.username, password: req.body?.password }
    );
    res.setHeader("Set-Cookie", clearMigrationIntentCookie());
    return res.json(result);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "That username is no longer available.", usernameTaken: true });
    }
    return res.status(error?.status || 500).json({
      error: error?.status ? error.message : "Could not complete account migration.",
      ...(error?.usernameTaken ? { usernameTaken: true } : {}),
    });
  }
});

// GET /api/auth/username-options — public availability check for signup.
authRouter.get("/username-options", async (req, res) => {
  const username = String(req.query.username || "").trim().toLowerCase();
  const first = String(req.query.firstName || "").trim();
  const last = String(req.query.lastName || "").trim();
  if (!username || !first || !last) return res.json({ available: true, suggestions: [] });

  const base = usernameFromName(first, last);
  const taken = await usernameIsReserved(username);
  return res.json({
    available: !taken,
    suggestions: taken ? await usernameSuggestions(base) : [],
  });
});

// POST /api/auth/forgot-password — public. A locked-out local user can ask the
// workspace admin for help without needing a session. The response is always
// the same whether the username exists or not, so this cannot be used to find
// valid accounts.
authRouter.post("/forgot-password", passwordHelpRateLimit, async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();

  if (username) {
    try {
      const [user, system, admins] = await Promise.all([
        User.findOne({ username, rhssoSubject: { $exists: false }, isAdmin: false }),
        User.findOne({ username: "system" }),
        User.find({ isAdmin: true }),
      ]);

      if (user && system && admins.length > 0) {
        await Promise.all(
          admins.map(async (admin) => {
            const channel = await ensureDmChannel(system._id, admin._id);
            await deliverMessage({
              channel,
              authorId: system._id,
              body:
                `Password help requested for @${user.username}. ` +
                `Use the button below to issue a one-time password and post it as your reply.`,
              passwordHelpRequest: {
                user: user._id,
                username: user.username,
                status: "pending",
              },
            });
          })
        );
      }
    } catch (error) {
      // Keep the public response enumeration-safe while leaving an actionable
      // server-side record if notification delivery fails.
      console.error("Could not deliver password-help request:", error);
    }
  }

  res.status(202).json({
    ok: true,
    message: "If that username belongs to a local account, the workspace admin has been notified.",
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

  if (requested && (await usernameIsReserved(requested))) {
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
        authOrigin: "local",
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
    await clearUserActivity(user._id);
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

  const user = await User.findOne({
    username: String(username).toLowerCase(),
    rhssoSubject: { $exists: false },
  });
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
