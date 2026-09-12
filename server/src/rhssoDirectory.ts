import { config } from "./config.js";
import { User } from "./models/User.js";

const PAGE_SIZE = 100;
const CACHE_MS = 30_000;
let tokenCache: { value: string; expiresAt: number } | null = null;
let groupsCache: any[] | null = null;
let groupsCacheAt = 0;

function directoryBase() {
  return config.rhsso.backchannelUrl || config.rhsso.url;
}

export function rhssoDirectoryEnabled() {
  return !!(config.rhsso.enabled && config.rhsso.realm && config.rhsso.directoryClientId && config.rhsso.directoryClientSecret);
}

function unavailable() {
  return Object.assign(new Error("RHSSO group directory is not configured"), { status: 503 });
}

async function serviceToken() {
  if (!rhssoDirectoryEnabled()) throw unavailable();
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const issuer = `${directoryBase()}/realms/${encodeURIComponent(config.rhsso.realm)}`;
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.rhsso.directoryClientId,
      client_secret: config.rhsso.directoryClientSecret,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw Object.assign(new Error("RHSSO group directory authentication failed"), { status: 503 });
  tokenCache = { value: payload.access_token, expiresAt: Date.now() + Math.max(10, Number(payload.expires_in || 60) - 10) * 1000 };
  return tokenCache.value;
}

async function directoryFetch(path: string) {
  const response = await fetch(`${directoryBase()}/admin/realms/${encodeURIComponent(config.rhsso.realm)}${path}`, {
    headers: { Authorization: `Bearer ${await serviceToken()}`, Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error("RHSSO group directory request failed"), { status: 503 });
  return response.json();
}

function flatten(groups: any[], output: any[] = []) {
  for (const group of groups || []) {
    output.push({ id: String(group.id), name: String(group.name || group.path || group.id), path: String(group.path || `/${group.name || group.id}`) });
    flatten(group.subGroups || [], output);
  }
  return output;
}

export async function listRhssoGroups() {
  if (!rhssoDirectoryEnabled()) throw unavailable();
  if (groupsCache && Date.now() - groupsCacheAt < CACHE_MS) return groupsCache;
  const roots: any[] = [];
  for (let first = 0;; first += PAGE_SIZE) {
    const page = await directoryFetch(`/groups?briefRepresentation=false&populateHierarchy=true&first=${first}&max=${PAGE_SIZE}`);
    if (!Array.isArray(page) || page.length === 0) break;
    roots.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  groupsCache = flatten(roots);
  groupsCacheAt = Date.now();
  return groupsCache;
}

export async function rhssoGroup(groupId: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(String(groupId))) return null;
  const group = await directoryFetch(`/groups/${encodeURIComponent(groupId)}`);
  return group ? { id: String(group.id), name: String(group.name || group.path || group.id), path: String(group.path || `/${group.name || group.id}`) } : null;
}

export async function rhssoGroupMembers(groupId: string) {
  const members: any[] = [];
  for (let first = 0;; first += PAGE_SIZE) {
    const page = await directoryFetch(`/groups/${encodeURIComponent(groupId)}/members?briefRepresentation=true&first=${first}&max=${PAGE_SIZE}`);
    if (!Array.isArray(page) || page.length === 0) break;
    members.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const subjects = members.map((member) => String(member.id)).filter(Boolean);
  const issuer = `${config.rhsso.url}/realms/${encodeURIComponent(config.rhsso.realm)}`;
  const echoUsers = subjects.length ? await User.find({ rhssoIssuer: issuer, rhssoSubject: { $in: subjects } }) : [];
  const bySubject = new Map(echoUsers.map((user) => [user.rhssoSubject, user]));
  return members.map((member) => {
    const echoUser = bySubject.get(String(member.id));
    return {
      id: String(member.id),
      username: String(member.username || ""),
      displayName: String([member.firstName, member.lastName].filter(Boolean).join(" ") || member.username || "RHSSO user"),
      echoUser: echoUser ? echoUser.toPublicJSON() : null,
    };
  });
}

export async function resolveRhssoGroupMentions(body: string) {
  const ids = [...new Set([...String(body || "").matchAll(/@group\.([a-zA-Z0-9-]{1,80})\b/g)].map((match) => match[1]))];
  const resolved = await Promise.all(ids.map(async (id) => {
    const group = await rhssoGroup(id);
    if (!group) return null;
    const members = await rhssoGroupMembers(id);
    return { ...group, memberCount: members.length, echoMemberIds: members.filter((member) => member.echoUser).map((member) => member.echoUser.id) };
  }));
  return resolved.filter(Boolean);
}
