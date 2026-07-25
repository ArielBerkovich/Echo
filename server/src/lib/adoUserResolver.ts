import { User } from "../models/User.js";
import { AzureDevOpsConfig } from "../models/AzureDevOpsConfig.js";

/**
 * In-memory cache for config user-mapping lookups.
 * Avoids a MongoDB round-trip on every webhook event while still picking up
 * mapping changes within a short window.
 */
interface CacheEntry {
  userId: string | null;
  expiresAt: number;
}
const resolverCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function cacheGet(email: string): string | null | undefined {
  const entry = resolverCache.get(email);
  if (!entry) return undefined; // cache miss
  if (Date.now() > entry.expiresAt) {
    resolverCache.delete(email);
    return undefined; // expired
  }
  return entry.userId; // may be null (negative cache)
}

function cacheSet(email: string, userId: string | null) {
  resolverCache.set(email, { userId, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve an Azure DevOps identity (email / UPN) to an Echo User document.
 *
 * Resolution order:
 *  1. In-memory cache (30-second TTL)
 *  2. Static mapping in AzureDevOpsConfig.userMapping (exact, case-insensitive)
 *  3. Username fallback: match the local part of the email against User.username
 *
 * Returns null when no mapping can be found so callers can log a warning and
 * skip the notification rather than throwing.
 */
export async function resolveEchoUser(
  adoEmail: string
): Promise<InstanceType<typeof User> | null> {
  if (!adoEmail) return null;
  const normalised = adoEmail.trim().toLowerCase();

  // 1. Cache
  const cached = cacheGet(normalised);
  if (cached !== undefined) {
    return cached ? User.findById(cached) : null;
  }

  // 2. Static config mapping
  const config = await AzureDevOpsConfig.findOne().lean();
  if (config) {
    const entry = (config.userMapping ?? []).find(
      (m: { adoEmail: string; echoUserId: unknown }) => m.adoEmail === normalised
    );
    if (entry) {
      const user = await User.findById(entry.echoUserId);
      cacheSet(normalised, user ? user._id.toString() : null);
      return user;
    }
  }

  // 3. Username fallback (local part of e-mail, e.g. "alice@company.com" → "alice")
  const localPart = normalised.split("@")[0].replace(/[^a-z0-9_.-]/g, "");
  if (localPart) {
    const user = await User.findOne({ username: localPart });
    cacheSet(normalised, user ? user._id.toString() : null);
    return user;
  }

  cacheSet(normalised, null);
  return null;
}

/**
 * Invalidate the entire resolver cache (e.g. after an admin updates
 * AzureDevOpsConfig.userMapping).
 */
export function invalidateResolverCache() {
  resolverCache.clear();
}
