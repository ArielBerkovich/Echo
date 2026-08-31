import assert from "node:assert/strict";
import test from "node:test";
import { appendReplyParticipant, replyParticipantNames, visibleReplyParticipants } from "./replyParticipants.js";

test("keeps reply participants unique and capped at two", () => {
  assert.deepEqual(visibleReplyParticipants(["alice", "bob", "alice", "carol"]), ["alice", "bob"]);
  assert.deepEqual(appendReplyParticipant(["alice", "bob"], "carol"), ["bob", "carol"]);
});

test("moves an existing replier to the most recent position", () => {
  assert.deepEqual(appendReplyParticipant(["alice", "bob"], "alice"), ["bob", "alice"]);
});

test("formats participant names for an accessible thread label", () => {
  const users = new Map([
    ["alice", { displayName: "Alice" }],
    ["bob", { displayName: "Bob" }],
    ["carol", { displayName: "Carol" }],
  ]);
  assert.equal(replyParticipantNames(["alice"], users), "Alice");
  assert.equal(replyParticipantNames(["alice", "bob"], users), "Alice and Bob");
  assert.equal(replyParticipantNames(["alice", "bob", "carol"], users), "Alice, Bob, and others");
  assert.equal(replyParticipantNames(["unknown"], users), "");
});
