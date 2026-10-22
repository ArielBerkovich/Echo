import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SCHEDULED_ATTEMPTS,
  scheduledClaimFilter,
  scheduledFailureUpdate,
  scheduledIdempotencyKey,
} from "./scheduledRetry.js";

test("scheduled failures back off and eventually become terminal", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  const retry = scheduledFailureUpdate(0, new Error("temporary"), now);
  assert.equal(retry.status, "pending");
  assert.equal(retry.attemptCount, 1);
  assert.equal(retry.nextAttemptAt?.getTime(), now.getTime() + 30_000);

  const terminal = scheduledFailureUpdate(MAX_SCHEDULED_ATTEMPTS - 1, new Error("permanent"), now);
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.nextAttemptAt, null);
  assert.equal(terminal.attemptCount, MAX_SCHEDULED_ATTEMPTS);
});

test("scheduled claims exclude failed messages and messages still in backoff", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  const filter = scheduledClaimFilter(now);
  assert.deepEqual(filter.status, { $in: ["pending", null] });
  assert.deepEqual(filter.$and[1], { $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] });
});

test("a scheduled message keeps the same delivery key on every retry", () => {
  assert.equal(scheduledIdempotencyKey("message-123"), "scheduled:message-123");
});
