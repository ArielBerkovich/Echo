import { User } from "../models/User.js";
import { UserAlias } from "../models/UserAlias.js";

export async function usernameIsReserved(username, { excludeUserId = null, session = null } = {}) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) return false;
  const userQuery = { username: normalized };
  if (excludeUserId) userQuery._id = { $ne: excludeUserId };
  const [user, alias] = await Promise.all([
    User.exists(userQuery).session(session),
    UserAlias.exists({ aliasUsername: normalized }).session(session),
  ]);
  return !!(user || alias);
}

export async function aliasesByUserId(userIds) {
  if (!userIds.length) return new Map();
  const aliases = await UserAlias.find({ user: { $in: userIds } }, { user: 1, aliasUsername: 1 }).lean();
  const byUser = new Map();
  for (const alias of aliases) {
    const id = alias.user.toString();
    const values = byUser.get(id) || [];
    values.push(alias.aliasUsername);
    byUser.set(id, values);
  }
  return byUser;
}
