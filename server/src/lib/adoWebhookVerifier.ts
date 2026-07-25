import crypto from "crypto";
import { AzureDevOpsConfig } from "../models/AzureDevOpsConfig.js";

/**
 * Hash an opaque webhook token using SHA-256, matching the storage format in
 * AzureDevOpsConfig.tokenHash.  Identical to how Echo hashes incoming webhook
 * tokens in automation.ts.
 */
export function hashAdoToken(token: string): string {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Generate a new random opaque URL token for the ADO webhook endpoint.
 * Returns a 32-byte base64url string (same length as Echo's existing tokens).
 */
export function createAdoToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Look up the stored AzureDevOpsConfig by the URL token supplied in the
 * incoming request.  Returns the config document if the token is valid, or
 * null if no matching config exists.
 *
 * The token is hashed before the database lookup so the raw value is never
 * persisted anywhere in Echo.
 *
 * Usage (in the route handler):
 *   const config = await verifyAdoToken(req.params.token);
 *   if (!config) return res.status(403).json({ error: "forbidden" });
 */
export async function verifyAdoToken(rawToken: string): Promise<InstanceType<typeof AzureDevOpsConfig> | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const hash = hashAdoToken(rawToken);
  return AzureDevOpsConfig.findOne({ tokenHash: hash });
}
