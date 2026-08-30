import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldGroupWithPreviousMessage } from "./messageGrouping.js";

const message = (id, authorId, createdAt, kind = "message") => ({
  id,
  kind,
  author: { id: authorId },
  createdAt,
});

describe("message grouping", () => {
  it("groups consecutive messages from the same author in the same minute", () => {
    const first = message("one", "alice", "2026-06-04T09:00:01");
    const second = message("two", "alice", "2026-06-04T09:00:59");

    assert.equal(shouldGroupWithPreviousMessage(first, second), true);
  });

  it("keeps a header when the author, minute, or message kind changes", () => {
    const first = message("one", "alice", "2026-06-04T09:00:01");

    assert.equal(shouldGroupWithPreviousMessage(first, message("two", "bob", "2026-06-04T09:00:30")), false);
    assert.equal(shouldGroupWithPreviousMessage(first, message("two", "alice", "2026-06-04T09:01:00")), false);
    assert.equal(shouldGroupWithPreviousMessage(first, message("two", "alice", "2026-06-04T09:00:30", "system")), false);
  });
});
