import { WorkspaceSettings } from "./models/WorkspaceSettings.js";
import { decryptAzureDevOpsToken, encryptAzureDevOpsToken } from "./azureDevOps.js";
import { Channel } from "./models/Channel.js";
import { User } from "./models/User.js";
import { sendMessage } from "./services/messageService.js";

const CACHE_TTL_MS = 15 * 60 * 1000;
const workItemCache = new Map<string, { title: string; type: string; assignee: { displayName: string; uniqueName: string } | null; expiresAt: number }>();

export function normalizeAzureProjectUrl(value: unknown) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "dev.azure.com" || url.search || url.hash) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 4 && parts[2].toLowerCase() === "_workitems" && parts[3].toLowerCase() === "edit") parts.splice(2);
    if (parts.length !== 2) return null;
    const [organization, project] = parts.map((part) => decodeURIComponent(part));
    if (!organization || !project) return null;
    return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`;
  } catch { return null; }
}

function azureProjectUrl(settings: any) {
  return normalizeAzureProjectUrl(settings.projectUrl || settings.urlPrefix);
}

export async function getWorkItemSettings() {
  return (await WorkspaceSettings.findById("workspace")) || WorkspaceSettings.create({ _id: "workspace" });
}

export function workItemSettingsJSON(settings: any) {
  const item = settings.azureWorkItems || {};
  const projectUrl = azureProjectUrl(item) || "";
  return {
    enabled: !!item.enabled && !!item.tokenCiphertext && !!projectUrl,
    projectUrl,
    hasToken: !!item.tokenCiphertext,
    expiresAt: item.expiresAt || null,
    notifyChannel: item.notifyChannel ? String(item.notifyChannel) : "",
    lastError: item.lastError || null,
  };
}

export async function resolveWorkItemTitles(ids: string[], { refresh = false }: { refresh?: boolean } = {}) {
  const settings = await getWorkItemSettings();
  const item = settings.azureWorkItems;
  const projectUrl = azureProjectUrl(item);
  if (!item?.enabled || !item?.tokenCiphertext || !projectUrl) return { items: {}, missingIds: [] };
  const token = decryptAzureDevOpsToken(item.tokenCiphertext);
  if (!token) return { items: {}, missingIds: [] };
  const normalized = [...new Set(ids)].filter((id) => /^\d{1,10}$/.test(id));
  const result: Record<string, { title: string; type: string; url: string; assignee: { displayName: string; uniqueName: string } | null }> = {};
  const missingIds: string[] = [];
  const missing: string[] = [];
  const cachePrefix = `${projectUrl}:`;
  for (const id of normalized) {
    const cached = workItemCache.get(`${cachePrefix}${id}`);
    if (!refresh && cached && cached.expiresAt > Date.now()) result[id] = { title: cached.title, type: cached.type, url: `${projectUrl}/_workitems/edit/${id}`, assignee: cached.assignee };
    else missing.push(id);
  }
  if (!missing.length) return { items: result, missingIds };
  const authorization = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  await Promise.all(missing.map(async (id) => {
    try {
      const response = await fetch(`${projectUrl}/_apis/wit/workitems/${id}?api-version=7.1`, {
        headers: { authorization, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 404) {
        missingIds.push(id);
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      const title = String(data?.fields?.["System.Title"] || "").trim().slice(0, 300);
      const type = String(data?.fields?.["System.WorkItemType"] || "").trim().slice(0, 80);
      const assigned = data?.fields?.["System.AssignedTo"];
      const assignee = assigned ? {
        displayName: String(assigned.displayName || assigned.name || assigned).trim().slice(0, 120),
        uniqueName: String(assigned.uniqueName || assigned.mailAddress || "").trim().slice(0, 254),
      } : null;
      if (!title) return;
      workItemCache.set(`${cachePrefix}${id}`, { title, type, assignee, expiresAt: Date.now() + CACHE_TTL_MS });
      if (workItemCache.size > 5000) {
        const cutoff = Date.now();
        for (const [key, cached] of workItemCache) {
          if (cached.expiresAt <= cutoff || workItemCache.size > 4000) workItemCache.delete(key);
        }
      }
      result[id] = { title, type, url: `${projectUrl}/_workitems/edit/${id}`, assignee };
    } catch { /* Work item linking must never break message rendering. */ }
  }));
  return { items: result, missingIds };
}

export function workItemTypeEmoji(type: string) {
  const value = String(type || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "epic") return "🏰";
  if (value === "feature") return "🧩";
  if (value === "bug") return "🐞";
  if (value === "task") return "🔨";
  if (value.includes("user story")) return "📜";
  if (value.includes("product backlog item")) return "🎯";
  if (value.includes("requirement")) return "🧾";
  if (value === "issue") return "🚩";
  if (value.includes("test case")) return "🧫";
  if (value.includes("test plan")) return "🗺️";
  if (value.includes("test suite")) return "🧬";
  if (value.includes("shared step")) return "👣";
  if (value.includes("shared parameter")) return "🎛️";
  if (value.includes("code review request")) return "📨";
  if (value.includes("code review response")) return "📬";
  if (value.includes("feedback request")) return "🎤";
  if (value.includes("feedback response")) return "📢";
  if (value.includes("change request")) return "🔁";
  if (value === "risk") return "🌩️";
  if (value === "review") return "🧐";
  if (value === "impediment") return "🧱";
  return "🗂️";
}

export function workItemMessageText(id: string, item: { title: string; type?: string }) {
  const type = String(item.type || "").trim();
  const typeDetails = [type, workItemTypeEmoji(type)].filter(Boolean).join(" ");
  const typeLabel = typeDetails ? `(${typeDetails})` : "";
  return [`#${id} ${String(item.title || "").trim()}`, typeLabel].filter(Boolean).join(" ");
}

export function expandWorkItemReferences(body: string, items: Record<string, { text: string }>) {
  return String(body || "").replace(/#(\d{1,10})(?![\w-])/g, (reference, id) => items[id]?.text || reference);
}

export function normalizeWorkItemMarkdownLinks(body: string, items: Record<string, { url?: string }>) {
  let normalized = String(body || "");
  for (const [id, item] of Object.entries(items)) {
    if (!item.url) continue;
    const escapedUrl = item.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const link = new RegExp(`\\[[^\\]]*#${id}[^\\]]*\\]\\(${escapedUrl}\\)`, "g");
    normalized = normalized.replace(link, `#${id}`);
  }
  return normalized;
}

export function saveWorkItemToken(value: string) {
  return value.trim() ? encryptAzureDevOpsToken(value.trim()) : null;
}

export async function notifyAzureWorkItemTokenExpiry() {
  const settings = await WorkspaceSettings.findById("workspace");
  const integration = settings?.azureWorkItems;
  if (!integration?.enabled || !integration.expiresAt || !integration.notifyChannel) return;
  const now = new Date();
  const expiresAt = new Date(integration.expiresAt);
  const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (![14, 7, 6, 5, 4, 3, 2, 1].includes(daysRemaining)) return;
  const reminderKey = `${expiresAt.toISOString()}:${daysRemaining}`;
  const claim = await WorkspaceSettings.findOneAndUpdate(
    { _id: "workspace", "azureWorkItems.enabled": true, "azureWorkItems.expiresAt": integration.expiresAt, "azureWorkItems.lastReminderKey": { $ne: reminderKey } },
    { $set: { "azureWorkItems.lastReminderKey": reminderKey } },
    { new: true }
  );
  if (!claim) return;
  const channel = await Channel.findOne({ _id: integration.notifyChannel, isArchived: false, type: { $ne: "dm" } }).catch(() => null);
  if (!channel) {
    await WorkspaceSettings.updateOne({ _id: "workspace" }, { $set: { "azureWorkItems.lastError": "The token reminder channel is unavailable. Choose another channel in integration settings." } });
    return;
  }
  const system = await User.findOne({ username: "system" }).select({ _id: 1 }).lean();
  if (!system) {
    await WorkspaceSettings.updateOne({ _id: "workspace" }, { $set: { "azureWorkItems.lastError": "The Echo system account is unavailable." } });
    return;
  }
  try {
    const date = expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    const when = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
    await sendMessage({ channel, authorId: system._id, body: `Azure DevOps work item token expires in ${when} (${date}). Update the token in Settings → Integrations.` });
    await WorkspaceSettings.updateOne({ _id: "workspace" }, { $set: { "azureWorkItems.lastError": null } });
  } catch (error: any) {
    await WorkspaceSettings.updateOne({ _id: "workspace" }, { $set: { "azureWorkItems.lastError": String(error?.message || "Token reminder could not be delivered").slice(0, 500) } });
  }
}
