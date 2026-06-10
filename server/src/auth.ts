import jwt from "jsonwebtoken";
import { config } from "./config.js";

const TOKEN_TTL = "7d";
const API_TOKEN_TTL = "365d"; // long-lived token for programmatic API access

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), tv: user.tokenVersion ?? 0 }, config.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

// A long-lived token the user can copy for scripting against the REST API.
// Verified by the same middleware as session tokens (same secret).
export function signApiToken(user) {
  return jwt.sign({ sub: user._id.toString(), kind: "api", tv: user.tokenVersion ?? 0 }, config.jwtSecret, {
    expiresIn: API_TOKEN_TTL,
  });
}

// Returns the decoded payload or throws if the token is invalid/expired.
export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
