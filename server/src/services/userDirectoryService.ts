import mongoose from "mongoose";
import { User } from "../models/User.js";

/**
 * Resolve a directory user using the same ID-or-lowercase-username semantics
 * used by the REST and MCP adapters.
 */
export function findUserByIdOrUsername(userKey: unknown) {
  const value = String(userKey);
  return mongoose.isValidObjectId(value)
    ? User.findById(value)
    : User.findOne({ username: value.toLowerCase() });
}

export function findUserByUsername(username: unknown) {
  return User.findOne({ username: String(username).toLowerCase() });
}

export function findUserById(userId: unknown) {
  return User.findById(userId);
}

export function userExists(userId: unknown) {
  return User.exists({ _id: userId });
}

export function listDirectoryUsers({ skip = 0, limit = 100, query: rawQuery }: { skip?: number; limit?: number; query?: string } = {}) {
  const filter: Record<string, unknown> = { username: { $ne: "system" } };
  const term = String(rawQuery || "").trim().slice(0, 80);
  if (term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(escaped, "i");
    filter.$or = [{ username: match }, { displayName: match }];
  }
  const query = User.find(filter).sort({ displayName: 1, _id: 1 });
  if (skip) query.skip(skip);
  return query.limit(limit);
}
