export const MAX_SCHEDULED_ATTEMPTS = 5;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;

export function scheduledClaimFilter(now: Date) {
  return {
    // Treat pre-migration rows without a status as pending.
    status: { $in: ["pending", null] },
    scheduledFor: { $lte: now },
    $and: [
      { $or: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { $lte: now } }] },
      { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
    ],
  };
}

export function scheduledIdempotencyKey(id: { toString(): string } | string) {
  return `scheduled:${id.toString()}`;
}

export function scheduledFailureUpdate(attempts: number, error: unknown, now: Date) {
  const attemptCount = attempts + 1;
  const failed = attemptCount >= MAX_SCHEDULED_ATTEMPTS;
  const delay = Math.min(RETRY_BASE_MS * 2 ** (attemptCount - 1), RETRY_MAX_MS);
  return {
    attemptCount,
    status: failed ? "failed" : "pending",
    nextAttemptAt: failed ? null : new Date(now.getTime() + delay),
    lastError: String(error instanceof Error ? error.message : error).slice(0, 500),
  };
}
