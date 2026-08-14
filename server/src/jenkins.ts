import crypto from "crypto";
import { JenkinsEvent } from "./models/JenkinsEvent.js";
import { JenkinsIntegration } from "./models/JenkinsIntegration.js";
import { User } from "./models/User.js";
import { Channel } from "./models/Channel.js";
import { deliverMessage } from "./deliver.js";

const JENKINS_USERNAME = "jenkins";

export const JENKINS_NOTIFY_KEYS = ["buildStarted", "buildSucceeded", "buildFailed", "buildUnstable", "buildAborted"];

export function createJenkinsToken() { return crypto.randomBytes(32).toString("base64url"); }
export function hashJenkinsToken(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
function tokenKey() { return crypto.createHash("sha256").update(String(process.env.JWT_SECRET || "")).digest(); }
export function encryptJenkinsToken(token) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv); const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]); return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join("."); }
export function decryptJenkinsToken(value) { const [ivText, tagText, ciphertextText] = String(value || "").split("."); if (!ivText || !tagText || !ciphertextText) return null; try { const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivText, "base64url")); decipher.setAuthTag(Buffer.from(tagText, "base64url")); return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8"); } catch { return null; } }

const clean = (value, max = 300) => String(value ?? "").trim().slice(0, max);
function build(payload) { return payload?.build || payload?.data?.build || payload; }
function job(payload) { const b = build(payload); return clean(b?.jobName || b?.job?.fullName || b?.job?.name || payload?.name || payload?.projectName || payload?.job?.name || "Jenkins job", 180); }
function result(payload) { return clean(build(payload)?.result || build(payload)?.status || payload?.result || payload?.status, 40).toLowerCase(); }
function eventKind(payload) {
  const value = result(payload);
  const b = build(payload);
  const type = clean(payload?.eventType || payload?.type || payload?.event || payload?.action, 80).toLowerCase();
  if (/^start|begin|building|queued/.test(type) || value === "building" || b?.building === true) return "buildStarted";
  if (["success", "succeeded", "passed"].includes(value) || ["success", "succeeded", "passed"].includes(type)) return "buildSucceeded";
  if (["failure", "failed"].includes(value) || ["failure", "failed"].includes(type)) return "buildFailed";
  if (value === "unstable" || value === "warning" || type === "unstable") return "buildUnstable";
  if (["aborted", "cancelled", "canceled"].includes(value)) return "buildAborted";
  return null;
}
export function notificationKind(payload) { return eventKind(payload); }
export function eventKey(payload, kind) { const b = build(payload); const number = b?.number || payload?.buildNumber || String(payload?.buildName || "").replace(/^#/, ""); const timestamp = b?.timestamp || payload?.timestamp || b?.url || payload?.buildUrl || ""; return clean(payload?.id || payload?.eventId || b?.id || `${job(payload)}:${number}:${kind}:${timestamp}`, 300); }
export function messageBody(kind, payload) {
  const name = job(payload); const b = build(payload); const number = b?.number || payload?.buildNumber || String(payload?.buildName || "").replace(/^#/, ""); const url = clean(b?.url || payload?.url || payload?.buildUrl, 1000); const suffix = url ? `\n[Open in Jenkins](${url})` : ""; const label = number ? ` #${number}` : "";
  if (kind === "buildStarted") return `🔨 Build started in **${name}**${label}${suffix}`;
  if (kind === "buildSucceeded") return `✅ Build succeeded in **${name}**${label}${suffix}`;
  if (kind === "buildFailed") return `❌ Build failed in **${name}**${label}${suffix}`;
  if (kind === "buildUnstable") return `⚠️ Build unstable in **${name}**${label}${suffix}`;
  return `⏹️ Build aborted in **${name}**${label}${suffix}`;
}

async function ensureJenkinsUser() {
  let user = await User.findOne({ username: JENKINS_USERNAME });
  if (!user) user = await User.create({ username: JENKINS_USERNAME, displayName: "Jenkins", passwordHash: "x", avatarUrlOverride: "/jenkins-icon.svg" });
  else if (user.displayName !== "Jenkins" || user.avatarUrlOverride !== "/jenkins-icon.svg") { user.displayName = "Jenkins"; user.avatarUrlOverride = "/jenkins-icon.svg"; await user.save(); }
  return user;
}

export async function processJenkinsEvent(integration, payload) {
  const kind = notificationKind(payload);
  if (!kind) return { ignored: true, reason: "unsupported event" };
  const channel = integration.channel
    ? await Channel.findOne({ _id: integration.channel, isArchived: false, type: "public" })
    : await Channel.findOne({ name: "general", isArchived: false, type: "public" });
  if (!channel) return { ignored: true, reason: "Jenkins destination channel is unavailable" };
  const key = eventKey(payload, kind);
  if (!key) return { ignored: true, reason: "missing event id" };
  let event;
  try { event = await JenkinsEvent.create({ integration: integration._id, eventKey: key, eventType: clean(payload?.eventType || payload?.type || payload?.event || "build", 80), notificationKind: kind, payload }); }
  catch (error) { if (error?.code === 11000) return { duplicate: true }; throw error; }
  await JenkinsIntegration.updateOne({ _id: integration._id }, { $set: { lastReceivedAt: new Date(), lastError: null } });
  if (integration.notify?.[kind] === false) { await JenkinsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored", processedAt: new Date() } }); return { ignored: true, reason: "notification disabled" }; }
  try {
    const jenkins = await ensureJenkinsUser();
    const message = await deliverMessage({ channel, authorId: jenkins._id, body: messageBody(kind, payload), parentId: null });
    await JenkinsEvent.updateOne({ _id: event._id }, { $set: { status: "delivered", messageId: message.id, processedAt: new Date() } });
    return { notified: true, channel: channel.toPublicJSON(), message };
  } catch (error) { await JenkinsEvent.updateOne({ _id: event._id }, { $set: { status: "failed", lastError: String(error?.message || error).slice(0, 500) } }).catch(() => {}); throw error; }
}

export function findJenkinsIntegration(token) { return JenkinsIntegration.findOne({ tokenHash: hashJenkinsToken(token), active: true }); }
export function integrationEndpointPath(token) { return `/api/integrations/jenkins/${token}`; }
