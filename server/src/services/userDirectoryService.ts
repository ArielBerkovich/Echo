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

export function listDirectoryUsers({ limit }: { limit?: number } = {}) {
  const query = User.find({ username: { $ne: "system" } }).sort({ displayName: 1 });
  return limit === undefined ? query : query.limit(limit);
}
