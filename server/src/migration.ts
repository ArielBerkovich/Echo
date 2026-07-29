import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "./config.js";
import { signToken } from "./auth.js";
import { emitAll, disconnectUserSockets } from "./realtime.js";
import { passwordProblem } from "./password.js";
import { User } from "./models/User.js";
import { Channel } from "./models/Channel.js";
import { UserAlias } from "./models/UserAlias.js";
import { MigrationIntent } from "./models/MigrationIntent.js";
import { Message } from "./models/Message.js";
import { UserMigrationAudit } from "./models/UserMigrationAudit.js";
import { usernameIsReserved } from "./lib/userAliases.js";

const INTENT_TTL_SECONDS = 10 * 60;
const INTENT_COOKIE = "echo_migration_intent";
const dummyPasswordHash = bcrypt.hash(crypto.randomBytes(24).toString("base64url"), 10);

function httpError(status, message, details = {}) {
  return Object.assign(new Error(message), { status, ...details });
}

function secureCookieSuffix() {
  return config.clientOrigin.startsWith("https://") ? "; Secure" : "";
}

export function migrationIntentCookie(token) {
  return `${INTENT_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${INTENT_TTL_SECONDS}${secureCookieSuffix()}`;
}

export function clearMigrationIntentCookie() {
  return `${INTENT_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix()}`;
}

export function migrationIntentToken(cookieHeader) {
  for (const part of String(cookieHeader || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === INTENT_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function signIntent(intent) {
  return jwt.sign(
    { kind: "identity-migration", intentId: intent._id.toString() },
    config.jwtSecret,
    { expiresIn: INTENT_TTL_SECONDS }
  );
}

export function verifyIntentToken(token) {
  let payload;
  try {
    payload = jwt.verify(String(token || ""), config.jwtSecret);
  } catch {
    throw httpError(401, "This migration attempt expired. Please start again.");
  }
  if (payload.kind !== "identity-migration" || !mongoose.isValidObjectId(payload.intentId)) {
    throw httpError(401, "Invalid migration attempt.");
  }
  return payload;
}

function sourceEligible(user) {
  const origin = user?.authOrigin || (user?.rhssoIssuer || user?.rhssoSubject ? "rhsso" : "local");
  return !!user &&
    origin === "local" &&
    !user.rhssoIssuer &&
    !user.rhssoSubject &&
    !user.isAdmin &&
    user.username !== "system" &&
    !user.migratedAt &&
    !user.mustResetPassword;
}

export async function startMigration({ oldUsername, oldPassword, targetType }) {
  const username = String(oldUsername || "").trim().toLowerCase();
  if (!username || !oldPassword || !["local", "rhsso"].includes(targetType)) {
    throw httpError(400, "Old username, old password, and migration type are required.");
  }
  if (targetType === "rhsso" && !config.rhsso.enabled) {
    throw httpError(404, "RHSSO login is disabled.");
  }

  const user = await User.findOne({ username });
  const ok = await bcrypt.compare(String(oldPassword), user?.passwordHash || await dummyPasswordHash);
  if (!ok || !sourceEligible(user)) {
    throw httpError(401, "The old account credentials are invalid or the account cannot be migrated.");
  }

  const intent = await MigrationIntent.create({
    sourceUser: user._id,
    sourceUsername: user.username,
    sourceTokenVersion: user.tokenVersion ?? 0,
    targetType,
    expiresAt: new Date(Date.now() + INTENT_TTL_SECONDS * 1000),
  });
  return {
    intent,
    token: signIntent(intent),
    source: {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarKey ? `/api/files/${user.avatarKey}` : null,
    },
  };
}

export async function createRhssoCreationIntent(identity) {
  if (await User.exists({ rhssoIssuer: identity.issuer, rhssoSubject: identity.subject })) {
    throw httpError(409, "This RHSSO identity already belongs to an Echo account.");
  }
  const intent = await MigrationIntent.create({
    targetType: "rhsso",
    targetIssuer: identity.issuer,
    targetSubject: identity.subject,
    targetUsername: String(identity.username || "").trim().toLowerCase(),
    targetIdentityLabel: String(identity.displayName || identity.username || "").trim().slice(0, 128),
    status: "identity_verified",
    expiresAt: new Date(Date.now() + INTENT_TTL_SECONDS * 1000),
  });
  return { intent, token: signIntent(intent) };
}

export async function loadMigrationIntent(
  token,
  { allowConsumed = false, requireSource = true } = {}
) {
  const payload = verifyIntentToken(token);
  const intent = await MigrationIntent.findById(payload.intentId);
  if (!intent || intent.expiresAt <= new Date() || (!allowConsumed && intent.status === "consumed")) {
    throw httpError(401, "This migration attempt expired. Please start again.");
  }
  const source = intent.sourceUser ? await User.findById(intent.sourceUser) : null;
  if (requireSource && !source) throw httpError(409, "The old account no longer exists.");
  return { intent, source };
}

export async function attachMigrationSource(token, { oldUsername, oldPassword }) {
  const username = String(oldUsername || "").trim().toLowerCase();
  const { intent } = await loadMigrationIntent(token, { requireSource: false });
  if (intent.targetType !== "rhsso" || intent.status !== "identity_verified" || intent.sourceUser) {
    throw httpError(409, "This RHSSO account creation is no longer waiting for an old account.");
  }
  const user = await User.findOne({ username });
  const ok = await bcrypt.compare(String(oldPassword || ""), user?.passwordHash || await dummyPasswordHash);
  if (!ok || !sourceEligible(user)) {
    throw httpError(401, "The old account credentials are invalid or the account cannot be migrated.");
  }
  intent.sourceUser = user._id;
  intent.sourceUsername = user.username;
  intent.sourceTokenVersion = user.tokenVersion ?? 0;
  await intent.save();
  return {
    source: {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarKey ? `/api/files/${user.avatarKey}` : null,
    },
    target: {
      username: intent.targetUsername,
      identityLabel: intent.targetIdentityLabel,
    },
  };
}

export async function stageRhssoIdentity(token, identity) {
  const { intent, source } = await loadMigrationIntent(token);
  if (intent.targetType !== "rhsso" || intent.status !== "source_verified") {
    throw httpError(409, "This migration is not waiting for an RHSSO identity.");
  }
  if (!sourceEligible(source) ||
      source.username !== intent.sourceUsername ||
      (source.tokenVersion ?? 0) !== intent.sourceTokenVersion) {
    throw httpError(409, "The old account changed. Please start the migration again.");
  }
  if (await User.exists({ rhssoIssuer: identity.issuer, rhssoSubject: identity.subject })) {
    throw httpError(409, "This RHSSO identity already belongs to an Echo account.");
  }

  intent.targetIssuer = identity.issuer;
  intent.targetSubject = identity.subject;
  intent.targetUsername = String(identity.username || "").trim().toLowerCase();
  intent.targetIdentityLabel = String(identity.displayName || identity.username || "").trim().slice(0, 128);
  intent.status = "identity_verified";
  await intent.save();
  return intent;
}

export async function migrationStatus(token) {
  const { intent, source } = await loadMigrationIntent(token, {
    allowConsumed: true,
    requireSource: false,
  });
  return {
    status: intent.status,
    targetType: intent.targetType,
    source: source ? {
      username: intent.sourceUsername,
      displayName: source.displayName,
      avatarUrl: source.avatarKey ? `/api/files/${source.avatarKey}` : null,
    } : null,
    target: intent.targetType === "rhsso" && intent.status !== "source_verified"
      ? {
          username: intent.targetUsername,
          identityLabel: intent.targetIdentityLabel,
        }
      : null,
  };
}

export async function completeRhssoSignup(token) {
  const payload = verifyIntentToken(token);
  let completedUser;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const intent = await MigrationIntent.findById(payload.intentId).session(session);
      if (!intent || intent.expiresAt <= new Date() || intent.status !== "identity_verified" ||
          intent.targetType !== "rhsso" || intent.sourceUser) {
        throw httpError(409, "This RHSSO account creation can no longer be completed.");
      }
      const existing = await User.findOne({
        rhssoIssuer: intent.targetIssuer,
        rhssoSubject: intent.targetSubject,
      }).session(session);
      if (existing) {
        completedUser = existing;
      } else {
        const username = await availableIntentUsername(intent.targetUsername, session);
        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 10);
        [completedUser] = await User.create([{
          username,
          displayName: String(intent.targetIdentityLabel || username).trim().slice(0, 64),
          passwordHash,
          rhssoIssuer: intent.targetIssuer,
          rhssoSubject: intent.targetSubject,
          authOrigin: "rhsso",
          isAdmin: false,
        }], { session });
      }
      await Channel.updateOne(
        { name: "general" },
        { $addToSet: { members: completedUser._id } },
        { session }
      );
      intent.status = "consumed";
      intent.consumedUser = completedUser._id;
      await intent.save({ session });
    });
  } finally {
    await session.endSession();
  }
  if (!completedUser) throw httpError(409, "The RHSSO account could not be created.");
  emitAll("user:new", completedUser.toPublicJSON());
  return { token: signToken(completedUser), user: completedUser.toPublicJSON() };
}

async function availableIntentUsername(value, session) {
  const base = validateTargetUsername(value);
  if (!(await usernameIsReserved(base, { session }))) return base;
  for (let suffix = 1; suffix < 10000; suffix += 1) {
    const text = String(suffix);
    const candidate = `${base.slice(0, 32 - text.length)}${text}`;
    if (!(await usernameIsReserved(candidate, { session }))) return candidate;
  }
  throw httpError(409, "Could not allocate an Echo username for this RHSSO identity.");
}

function validateTargetUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,32}$/.test(username)) {
    throw httpError(400, "Username must be 2-32 characters and use only letters, numbers, ., _ or -.");
  }
  return username;
}

export async function completeMigration(token, { username: requestedUsername, password = null }) {
  const payload = verifyIntentToken(token);
  let passwordHash = null;
  const initialIntent = await MigrationIntent.findById(payload.intentId);
  if (!initialIntent) throw httpError(401, "This migration attempt expired. Please start again.");

  if (initialIntent.targetType === "local") {
    const weak = passwordProblem(password);
    if (weak) throw httpError(400, weak);
    passwordHash = await bcrypt.hash(String(password), 10);
  } else {
    passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 10);
  }

  let completedUser;
  let previousUsername;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const intent = await MigrationIntent.findById(payload.intentId).session(session);
      if (!intent || intent.expiresAt <= new Date()) {
        throw httpError(401, "This migration attempt expired. Please start again.");
      }
      if (intent.status === "consumed") {
        completedUser = await User.findById(intent.consumedUser).session(session);
        previousUsername = intent.sourceUsername;
        return;
      }
      if (intent.targetType === "rhsso" && intent.status !== "identity_verified") {
        throw httpError(409, "Complete RHSSO authentication before confirming this migration.");
      }
      if (intent.targetType === "local" && intent.status !== "source_verified") {
        throw httpError(409, "This local migration is not ready.");
      }

      const source = await User.findById(intent.sourceUser).session(session);
      if (!sourceEligible(source) ||
          source.username !== intent.sourceUsername ||
          (source.tokenVersion ?? 0) !== intent.sourceTokenVersion) {
        throw httpError(409, "The old account changed. Please start the migration again.");
      }

      const username = validateTargetUsername(
        intent.targetType === "rhsso" ? intent.targetUsername : requestedUsername
      );
      if (username === source.username) {
        throw httpError(400, "Choose a new username for the migrated account.");
      }
      if (await usernameIsReserved(username, { excludeUserId: source._id, session })) {
        throw httpError(409, `@${username} is already taken.`, { usernameTaken: true });
      }
      if (intent.targetType === "rhsso" &&
          await User.exists({
            _id: { $ne: source._id },
            rhssoIssuer: intent.targetIssuer,
            rhssoSubject: intent.targetSubject,
          }).session(session)) {
        throw httpError(409, "This RHSSO identity already belongs to an Echo account.");
      }

      previousUsername = source.username;
      await UserAlias.create(
        [{ aliasUsername: previousUsername, user: source._id }],
        { session }
      );

      source.username = username;
      source.passwordHash = passwordHash;
      source.authOrigin = source.authOrigin || "local";
      source.migratedAt = new Date();
      source.mustResetPassword = false;
      source.otpExpiresAt = null;
      source.tokenVersion = (source.tokenVersion ?? 0) + 1;
      if (intent.targetType === "rhsso") {
        source.rhssoIssuer = intent.targetIssuer;
        source.rhssoSubject = intent.targetSubject;
      } else {
        source.rhssoIssuer = undefined;
        source.rhssoSubject = undefined;
      }
      await source.save({ session });

      await UserMigrationAudit.create(
        [{
          user: source._id,
          oldUsername: previousUsername,
          newUsername: username,
          targetType: intent.targetType,
          rhssoIssuer: intent.targetType === "rhsso" ? intent.targetIssuer : null,
          rhssoSubject: intent.targetType === "rhsso" ? intent.targetSubject : null,
        }],
        { session }
      );

      await Message.updateMany(
        {
          "passwordHelpRequest.user": source._id,
          "passwordHelpRequest.status": { $in: ["pending", "issuing"] },
        },
        { $set: { passwordHelpRequest: null } },
        { session }
      );

      intent.status = "consumed";
      intent.consumedUser = source._id;
      await intent.save({ session });
      completedUser = source;
    });
  } finally {
    await session.endSession();
  }

  if (!completedUser) throw httpError(409, "The migration could not be completed.");
  const publicUser = {
    ...completedUser.toPublicJSON(),
    aliases: previousUsername ? [previousUsername] : [],
  };
  emitAll("user:identity-changed", {
    user: publicUser,
    previousUsername,
    aliases: publicUser.aliases,
  });
  emitAll("user:update", { user: publicUser, previousUsername, aliases: publicUser.aliases });
  await disconnectUserSockets(completedUser._id);
  return { token: signToken(completedUser), user: publicUser };
}
