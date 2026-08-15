import { readString, writeString } from "./lib/storage.js";

// Thin fetch wrapper that attaches the auth token and unwraps JSON / errors.
const TOKEN_KEY = "echo.token";
const authExpiredListeners = new Set();

export function subscribeAuthExpired(listener) {
  authExpiredListeners.add(listener);
  return () => authExpiredListeners.delete(listener);
}

function notifyAuthExpired(path) {
  if (!getToken() || (path.startsWith("/auth/") && path !== "/auth/me")) return;
  for (const listener of authExpiredListeners) listener();
}

export function getToken() {
  return readString(TOKEN_KEY);
}

export function setToken(token) {
  writeString(TOKEN_KEY, token || null);
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function getBackendUrl() {
  const configured = typeof window !== "undefined" ? window.echoDesktopConfig?.backendUrl : "";
  return configured ? configured.replace(/\/+$/, "") : "";
}

export function rhssoLoginUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const query = origin ? `?origin=${encodeURIComponent(origin)}` : "";
  return `${getBackendUrl()}/api/auth/rhsso/login${query}`;
}

// The backend returns the Echo session in the URL fragment so it is never
// sent in an HTTP request or proxy access log. Consume and erase it promptly.
export function consumeRhssoCallback() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("rhsso_token");
  const error = params.get("rhsso_error") || "";
  if (!token && !error) return "";
  if (token) setToken(token);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return error;
}

function apiUrl(path) {
  return `${getBackendUrl()}/api${path}`;
}

function unreachableError() {
  const wrapped = new Error("We couldn't reach Echo right now. Check your connection and try again.");
  wrapped.isNetworkError = true;
  wrapped.backendUrl = getBackendUrl();
  return wrapped;
}

function friendlyErrorMessage(status, serverMessage, path, errorLabel) {
  if (status >= 500) {
    if (path === "/auth/login") return "We couldn't sign you in right now. Please try again in a moment.";
    if (path === "/auth/register") return "We couldn't create your account right now. Please try again in a moment.";
    if (path.startsWith("/integrations/allure")) return serverMessage || "Allure could not be reached. Check the service URL and credentials.";
    return "Something went wrong on our end. Please try again in a moment.";
  }
  if (status === 401) {
    if (path.startsWith("/auth/migration")) {
      return serverMessage || "This migration attempt expired. Please start again.";
    }
    return path === "/auth/login"
      ? "That username or password doesn't look right."
      : "Your session may have expired. Please sign in again.";
  }
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 408 || status === 429) return "That took a little too long. Please try again.";
  return serverMessage || `${errorLabel} couldn't be completed. Please try again.`;
}

async function parseResponse(res, errorLabel, path) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) notifyAuthExpired(path);
    const error = new Error(friendlyErrorMessage(res.status, data.error, path, errorLabel));
    error.status = res.status;
    Object.assign(error, data);
    throw error;
  }
  return data;
}

async function request(path, { method = "GET", body } = {}) {
  const hasBody = body !== undefined;
  const requestUrl = apiUrl(path);

  try {
    const res = await fetch(requestUrl, {
      method,
      credentials: "include",
      headers: authHeaders(hasBody ? { "Content-Type": "application/json" } : {}),
      body: hasBody ? JSON.stringify(body) : undefined,
    });

    return parseResponse(res, "Request", path);
  } catch (error) {
    if (error.status) throw error;
    throw unreachableError();
  }
}

async function requestMultipart(path, form, errorLabel) {
  const requestUrl = apiUrl(path);
  try {
    const res = await fetch(requestUrl, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
      body: form,
    });

    return parseResponse(res, errorLabel, path);
  } catch (error) {
    if (error.status) throw error;
    throw unreachableError();
  }
}

async function download(path, errorLabel) {
  const requestUrl = apiUrl(path);
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      credentials: "include",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const error = new Error(friendlyErrorMessage(res.status, data.error, path, errorLabel));
      error.status = res.status;
      throw error;
    }
    const contentDisposition = res.headers.get("Content-Disposition") || "";
    const filename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] || "echo-notifier.hpi";
    return { blob: await res.blob(), filename };
  } catch (error) {
    if (error.status) throw error;
    throw unreachableError();
  }
}

// Multipart upload (kept separate from `request` so the browser sets the
// multipart boundary itself — don't add a Content-Type header here).
async function uploadFiles(files) {
  const form = new FormData();
  for (const f of files) form.append("files", f);

  return requestMultipart("/uploads", form, "Upload");
}

// Register a custom emoji (multipart: name + image/GIF file).
async function createEmoji(name, file) {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);

  return requestMultipart("/emojis", form, "Could not add emoji");
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  startMigration: (payload) =>
    request("/auth/migration/start", { method: "POST", body: payload }),
  migrationStatus: () => request("/auth/migration/status"),
  attachMigrationSource: (payload) =>
    request("/auth/migration/attach-source", { method: "POST", body: payload }),
  createRhssoUser: () =>
    request("/auth/migration/create-rhsso-user", { method: "POST" }),
  confirmMigration: (payload) =>
    request("/auth/migration/confirm", { method: "POST", body: payload }),
  requestPasswordHelp: (username) =>
    request("/auth/forgot-password", { method: "POST", body: { username } }),
  setupStatus: () => request("/auth/setup-status"),
  usernameOptions: (firstName, lastName, username) =>
    request(`/auth/username-options?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&username=${encodeURIComponent(username)}`),
  me: () => request("/auth/me"),
  getWorkspace: () => request("/workspace"),
  updateWorkspace: (payload) => request("/workspace", { method: "PATCH", body: payload }),
  getAzureDevOpsIntegration: () => request("/integrations/azure-devops"),
  getAllureIntegration: () => request("/integrations/allure"),
  downloadJenkinsPlugin: () => download("/integrations/jenkins/download", "Jenkins plugin download"),
  discoverAllureProjects: (payload) => request("/integrations/allure/discover", { method: "POST", body: payload }),
  updateAllureIntegration: (payload) => request("/integrations/allure", { method: "PATCH", body: payload }),
  syncAllureIntegration: () => request("/integrations/allure/sync", { method: "POST" }),
  getAllureReportUrl: (projectId) => request(`/integrations/allure/projects/${encodeURIComponent(projectId)}/report-url`),
  getAllureReportVersion: (projectId) => request(`/integrations/allure/projects/${encodeURIComponent(projectId)}/report-version`),
  createAzureDevOpsIntegration: (name = "Azure DevOps") =>
    request("/integrations/azure-devops", { method: "POST", body: { name } }),
  regenerateAzureDevOpsToken: (id) =>
    request(`/integrations/azure-devops/${encodeURIComponent(id)}/token`, { method: "POST" }),
  updateAzureDevOpsIntegration: (id, payload) =>
    request(`/integrations/azure-devops/${encodeURIComponent(id)}`, { method: "PATCH", body: payload }),
  listUsers: () => request("/users"),
  getUser: (userId) => request(`/users/${encodeURIComponent(userId)}`),
  listChannels: () => request("/channels"),
  listAllChannels: () => request("/channels?scope=all"),
  browseChannels: ({ q = "", membership = "all", cursor = "", limit = 50 } = {}) => {
    const params = new URLSearchParams({
      scope: "all",
      catalog: "1",
      membership,
      limit: String(limit),
    });
    if (q) params.set("q", q);
    if (cursor) params.set("cursor", cursor);
    return request(`/channels?${params.toString()}`);
  },
  getChannelByName: (name) => request(`/channels/by-name/${encodeURIComponent(name)}`),
  getChannel: (id) => request(`/channels/${id}`),
  createChannel: (name, type = "public", readOnly = false) =>
    request("/channels", {
      method: "POST",
      body: { name, type, ...(readOnly ? { readOnly: true } : {}) },
    }),
  joinChannel: (id) => request(`/channels/${id}/join`, { method: "POST" }),
  addChannelMember: (id, userId) =>
    request(`/channels/${id}/members`, { method: "POST", body: { userId } }),
  promoteChannelManager: (id, userId) =>
    request(`/channels/${id}/managers`, { method: "POST", body: { userId } }),
  removeChannelMember: (id, userId) =>
    request(`/channels/${id}/members/${userId}`, { method: "DELETE" }),
  leaveChannel: (id, managerId) =>
    request(`/channels/${id}/leave`, { method: "POST", body: managerId ? { managerId } : {} }),
  deleteChannel: (id) => request(`/channels/${id}`, { method: "DELETE" }),
  setChannelVisibility: (id, type) =>
    request(`/channels/${id}`, { method: "PATCH", body: { type } }),
  setChannelInfo: (id, patch) =>
    request(`/channels/${id}`, { method: "PATCH", body: patch }),
  getMessages: (id, { around, before } = {}) => {
    const qs = around
      ? `?around=${encodeURIComponent(around)}`
      : before
      ? `?before=${encodeURIComponent(before)}`
      : "";
    return request(`/channels/${id}/messages${qs}`);
  },
  searchMessages: (q, page = 0, sort = "relevance") =>
    request(`/search/messages?q=${encodeURIComponent(q)}&page=${page}&sort=${sort}`),
  markRead: (id, thread = null) =>
    request(`/channels/${id}/read`, { method: "POST", body: thread ? { thread } : undefined }),
  getThread: (channelId, msgId) =>
    request(`/channels/${channelId}/messages/${msgId}/thread`),
  getPinned: (channelId) => request(`/channels/${channelId}/pinned`),
  listDms: () => request("/dms"),
  openDm: (userId) => request("/dms", { method: "POST", body: { userId } }),
  hideDm: (id) => request(`/dms/${id}`, { method: "DELETE" }),
  getActivity: () => request("/activity"),
  markActivityRead: () => request("/activity/read", { method: "POST" }),
  clearActivity: () => request("/activity", { method: "DELETE" }),
  deleteActivity: (id) => request(`/activity/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getSaved: () => request("/saved"),
  toggleSaved: (messageId) => request(`/saved/${messageId}`, { method: "POST" }),
  getStarred: async () => {
    const result = await request("/users/vips");
    return { ...result, starredIds: result.vipIds };
  },
  toggleStarred: async (userId) => {
    const result = await request(`/users/${userId}/vip`, { method: "POST" });
    return { ...result, starred: result.vip };
  },
  markOnboarded: () => request("/users/me/onboarded", { method: "POST" }),
  scheduleMessage: (channelId, payload) =>
    request("/scheduled", { method: "POST", body: { channelId, ...payload } }),
  listScheduled: (channelId) =>
    request(`/scheduled${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ""}`),
  updateScheduled: (id, payload) => request(`/scheduled/${id}`, { method: "PATCH", body: payload }),
  cancelScheduled: (id) => request(`/scheduled/${id}`, { method: "DELETE" }),
  uploadFiles,
  listEmojis: () => request("/emojis"),
  createEmoji,
  updateProfile: (payload) => request("/users/me", { method: "PATCH", body: payload }),
  getApiToken: () => request("/users/me/api-token"),
  // Change your own password. `currentPassword` is omitted only when finishing
  // an admin-issued one-time-password reset (the user is already signed in).
  changePassword: (currentPassword, newPassword) =>
    request("/users/me/password", { method: "PATCH", body: { currentPassword, newPassword } }),
  // Admin: issue a one-time password for a user. Returns { tempPassword }.
  adminResetPassword: (userId) =>
    request(`/admin/users/${userId}/reset-password`, { method: "POST" }),
  adminIssuePasswordHelp: (messageId) =>
    request(`/admin/password-help/${messageId}/issue`, { method: "POST" }),
};
