import crypto from "crypto";
import { AzureDevOpsEvent } from "./models/AzureDevOpsEvent.js";
import { AzureDevOpsIntegration } from "./models/AzureDevOpsIntegration.js";
import { User } from "./models/User.js";
import { ensureDmChannel } from "./lib/dms.js";
import { deliverMessage } from "./deliver.js";

const AZURE_USERNAME = "azure";

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

function reviewers(value) {
  return value?.reviewers || value?.pullRequest?.reviewers;
}

function approvalStatus(payload) {
  const type = eventType(payload);
  const value = resource(payload);
  const list = reviewers(value);
  if (type !== "git.pullrequest.updated" || !Array.isArray(list)) return null;
  if (list.some((reviewer) => Number(reviewer?.vote) <= -10)) return "rejected";
  if (list.some((reviewer) => Number(reviewer?.vote) >= 10)) return "approved";
  return "reset";
}

export function notificationKind(payload) {
  const type = eventType(payload);
  const value = resource(payload);
  if (type === "git.pullrequest.created") return "pullRequestCreated";
  if (type === "git.pullrequest.updated" || type === "git.pullrequest.merged") {
    const status = String(value.status || "").toLowerCase();
    if (status === "completed") return "pullRequestCompleted";
    if (status === "abandoned") return "pullRequestAbandoned";
    if (type === "git.pullrequest.updated") {
      const status = approvalStatus({ eventType: type, resource: value });
      if (status === "approved") return "pullRequestApproved";
      if (status === "rejected") return "pullRequestRejected";
      if (status === "reset") return "pullRequestApprovalReset";
    }
  }
  if (type === "git.pullrequest.commented" || type === "ms.vss-code.git-pullrequest-comment-event") return "pullRequestCommented";
  if (type === "build.complete") {
    const result = buildResult(value);
    if (["failed", "failure", "partiallysucceeded", "stopped", "canceled", "cancelled"].includes(result)) {
      return "buildValidationFailed";
    }
    if (["succeeded", "success", "passed"].includes(result)) return "buildValidationSucceeded";
  }
  return null;
}

function eventKey(payload, kind) {
  const value = resource(payload);
  const commentId = value?.comment?.id || value?.comment?.commentId || "";
  const commentText = value?.comment?.content || value?.comment?.text || value?.content || "";
  return clean(
    payload?.id ||
      payload?.notificationId ||
      eventType(payload) + ":" + String(kind || "") + ":" + String(pullRequestNumber(value) || "") + ":" + String(value?.buildNumber || "") + ":" + String(commentId || commentText),
    300
  );
}

export function messageBody(kind, value) {
  const repo = repositoryName(value);
  const number = pullRequestNumber(value);
  const label = title(value);
  const link = webLink(value);
  const suffix = link ? "\n[Open in Azure DevOps](" + link + ")" : "";
  const comment = clean(value?.comment?.content || value?.comment?.text || value?.content, 2000);
  if (kind === "pullRequestCreated") return ":git-pull-request: Pull request created in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestApproved") return "👍 Pull request approved in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestApprovalReset") return ":git-pull-request: Pull request approval reset in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestRejected") return ":git-pull-request-closed: Pull request rejected in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestCommented") return "📝 New pull request comment in **" + repo + "**" + (number ? " (#" + number + ")" : "") + (comment ? "\n\n> " + comment.replace(/\n/g, "\n> ") : "") + suffix;
  if (kind === "pullRequestCompleted") return ":merged: Pull request merged in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestAbandoned") return ":git-pull-request-closed: Pull request abandoned in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "pullRequestReactivated") return ":git-pull-request: Pull request recreated in **" + repo + "**" + (number ? " (#" + number + ")" : "") + ": **" + label + "**" + suffix;
  if (kind === "buildValidationFailed") return "❌ Build validation failed for **" + repo + "**" + (number ? " PR #" + number : "") + ": **" + label + "**" + suffix;
  return "✅ Build validation succeeded for **" + repo + "**" + (number ? " PR #" + number : "") + ": **" + label + "**" + suffix;
}

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export async function processAzureDevOpsEvent(integration, payload) {
  let kind = notificationKind(payload);
  const value = resource(payload);
  const prNumber = pullRequestNumber(value) || buildPullRequestNumber(value);
  const currentApprovalStatus = approvalStatus(payload);
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
  if (!kind) return { ignored: true, reason: "unsupported event" };

  const key = eventKey(payload, kind);
  if (!key) return { ignored: true, reason: "missing event id" };
  let event;
  try {
    event = await AzureDevOpsEvent.create({
      integration: integration._id,
      eventKey: key,
      eventType: eventType(payload),
      notificationKind: kind,
      approvalState: currentApprovalStatus === null ? null : currentApprovalStatus === "approved",
      approvalStatus: currentApprovalStatus,
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
    if (kind !== "pullRequestCreated" && !root?.messageId) {
      await AzureDevOpsEvent.updateOne({ _id: event._id }, { $set: { status: "unmatched", pullRequestNumber: prNumber, recipient: recipient._id, lastError: "PR root message not found" } });
      return { ignored: true, reason: "PR root message not found" };
    }
    const message = await deliverMessage({
      channel,
      authorId: azure._id,
      body: messageBody(kind, value),
      parentId: kind === "pullRequestCreated" ? null : root.messageId,
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
