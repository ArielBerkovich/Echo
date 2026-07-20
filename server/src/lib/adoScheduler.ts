import { flushExpiredCommentBuffers } from "./adoCommentAggregator.js";

const TICK_MS = Math.max(
  5_000,
  Number(process.env.ADO_SCHEDULER_TICK_MS) || 30_000
);

/**
 * Start the Azure DevOps background scheduler.
 *
 * Currently runs a single periodic job: flush expired PR-comment aggregation
 * buffers into digest DMs.  Additional ADO background work can be added here
 * without affecting the existing message scheduler in scheduler.ts.
 *
 * Tick interval defaults to 30 s and is configurable via the
 * ADO_SCHEDULER_TICK_MS environment variable.
 */
export function startAdoScheduler(): void {
  let running = false;

  setInterval(async () => {
    if (running) return; // Avoid overlapping ticks.
    running = true;
    try {
      await flushExpiredCommentBuffers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ado] scheduler tick error:", message);
    } finally {
      running = false;
    }
  }, TICK_MS);
}
