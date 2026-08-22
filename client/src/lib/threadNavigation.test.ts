import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasThreadJumpTarget, scrollThreadMessageIntoView } from "./threadNavigation.js";

describe("thread navigation", () => {
  it("does not start at the bottom when a permalink has a jump target", () => {
    assert.equal(hasThreadJumpTarget("reply-id"), true);
    assert.equal(hasThreadJumpTarget(null), false);
  });

  it("disables bottom-following before aligning a linked reply at the top", () => {
    const calls = [];
    const target = {
      scrollIntoView(options) {
        calls.push({ type: "scroll", options });
      },
    };

    const result = scrollThreadMessageIntoView(target, (stickToBottom) => {
      calls.push({ type: "stick", stickToBottom });
    });

    assert.equal(result, true);
    assert.deepEqual(calls, [
      { type: "stick", stickToBottom: false },
      { type: "scroll", options: { block: "start", behavior: "auto" } },
    ]);
  });
});
