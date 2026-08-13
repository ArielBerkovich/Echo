import crypto from "crypto";
import { AzureDevOpsEvent } from "./models/AzureDevOpsEvent.js";
import { AzureDevOpsIntegration } from "./models/AzureDevOpsIntegration.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import { ensureDmChannel } from "./lib/dms.js";
import { deliverMessage } from "./deliver.js";
import { emitToChannel } from "./realtime.js";

const AZURE_USERNAME = "azure";
const APPROVAL_EMOJI = "👍";

export function createAzureDevOpsToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashAzureDevOpsToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function tokenKey() {
  return crypto.createHash("sha256").update(String(process.env.JWT_SECRET || "")).digest();
}

export function encryptAzureDevOpsToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAzureDevOpsToken(value) {
  const [ivText, tagText, ciphertextText] = String(value || "").split(".");
  if (!ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function ensureAzureUser() {
  let user = await User.findOne({ username: AZURE_USERNAME });
  if (!user) {
    user = await User.create({
      username: AZURE_USERNAME,
      displayName: "Azure",
      passwordHash: "x",
      avatarUrlOverride: "/azure-devops-icon.svg",
    });
  } else if (user.displayName !== "Azure" || user.avatarUrlOverride !== "/azure-devops-icon.svg") {
    user.displayName = "Azure";
    user.avatarUrlOverride = "/azure-devops-icon.svg";
    await user.save();
  }
  return user;
}

function clean(value, max = 300) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : "";
}

function eventType(payload) {
  return clean(payload?.eventType || payload?.event?.type, 100).toLowerCase();
}

function eventMessage(payload) {
  return clean(payload?.message?.text || payload?.detailedMessage?.text, 500).toLowerCase();
}

function resource(payload) {
  return payload?.resource || {};
}

function identityFor(value) {
  return value?.pullRequest?.createdBy || value?.createdBy || value?.requestedFor || value?.requestedBy || null;
}

function usernameCandidates(identity) {
  const uniqueName = clean(identity?.uniqueName, 160).toLowerCase();
  const displayName = clean(identity?.displayName, 160).toLowerCase();
  const localPart = uniqueName.includes("@") ? uniqueName.split("@")[0] : uniqueName;
  return [...new Set([uniqueName, localPart, displayName].filter(Boolean))]
    .map((value) => value.replace(/^@+/, "").replace(/[^a-z0-9_.-]/g, ""))
    .filter((value) => value.length >= 2);
}

async function resolveRecipient(identity) {
  if (!identity) return null;
  const candidates = usernameCandidates(identity);
  if (!candidates.length) return null;
  return User.findOne({
    $and: [
      { username: { $in: candidates } },
      { username: { $ne: "system" } },
    ],
  });
}

function repositoryName(value) {
  return clean(value?.repository?.name || value?.repository?.project?.name, 160) || "repository";
}

function pullRequestNumber(value) {
  return value?.pullRequestId ?? value?.pullrequestId ?? value?.pullRequest?.pullRequestId ?? buildPullRequestNumber(value);
}

function buildPullRequestNumber(value) {
  const match = String(value?.sourceBranch || "").match(/^refs\/pull\/(\d+)\//i);
  return match ? Number(match[1]) : null;
}

function webLink(value) {
  return clean(value?._links?.web?.href || value?.url || value?.remoteUrl, 1000);
}

function title(value) {
  return clean(value?.title || value?.definition?.name || value?.buildNumber, 200) || "Untitled";
}

function buildResult(value) {
  return clean(value?.result || value?.status, 40).toLowerCase().replace(/[^a-z]/g, "");
}

function hasApproval(value) {
  const reviewers = value?.reviewers || value?.pullRequest?.reviewers;
  return Array.isArray(reviewers) && reviewers.some((reviewer) => Number(reviewer?.vote) >= 10);
}

function approvalState(payload) {
  const type = eventType(payload);
  const value = resource(payload);
  const reviewers = value?.reviewers || value?.pullRequest?.reviewers;
  if (type !== "git.pullrequest.updated" || !Array.isArray(reviewers)) return null;
  return hasApproval(resource(payload));
}

async function updateApprovalReaction(messageId, azureUserId, approved) {
  const message = await Message.findById(messageId);
  if (!message) return null;
  let entry = message.reactions.find((reaction) => reaction.emoji === APPROVAL_EMOJI);
  if (approved) {
    if (!entry) {
      message.reactions.push({ emoji: APPROVAL_EMOJI, users: [azureUserId] });
    } else if (!entry.users.some((userId) => userId.equals(azureUserId))) {
      entry.users.push(azureUserId);
    }
  } else if (entry) {
    entry.users = entry.users.filter((userId) => !userId.equals(azureUserId));
    if (!entry.users.length) message.reactions = message.reactions.filter((reaction) => reaction.emoji !== APPROVAL_EMOJI);
  }
  await message.save();
  emitToChannel(message.channel.toString(), "message:reaction", {
    messageId: message._id.toString(),
    reactions: message.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users.map((userId) => userId.toString()),
    })),
  });
  return message;
}

export function notificationKind(payload) {
  const type = eventType(payload);
  const value = resource(payload);
  if (type === "git.pullrequest.created") return "pullRequestCreated";
  if (type === "git.pullrequest.updated" || type === "git.pullrequest.merged") {
    const status = String(value.status || "").toLowerCase();
    if (status === "completed") return "pullRequestCompleted";
    if (status === "abandoned") return "pullRequestAbandoned";
    if (type === "git.pullrequest.updated" && hasApproval(value)) return "pullRequestApproved";
  }
  if (type === "build.complete") {
    const result = buildResult(value);
    if (["failed", "failure", "partiallysucceeded", "stopped", "canceled", "cancelled"].includes(result)) {
      return "buildValidationFailed";
    }
    if (["succeeded", "success", "passed"].includes(result)) return "buildValidationSucceeded";
  }
  return null;
}

function eventKey(payload) {
  const value = resource(payload);
  return clean(
    payload?.id ||
      payload?.notificationId ||
      eventType(payload) + ":" + String(pullRequestNumber(value) || "") + ":" + String(value?.buildNumber || ""),
    300
  );
}

export function messageBody(kind, value) {
  const repo = repositoryName(value);
  const number = pullRequestNumber(value);
  const label = title(value);
  const link = webLink(value);
  const suffix = link ? "\n[Open in Azure DevOps](" + link + ")" : "";
  if (kind === "pullRequestCreated") return "🟦 Pull request created in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestApproved") return "👍 Pull request approved in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestCompleted") return "✅ Pull request completed in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestAbandoned") return "⚪ Pull request abandoned in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestReactivated") return "🔄 Pull request reactivated in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "buildValidationFailed") return "❌ Build validation failed for **" + repo + "**" + (number ? " PR #" + number : "") + ": **" + label + "**" + suffix;
  return "✅ Build validation succeeded for **" + repo + "**" + (number ? " PR #" + number : "") + ": **" + label + "**" + suffix;
}

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export async function processAzureDevOpsEvent(integration, payload) {
  let kind = notificationKind(payload);
  const value = resource(payload);
  const prNumber = pullRequestNumber(value) || buildPullRequestNumber(value);
  const currentApprovalState = approvalState(payload);
  if (!kind && prNumber && eventType(payload) === "git.pullrequest.updated" && String(value.status || "").toLowerCase() === "active" && /reactivat|reopen/.test(eventMessage(payload))) {
    kind = "pullRequestReactivated";
  }
  if (!kind && prNumber && eventType(payload) === "git.pullrequest.updated" && String(value.status || "").toLowerCase() === "active") {
    const abandoned = await AzureDevOpsEvent.exists({
      integration: integration._id,
      pullRequestNumber: prNumber,
      notificationKind: "pullRequestAbandoned",
    });
    if (abandoned) kind = "pullRequestReactivated";
  }
  if (!kind && currentApprovalState === null) return { ignored: true, reason: "unsupported event" };

  const key = eventKey(payload);
  if (!key) return { ignored: true, reason: "missing event id" };
  let event;
  try {
    event = await AzureDevOpsEvent.create({
      integration: integration._id,
      eventKey: key,
      eventType: eventType(payload),
      notificationKind: kind,
      approvalState: currentApprovalState,
    });
  } catch (error) {
    if (error?.code === 11000) {
      event = await AzureDevOpsEvent.findOne({ integration: integration._id, eventKey: key });
      if (!event) return { duplicate: true };
      const status = event.status || "delivered"; // Legacy records predate event states.
      const updatedAt = new Date(event.updatedAt || event.createdAt).getTime();
      const stale = Date.now() - updatedAt >= PROCESSING_LEASE_MS;
      if (!["failed", "unmatched"].includes(status) && !(status === "processing" && stale)) {
        return { duplicate: true };
      }
      const claimed = await AzureDevOpsEvent.updateOne(
        { _id: event._id, status: { $in: ["failed", "unmatched", "processing"] }, ...(status === "processing" ? { updatedAt: { $lt: new Date(Date.now() - PROCESSING_LEASE_MS) } } : {}) },
        { $set: { status: "processing", lastError: null }, $inc: { attempts: 1 } }
      );
      if (!claimed.modifiedCount) return { duplicate: true };
      event = await AzureDevOpsEvent.findById(event._id);
    }
    else throw error;
  }

  if (!event) {
    throw new Error("Azure event could not be claimed");
  }

  if (currentApprovalState !== null && prNumber) {
    const rootEvent = await AzureDevOpsEvent.findOne({
      integration: integration._id,
      pullRequestNumber: prNumber,
      notificationKind: "pullRequestCreated",
      messageId: { $ne: null },
    }).sort({ createdAt: 1 });
    const azure = await ensureAzureUser();
    if (!rootEvent?.messageId) {
      await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "unmatched", pullRequestNumber: prNumber, lastError: "PR root message not found" } });
      return { ignored: true, reason: "PR root message not found" };
    }
    if (integration.notify?.pullRequestApproved === false) {
      await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored", pullRequestNumber: prNumber, messageId: rootEvent.messageId } });
      return { ignored: true, reason: "notification disabled" };
    }
    await updateApprovalReaction(rootEvent.messageId, azure._id, currentApprovalState);
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "delivered", pullRequestNumber: prNumber, messageId: rootEvent.messageId, recipient: rootEvent.recipient, processedAt: new Date(), lastError: null } });
    return { notified: true, reaction: currentApprovalState ? "added" : "removed", messageId: rootEvent.messageId.toString() };
  }

  if (currentApprovalState !== null && prNumber) {
    const previousReview = await AzureDevOpsEvent.findOne({
      integration: integration._id,
      pullRequestNumber: prNumber,
      approvalState: { $ne: null },
      _id: { $ne: event._id },
      createdAt: { $lt: event.createdAt },
    }).sort({ createdAt: -1 });
    if (kind === "pullRequestApproved" && previousReview?.approvalState === true) {
      await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored", pullRequestNumber: prNumber } });
      return { ignored: true, reason: "approval state already notified" };
    }
    if (!kind) {
      await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored", pullRequestNumber: prNumber } });
      return { ignored: true, reason: "approval revoked" };
    }
  }

  if (!kind) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored" } });
    return { ignored: true, reason: "unsupported event" };
  }

  try {
    await AzureDevOpsIntegration.updateOne(
      { _id: integration._id },
      { $set: { lastReceivedAt: new Date() } }
    );
  } catch (error) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "failed", lastError: String(error?.message || error).slice(0, 500) } });
    throw error;
  }

  const directIdentity = eventType(payload) === "build.complete" ? null : identityFor(value);
  let recipient = await resolveRecipient(directIdentity);
  if (!recipient && prNumber) {
    const previous = await AzureDevOpsEvent.findOne({
      integration: integration._id,
      pullRequestNumber: prNumber,
      recipient: { $ne: null },
    }).sort({ createdAt: -1 });
    recipient = previous?.recipient ? await User.findById(previous.recipient) : null;
  }
  if (!recipient && eventType(payload) === "build.complete") {
    recipient = await resolveRecipient(identityFor(value));
  }
  if (!recipient) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "unmatched", pullRequestNumber: prNumber, lastError: "PR opener could not be matched" } });
    return { ignored: true, reason: "PR opener could not be matched" };
  }
  await AzureDevOpsEvent.updateOne(
    { _id: event._id },
    { $set: { pullRequestNumber: prNumber, recipient: recipient._id } }
  );
  if (integration.notify?.[kind] === false) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "ignored" } });
    return { ignored: true, reason: "notification disabled" };
  }

  const azure = await ensureAzureUser();
  if (!azure) {
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "failed", lastError: "Azure user unavailable" } });
    throw new Error("Azure user unavailable");
  }
  try {
    const channel = await ensureDmChannel(azure._id, recipient._id);
    const root = prNumber
      ? await AzureDevOpsEvent.findOne({
          integration: integration._id,
          pullRequestNumber: prNumber,
          notificationKind: "pullRequestCreated",
          messageId: { $ne: null },
        }).sort({ createdAt: 1 })
      : null;
    const message = await deliverMessage({
      channel,
      authorId: azure._id,
      body: messageBody(kind, value),
      parentId: kind === "pullRequestCreated" ? null : root?.messageId || null,
    });
    await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "delivered", messageId: message.id, processedAt: new Date(), lastError: null } });
    await AzureDevOpsIntegration.updateOne(
      { _id: integration._id },
      { $set: { lastReceivedAt: new Date(), lastError: null } }
    );
    return { notified: true, recipient: recipient.toPublicJSON(), message };
  } catch (error) {
    await AzureDevOpsEvent.updateOne(
      { _id: event._id },
      { $set: { status: "failed", lastError: String(error?.message || error).slice(0, 500) } }
    ).catch(() => {});
    throw error;
  }
}

export async function findAzureDevOpsIntegration(token) {
  return AzureDevOpsIntegration.findOne({ tokenHash: hashAzureDevOpsToken(token), active: true });
}

export function integrationEndpointPath(token) {
  return "/api/integrations/azure-devops/" + token;
}
