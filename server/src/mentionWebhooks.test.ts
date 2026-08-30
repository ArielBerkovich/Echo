import assert from "node:assert/strict";
import test from "node:test";
import { mentionWebhookSigningSecret, webhookRecipients } from "./mentionWebhooks.js";

test("derives a stable, user-specific signing secret for mention webhooks", () => {
  const first = mentionWebhookSigningSecret("507f1f77bcf86cd799439011");
  assert.equal(first, mentionWebhookSigningSecret("507f1f77bcf86cd799439011"));
  assert.notEqual(first, mentionWebhookSigningSecret("507f1f77bcf86cd799439012"));
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

test("targets mentioned users and direct-message recipients without including the sender", () => {
  assert.deepEqual(
    [...webhookRecipients({ mentionedUserIds: ["alice", "sender", "alice"] }, { type: "public" }, "sender")],
    [["alice", "user_mentioned"]]
  );
  assert.deepEqual(
    [...webhookRecipients({ mentionedUserIds: ["alice"] }, { type: "dm", members: ["sender", "alice", "bob"] }, "sender")],
    [["alice", "direct_message"], ["bob", "direct_message"]]
  );
});
