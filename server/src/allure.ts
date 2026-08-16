import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function encryptAllureSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(config.jwtSecret).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAllureSecret(value) {
  const [ivText, tagText, ciphertextText] = String(value || "").split(".");
  if (!ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(config.jwtSecret).digest(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function allureApiBase(url) {
  let base = String(url || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) throw new Error("Allure URL must use http or https");
  // Admins usually copy the browser URL (localhost:5050), but the Echo
  // server runs in a container where localhost means the Echo container.
  // Resolve loopback URLs through the Docker host gateway in this deployment.
  try {
    const parsed = new URL(base);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      parsed.hostname = "172.17.0.1";
      base = parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    throw new Error("Allure URL must use http or https");
  }
  return /\/allure-docker-service$/i.test(base) ? base : `${base}/allure-docker-service`;
}

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  return cookies.map((cookie) => cookie.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
}

export async function allureFetch(settings, path, options = {}) {
  const base = allureApiBase(settings.url || settings.allure?.url);
  let cookie = "";
  const password = decryptAllureSecret(settings.allure?.passwordCiphertext);
  if (settings.allure?.username && password) {
    const login = await fetchWithTimeout(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: settings.allure.username, password }),
    });
    if (!login.ok) throw new Error(`Allure login failed (${login.status})`);
    cookie = cookieHeader(login);
  }
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("cookie", cookie);
  return fetchWithTimeout(`${base}${path.startsWith("/") ? path : `/${path}`}`, { ...options, headers });
}

export function createAllureReportToken(projectId, expiresIn = "15m") {
  return jwt.sign({ purpose: "allure-report", projectId: String(projectId) }, config.jwtSecret, { expiresIn });
}

export function verifyAllureReportToken(token, projectId) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return payload?.purpose === "allure-report" && payload.projectId === String(projectId);
  } catch {
    return false;
  }
}

export async function listAllureProjects(settings) {
  const response = await allureFetch(settings, "/projects");
  if (!response.ok) throw new Error(`Allure projects request failed (${response.status})`);
  const payload = await response.json();
  // Allure's built-in default project is an implementation detail and should
  // never become an Echo channel or appear in the project picker.
  return Object.keys(payload?.data?.projects || {}).filter((projectId) => projectId !== "default");
}

export function summarizeAllureReport(summary) {
  const statistic = summary?.statistic || summary?.data?.statistic || {};
  const statuses = ["passed", "failed", "broken", "skipped", "unknown"];
  const total = Number(statistic.total);
  const totalText = Number.isFinite(total) ? `**${total} tests**` : "the latest test run";
  const resultLines = statuses.map((status) => {
    const count = Number(statistic[status]) || 0;
    const percentage = total > 0 ? ` (${Math.round((count / total) * 100)}%)` : "";
    return `- ${status[0].toUpperCase()}${status.slice(1)}: **${count}**${percentage}`;
  }).filter((line) => !line.includes("**0**"));
  const time = summary?.time || summary?.data?.time || {};
  const duration = Number(time.duration);
  const timing = Number.isFinite(duration) && duration >= 0
    ? `- Duration: **${formatDuration(duration)}**`
    : null;
  const completedAt = formatReportTimestamp(time.stop);
  if (completedAt) resultLines.push(`- Completed: **⟦datetime:${new Date(Number(time.stop)).toISOString()}⟧**`);
  if (timing) resultLines.push(timing);
  return `${totalText}\n\n**Results**\n${resultLines.join("\n")}`;
}

export function allureReportStatus(summary) {
  const statistic = summary?.statistic || summary?.data?.statistic || {};
  const failed = Number(statistic.failed) || 0;
  const broken = Number(statistic.broken) || 0;
  const unknown = Number(statistic.unknown) || 0;
  if (failed > 0 || broken > 0) return { emoji: "❌", label: "Failed" };
  if (unknown > 0) return { emoji: "⚠️", label: "Warning" };
  return { emoji: "✅", label: "Passed" };
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatReportTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return new Date(timestamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
