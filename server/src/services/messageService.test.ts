import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Message } from "../models/Message.js";
import { sendMessage } from "./messageService.js";

describe("message service", () => {
  it("returns the existing public message for a repeated idempotency key", async () => {
    const existing = { toPublicJSON: () => ({ id: "existing-message", body: "already sent" }) };
    const originalFindOne = Message.findOne;
    let query;
    Message.findOne = (...args) => {
      query = args;
      return { populate: async () => existing };
    };
    try {
      const result = await sendMessage({
        channel: { _id: "channel-id" },
        authorId: "author-id",
        body: "duplicate",
        idempotencyKey: "a".repeat(200),
      });
      assert.deepEqual(result, { message: { id: "existing-message", body: "already sent" }, idempotent: true });
      assert.deepEqual(query[0], {
        channel: "channel-id",
        author: "author-id",
        idempotencyKey: "a".repeat(128),
      });
    } finally {
      Message.findOne = originalFindOne;
    }
  });
});
