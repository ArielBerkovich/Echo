import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nonMemberMentions } from "./mentions.js";

const users = [
  { id: "u1", username: "alice" },
  { id: "u2", username: "Bob" },
  { id: "u3", username: "carol.smith" },
];

describe("nonMemberMentions", () => {
  it("ignores public channels", () => {
    assert.deepEqual(nonMemberMentions({ type: "public", members: [] }, users, "@alice"), []);
  });

  it("returns private-channel mentions for users outside the channel", () => {
    assert.deepEqual(nonMemberMentions({ type: "private", members: ["u1"] }, users, "hi @bob and @carol.smith"), [
      users[1],
      users[2],
    ]);
  });

  it("deduplicates mentions and ignores members, unknown handles, and everyone", () => {
    assert.deepEqual(
      nonMemberMentions({ type: "private", members: ["u1"] }, users, "@alice @bob @Bob @everyone @unknown"),
      [users[1]]
    );
  });

  it("matches mentions at the start of text or after whitespace only", () => {
    assert.deepEqual(nonMemberMentions({ type: "private", members: [] }, users, "email@alice @bob"), [users[1]]);
  });
});
