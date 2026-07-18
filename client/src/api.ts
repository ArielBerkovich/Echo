import { readString, writeString } from "./lib/storage.js";

// Thin fetch wrapper that attaches the auth token and unwraps JSON / errors.
const TOKEN_KEY = "echo.token";
const BACKEND_URL_KEY = "echo.backendUrl";

function normalizeBackendUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a complete backend URL, for example https://echo.example.com");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The backend URL must start with http:// or https://");
  }
  return parsed.toString().replace(/\/$/, "");
}

// An empty URL deliberately preserves the normal web deployment behavior,
// where nginx proxies /api and /socket.io on the same origin.
export function getBackendUrl() {
  return readString(BACKEND_URL_KEY, "");
}

export function setBackendUrl(value) {
  const normalized = normalizeBackendUrl(value);
  writeString(BACKEND_URL_KEY, normalized || null);
  return normalized;
}

export function getToken() {
  return readString(TOKEN_KEY);
}

export function setToken(token) {
  writeString(TOKEN_KEY, token || null);
}

// Read only the expiry claim locally so the UI can notify the user at expiry;
// the server remains the authority and still validates every request.
export function getTokenExpiryMs() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function friendlyErrorMessage(status, serverMessage, path, errorLabel) {
  if (status >= 500) {
    if (path === "/auth/login") return "We couldn't sign you in right now. Please try again in a moment.";
    if (path === "/auth/register") return "We couldn't create your account right now. Please try again in a moment.";
    return "Something went wrong on our end. Please try again in a moment.";
  }
  if (status === 401) {
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
    if (res.status === 401 && getToken() && path !== "/auth/login") {
      window.dispatchEvent(new CustomEvent("echo:auth-expired"));
    }
    const error = new Error(friendlyErrorMessage(res.status, data.error, path, errorLabel));
    error.status = res.status;
    Object.assign(error, data);
    throw error;
  }
  return data;
}

async function request(path, { method = "GET", body } = {}) {
  const hasBody = body !== undefined;
  const base = getBackendUrl();

  try {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: authHeaders(hasBody ? { "Content-Type": "application/json" } : {}),
      body: hasBody ? JSON.stringify(body) : undefined,
    });

    return parseResponse(res, "Request", path);
  } catch (error) {
    if (error.status) throw error;
    throw new Error("We couldn't reach Echo right now. Check your connection and try again.");
  }
}

async function requestMultipart(path, form, errorLabel) {
  const base = getBackendUrl();
  try {
    const res = await fetch(`${base}/api${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });

    return parseResponse(res, errorLabel, path);
  } catch (error) {
    if (error.status) throw error;
    throw new Error("We couldn't reach Echo right now. Check your connection and try again.");
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
  health: () => request("/health"),
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  setupStatus: () => request("/auth/setup-status"),
  usernameOptions: (firstName, lastName, username) =>
    request(`/auth/username-options?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}&username=${encodeURIComponent(username)}`),
  me: () => request("/auth/me"),
  listUsers: () => request("/users"),
  listChannels: () => request("/channels"),
  listAllChannels: () => request("/channels?scope=all"),
  getChannel: (id) => request(`/channels/${id}`),
  createChannel: (name, type = "public") =>
    request("/channels", { method: "POST", body: { name, type } }),
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
  deleteActivity: (id) => request(`/activity/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getSaved: () => request("/saved"),
  toggleSaved: (messageId) => request(`/saved/${messageId}`, { method: "POST" }),
  getVips: () => request("/users/vips"),
  toggleVip: (userId) => request(`/users/${userId}/vip`, { method: "POST" }),
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
};
