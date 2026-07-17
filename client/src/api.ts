import { readString, writeString } from "./lib/storage.js";

// Thin fetch wrapper that attaches the auth token and unwraps JSON / errors.
const TOKEN_KEY = "echo.token";

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

async function parseResponse(res, errorLabel) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `${errorLabel} failed (${res.status})`);
  }
  return data;
}

async function request(path, { method = "GET", body } = {}) {
  const hasBody = body !== undefined;

  const res = await fetch(`/api${path}`, {
    method,
    headers: authHeaders(hasBody ? { "Content-Type": "application/json" } : {}),
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  return parseResponse(res, "Request");
}

async function requestMultipart(path, form, errorLabel) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  return parseResponse(res, errorLabel);
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
  setupStatus: () => request("/auth/setup-status"),
  me: () => request("/auth/me"),
  listUsers: () => request("/users"),
  listChannels: () => request("/channels"),
  listAllChannels: () => request("/channels?scope=all"),
  createChannel: (name, type = "public") =>
    request("/channels", { method: "POST", body: { name, type } }),
  joinChannel: (id) => request(`/channels/${id}/join`, { method: "POST" }),
  addChannelMember: (id, userId) =>
    request(`/channels/${id}/members`, { method: "POST", body: { userId } }),
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
