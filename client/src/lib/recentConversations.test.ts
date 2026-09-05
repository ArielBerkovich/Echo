import assert from "node:assert/strict";
import test from "node:test";
import {
  addRecentConversation,
  MAX_RECENT_CONVERSATIONS,
  normalizeRecents,
  recentForConversation,
} from "./recentConversations.js";

test("normalizes and deduplicates recent conversations", () => {
  const entries = [
    null,
    { type: "channel", id: "one", name: "one" },
    { type: "channel", id: "one", name: "duplicate" },
    { type: "unsupported", id: "bad" },
    ...Array.from({ length: 10 }, (_, index) => ({ type: "user", id: `user-${index}` })),
  ];

  const result = normalizeRecents(entries);
  assert.equal(result.length, 11);
  assert.deepEqual(result[0], { type: "channel", id: "one", name: "one" });
});

test("moves an opened conversation to the front", () => {
  const previous = [
    { type: "channel", id: "one", name: "one" },
    { type: "user", id: "person", displayName: "Old name" },
  ];
  const result = addRecentConversation(previous, {
    type: "user",
    id: "person",
    displayName: "Current name",
  });

  assert.deepEqual(result, [
    { type: "user", id: "person", displayName: "Current name" },
    { type: "channel", id: "one", name: "one" },
  ]);
});

test("bounds newly updated recent conversations", () => {
  const previous = Array.from({ length: 10 }, (_, index) => ({
    type: "channel",
    id: `channel-${index}`,
    name: `channel-${index}`,
  }));
  const result = addRecentConversation(previous, { type: "user", id: "person" });

  assert.equal(result.length, MAX_RECENT_CONVERSATIONS);
  assert.deepEqual(result[0], { type: "user", id: "person" });
});

test("creates recent entries for channels, direct messages, and group DMs", () => {
  assert.deepEqual(
    recentForConversation({ id: "channel", type: "public", name: "general" }, "me"),
    { type: "channel", id: "channel", name: "general" }
  );
  assert.deepEqual(
    recentForConversation({
      id: "direct",
      type: "dm",
      participants: [{ id: "other", displayName: "Other", username: "other" }],
    }, "me"),
    { type: "user", id: "other", displayName: "Other", username: "other" }
  );
  assert.deepEqual(
    recentForConversation({
      id: "group",
      type: "dm",
      dmName: "Design group",
      isGroup: true,
      participants: [
        { id: "first", displayName: "First" },
        { id: "second", displayName: "Second" },
      ],
    }, "me"),
    { type: "dm", id: "group", displayName: "Design group" }
  );
});
