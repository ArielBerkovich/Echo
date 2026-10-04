import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messagePermission, normalizeMessageContent } from "./messagePolicyService.js";

const userId = "user-id";

describe("message policy service", () => {
  it("distinguishes participation and read-only posting permissions", () => {
    const privateChannel = { type: "private", members: ["other-id"], readOnly: false, managers: [] };
    assert.equal(messagePermission(privateChannel, userId), "join");

    const readOnlyChannel = { type: "public", members: [userId], readOnly: true, managers: [] };
    assert.equal(messagePermission(readOnlyChannel, userId), "manager");
    assert.equal(messagePermission(readOnlyChannel, userId, { requirePost: false }), null);
  });

  it("normalizes the shared message content shape", () => {
    const content = normalizeMessageContent({
      body: "  hello  ",
      attachments: [{ key: "file.txt", name: "file.txt" }],
    });
    assert.equal(content.body, "hello");
    assert.equal(content.attachments.length, 1);
    assert.equal(content.survey, null);
    assert.equal(content.retro, null);
    assert.equal(content.card, null);
  });
});
