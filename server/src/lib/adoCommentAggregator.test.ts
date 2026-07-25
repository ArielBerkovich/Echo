import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * adoCommentAggregator unit tests.
 *
 * bufferComment() and flushExpiredCommentBuffers() both require a live MongoDB
 * connection and are therefore covered here only at the module-interface level.
 * The core business logic (deduplication by commentId, grace-period extension,
 * Markdown rendering) is tested in adoMessageRenderer.test.ts and via
 * integration tests that spin up mongodb-memory-server.
 */
describe("adoCommentAggregator", () => {
  it("exports bufferComment as a function", async () => {
    const mod = await import("../lib/adoCommentAggregator.js");
    assert.equal(typeof mod.bufferComment, "function");
  });

  it("exports flushExpiredCommentBuffers as a function", async () => {
    const mod = await import("../lib/adoCommentAggregator.js");
    assert.equal(typeof mod.flushExpiredCommentBuffers, "function");
  });
});
