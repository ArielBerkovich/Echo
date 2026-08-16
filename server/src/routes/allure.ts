import { Router } from "express";
import crypto from "crypto";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { WorkspaceSettings } from "../models/WorkspaceSettings.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  allureApiBase,
  allureFetch,
  createAllureReportToken,
  decryptAllureSecret,
  encryptAllureSecret,
  allureReportStatus,
  listAllureProjects,
  summarizeAllureReport,
  verifyAllureReportToken,
} from "../allure.js";
import { postAutomationMessage } from "../automation.js";

export const allureRouter = Router();

const ALLURE_BOT_USERNAME = "allure-reports-bot";
const ALLURE_BOT_DISPLAY_NAME = "Allure Reports Bot";
const ALLURE_BOT_AVATAR = "/allure-docker-icon.png";

async function ensureAllureReportsBot() {
  let bot = await User.findOne({ username: ALLURE_BOT_USERNAME });
  if (!bot) {
    bot = await User.create({
      username: ALLURE_BOT_USERNAME,
      displayName: ALLURE_BOT_DISPLAY_NAME,
      passwordHash: "x",
      avatarUrlOverride: ALLURE_BOT_AVATAR,
    });
  } else if (bot.displayName !== ALLURE_BOT_DISPLAY_NAME || bot.avatarUrlOverride !== ALLURE_BOT_AVATAR) {
    bot.displayName = ALLURE_BOT_DISPLAY_NAME;
    bot.avatarUrlOverride = ALLURE_BOT_AVATAR;
    await bot.save();
  }
  return bot;
}

async function settings() {
  return (await WorkspaceSettings.findById("workspace")) || WorkspaceSettings.create({ _id: "workspace" });
}

function projectChannelName(projectId) {
  const slug = String(projectId).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55) || "default";
  return `allure-${slug}`;
}

function configuredProjectChannelName(settingsDoc, projectId) {
  const mapping = (settingsDoc.allure?.channelMappings || []).find((item) => item.projectId === projectId);
  return mapping?.channelName || projectChannelName(projectId);
}

async function syncProjects(settingsDoc, projectIds, creatorId) {
  const admins = await User.find({ isAdmin: true }, { _id: 1 }).lean();
  const projectSet = new Set(projectIds);
  const channels = [];
  for (const projectId of projectIds) {
    const name = configuredProjectChannelName(settingsDoc, projectId);
    const channel = await Channel.findOneAndUpdate(
      { "external.type": "allure", "external.projectId": projectId },
      {
        $set: {
          name,
          type: "public",
          topic: `Allure report for ${projectId}`,
          description: "Channel for Allure report updates and discussion.",
          readOnly: false,
          isArchived: false,
          members: admins.map((user) => user._id),
          managers: [creatorId],
        },
        $setOnInsert: { createdBy: creatorId, external: { type: "allure", projectId } },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    channels.push(channel.toPublicJSON());
  }
  await Channel.updateMany(
    { "external.type": "allure", "external.projectId": { $nin: [...projectSet] } },
    { $set: { isArchived: true } }
  );
  return channels;
}

allureRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const doc = await settings();
  const projects = await Channel.find({ "external.type": "allure", "external.projectId": { $ne: "default" }, isArchived: false }).sort({ name: 1 });
  res.json({
    allure: {
      enabled: !!doc.allure?.enabled,
      url: doc.allure?.url || "",
      username: doc.allure?.username || "",
      hasPassword: !!doc.allure?.passwordCiphertext,
      lastSyncedAt: doc.allure?.lastSyncedAt || null,
      lastError: doc.allure?.lastError || null,
      selectedProjectIds: doc.allure?.selectedProjectIds || [],
      projects: projects.map((project) => ({ id: project.external.projectId, channel: project.name })),
    },
  });
});

allureRouter.post("/discover", requireAuth, requireAdmin, async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!url) return res.status(400).json({ error: "Allure URL is required" });
  try {
    const projectIds = await listAllureProjects({ allure: { url, username, passwordCiphertext: encryptAllureSecret(password) } });
    res.json({ projects: projectIds });
  } catch (error) {
    res.status(502).json({ error: String(error?.message || "Allure discovery failed") });
  }
});

allureRouter.patch("/", requireAuth, requireAdmin, async (req, res) => {
  const doc = await settings();
  const body = req.body || {};
  const nextUrl = body.url === undefined ? doc.allure?.url : String(body.url).trim().replace(/\/+$/, "");
  if (nextUrl) allureApiBase(nextUrl);
  if (body.url !== undefined) doc.allure.url = nextUrl;
  if (body.username !== undefined) doc.allure.username = String(body.username || "").trim();
  if (body.password !== undefined) doc.allure.passwordCiphertext = body.password ? encryptAllureSecret(body.password) : null;
  if (body.enabled !== undefined) doc.allure.enabled = !!body.enabled;
  if (!doc.allure.url) {
    doc.allure.enabled = false;
    doc.allure.lastError = null;
    doc.allure.selectedProjectIds = [];
    doc.allure.channelMappings = [];
    doc.allure.selectionConfigured = false;
    await syncProjects(doc, [], req.user._id);
    await doc.save();
    return res.json({ allure: { enabled: false, url: "", username: "", hasPassword: false, selectedProjectIds: [], projects: [] } });
  }
  try {
    const discoveredProjectIds = await listAllureProjects(doc);
    const requestedProjectIds = Array.isArray(body.projectIds) ? body.projectIds.map(String) : null;
    const projectIds = requestedProjectIds
      ? discoveredProjectIds.filter((projectId) => requestedProjectIds.includes(projectId))
      : (doc.allure.selectionConfigured
        ? discoveredProjectIds.filter((projectId) => doc.allure.selectedProjectIds.includes(projectId))
        : discoveredProjectIds);
    if (requestedProjectIds) doc.allure.selectionConfigured = true;
    doc.allure.selectedProjectIds = projectIds;
    const requestedMappings = Array.isArray(body.channelMappings)
      ? body.channelMappings.reduce((map, item) => {
        if (item?.projectId && item?.channelName) map.set(String(item.projectId), String(item.channelName).trim().toLowerCase().replace(/^#/, ""));
        return map;
      }, new Map())
      : new Map((doc.allure.channelMappings || []).map((item) => [item.projectId, item.channelName]));
    const channelNames = new Set();
    doc.allure.channelMappings = projectIds.map((projectId) => {
      const channelName = requestedMappings.get(projectId) || projectChannelName(projectId);
      if (!/^[a-z0-9_-]{1,64}$/.test(channelName)) throw new Error(`Invalid channel name for Allure project ${projectId}`);
      if (channelNames.has(channelName)) throw new Error(`Allure channel name is used more than once: ${channelName}`);
      channelNames.add(channelName);
      return { projectId, channelName };
    });
    const channels = await syncProjects(doc, projectIds, req.user._id);
    doc.allure.lastSyncedAt = new Date();
    doc.allure.lastError = null;
    doc.allure.enabled = body.enabled === undefined ? true : !!body.enabled;
    await doc.save();
    res.json({ allure: { enabled: doc.allure.enabled, url: doc.allure.url, username: doc.allure.username || "", hasPassword: !!doc.allure.passwordCiphertext, selectedProjectIds: projectIds, lastSyncedAt: doc.allure.lastSyncedAt, lastError: null, projects: channels.map((channel) => ({ id: channel.external.projectId, channel: channel.name })) } });
  } catch (error) {
    doc.allure.lastError = String(error?.message || "Allure sync failed").slice(0, 500);
    await doc.save();
    res.status(502).json({ error: doc.allure.lastError });
  }
});

allureRouter.post("/sync", requireAuth, requireAdmin, async (req, res) => {
  const doc = await settings();
  if (!doc.allure?.url) return res.status(400).json({ error: "Allure is not configured" });
  try {
    const discoveredProjectIds = await listAllureProjects(doc);
    const projectIds = doc.allure.selectionConfigured
      ? discoveredProjectIds.filter((projectId) => doc.allure.selectedProjectIds.includes(projectId))
      : discoveredProjectIds;
    const channels = await syncProjects(doc, projectIds, req.user._id);
    doc.allure.lastSyncedAt = new Date();
    doc.allure.lastError = null;
    await doc.save();
    res.json({ projects: channels.map((channel) => ({ id: channel.external.projectId, channel: channel.name })), lastSyncedAt: doc.allure.lastSyncedAt });
  } catch (error) {
    doc.allure.lastError = String(error?.message || "Allure sync failed").slice(0, 500);
    await doc.save();
    res.status(502).json({ error: doc.allure.lastError });
  }
});

allureRouter.get("/projects/:projectId/report-url", requireAuth, async (req, res) => {
  const channel = await Channel.findOne({ "external.type": "allure", "external.projectId": req.params.projectId, isArchived: false });
  if (!channel) return res.status(404).json({ error: "Allure project not found" });
  res.json({ url: `/api/integrations/allure/projects/${encodeURIComponent(req.params.projectId)}/report/index.html?token=${encodeURIComponent(createAllureReportToken(req.params.projectId))}` });
});

export async function notifyAllureReports() {
  const doc = await settings();
  if (!doc.allure?.enabled || !doc.allure?.url) return;
  const [allureBot, channels] = await Promise.all([
    ensureAllureReportsBot(),
    Channel.find({ "external.type": "allure", isArchived: false }),
  ]);

  for (const channel of channels) {
    const projectId = channel.external?.projectId;
    if (!projectId) continue;
    try {
      const projectResponse = await allureFetch(doc, `/projects/${encodeURIComponent(projectId)}`);
      if (!projectResponse.ok) continue;
      const project = await projectResponse.json();
      const reportId = project?.data?.project?.reports_id?.[1];
      if (!reportId) continue;
      const upstream = await allureFetch(doc, `/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}/widgets/summary.json`);
      if (!upstream.ok) continue;
      const body = Buffer.from(await upstream.arrayBuffer());
      const summary = JSON.parse(body.toString("utf8"));
      const reportStatus = allureReportStatus(summary);
      // Allure rewrites report timing fields when it regenerates the latest
      // report. Those timestamps are not a new result, so exclude them from
      // the notification fingerprint to avoid repeating the same message.
      const stableSummary = {
        reportName: summary?.reportName || summary?.data?.reportName || "",
        statistic: summary?.statistic || summary?.data?.statistic || {},
      };
      const version = crypto.createHash("sha256").update(JSON.stringify(stableSummary)).digest("hex");
      const externalKey = `allure:${projectId}:${version}`;
      // Keep the report fingerprint unique across author identities so
      // introducing the dedicated bot does not repost an already-delivered
      // report that was previously authored by Echo.
      if (await Message.exists({ channel: channel._id, externalKey })) continue;
      const reportUrl = `/api/integrations/allure/projects/${encodeURIComponent(projectId)}/report/${encodeURIComponent(reportId)}/index.html?token=${encodeURIComponent(createAllureReportToken(projectId, "30d"))}`;
      await postAutomationMessage({
        channel,
        authorId: allureBot._id,
        source: "allure",
        externalKey,
        payload: {
          title: `${reportStatus.emoji} ${reportStatus.label} Allure report for ${projectId}`,
          externalKey,
          body: `${summarizeAllureReport(summary)}\n\n[Open Allure report](${reportUrl})`,
        },
      });
    } catch (error) {
      console.error(`Allure notification failed for ${projectId}:`, error.message);
    }
  }
}

allureRouter.get("/projects/:projectId/report-version", requireAuth, async (req, res) => {
  const channel = await Channel.findOne({ "external.type": "allure", "external.projectId": req.params.projectId, isArchived: false });
  if (!channel) return res.status(404).json({ error: "Allure project not found" });
  const doc = await settings();
  if (!doc.allure?.enabled || !doc.allure?.url) return res.status(404).json({ error: "Allure is not configured" });
  try {
    // index.html is a mostly static report shell. Hash the dynamic summary
    // instead so result uploads and regenerated reports get a new notification.
    let upstream = await allureFetch(doc, `/projects/${encodeURIComponent(req.params.projectId)}/reports/latest/widgets/summary.json`);
    if (!upstream.ok) upstream = await allureFetch(doc, `/projects/${encodeURIComponent(req.params.projectId)}/reports/latest/index.html`);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Allure report request failed (${upstream.status})` });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.json({ version: crypto.createHash("sha256").update(body).digest("hex") });
  } catch (error) {
    res.status(502).json({ error: String(error?.message || "Allure report request failed") });
  }
});

// Report pages have no Echo Authorization header, so they receive a signed URL
// from the authenticated endpoint above. Allure credentials remain on the
// server and are never sent to the browser.
function reportCookieName(projectId) {
  return `echo_allure_report_${Buffer.from(String(projectId)).toString("base64url")}`;
}

function reportTokenFromRequest(req, projectId) {
  const queryToken = String(req.query.token || "");
  if (queryToken) return queryToken;
  const cookieName = reportCookieName(projectId);
  const cookies = String(req.headers.cookie || "").split(";");
  const entry = cookies.find((item) => item.trim().startsWith(`${cookieName}=`));
  return entry ? decodeURIComponent(entry.trim().slice(cookieName.length + 1)) : "";
}

allureRouter.get("/projects/:projectId/report/*", async (req, res) => {
  const token = reportTokenFromRequest(req, req.params.projectId);
  if (!verifyAllureReportToken(token, req.params.projectId)) return res.status(401).send("Invalid or expired report link");
  const doc = await settings();
  if (!doc.allure?.enabled || !doc.allure?.url) return res.status(404).send("Allure is not configured");
  const requestedPath = req.params[0] || "index.html";
  const parts = requestedPath.split("/");
  const reportId = /^\d+$/.test(parts[0]) ? parts.shift() : "latest";
  const path = parts.join("/") || "index.html";
  const upstream = await allureFetch(doc, `/projects/${encodeURIComponent(req.params.projectId)}/reports/${reportId}/${path}`, { redirect: "follow" });
  if (!upstream.ok) return res.status(upstream.status).send(await upstream.text());
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.set("content-type", contentType);
  if (req.query.token) {
    res.set(
      "set-cookie",
      `${reportCookieName(req.params.projectId)}=${encodeURIComponent(token)}; Path=/api/integrations/allure/projects/${encodeURIComponent(req.params.projectId)}/report; HttpOnly; SameSite=Lax`
    );
  }
  res.set("cache-control", "no-store");
  res.send(Buffer.from(await upstream.arrayBuffer()));
});
