import assert from "node:assert/strict";
import test from "node:test";
import { mentionWebhookSigningSecret, webhookRecipients } from "./mentionWebhooks.js";
import { validWebhookUrl } from "./routes/mentionWebhooks.js";

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

test("only accepts HTTPS webhook URLs that do not use private literal IP addresses", () => {
  for (const url of [
    "http://hooks.example.test/echo",
    "ftp://hooks.example.test/echo",
    "https://127.0.0.1/echo",
    "https://10.0.0.1/echo",
    "https://172.16.0.1/echo",
    "https://192.168.0.1/echo",
    "https://169.254.169.254/echo",
    "https://[::1]/echo",
    "https://[fc00::1]/echo",
    "https://[::ffff:127.0.0.1]/echo",
  ]) assert.equal(validWebhookUrl(url), false, url);

  assert.equal(validWebhookUrl("https://hooks.example.test/echo"), true);
  assert.equal(validWebhookUrl("https://8.8.8.8/echo"), true);
});
