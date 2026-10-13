import assert from "node:assert/strict";
import test from "node:test";
import { channelSchema, normalizeChannelNameInput } from "./formSchemas.ts";

test("channel input lowercases names and turns spaces into dashes", () => {
  assert.equal(normalizeChannelNameInput("ProjectName"), "projectname");
  assert.equal(normalizeChannelNameInput("Release Notes"), "release-notes");
});

test("new channel names start with a letter and reject underscores and repeated dashes", () => {
  const underscore = channelSchema.safeParse({ name: "legacy_name", type: "public" });
  const repeatedDash = channelSchema.safeParse({ name: "release--notes", type: "public" });
  const numeric = channelSchema.safeParse({ name: "12345", type: "public" });
  assert.equal(underscore.success, false);
  assert.equal(repeatedDash.success, false);
  assert.equal(numeric.success, false);
  assert.equal(numeric.error.issues[0].message, "Channel names must start with a letter and use lowercase letters, numbers, and single dashes");
  assert.equal(channelSchema.safeParse({ name: "release-notes", type: "public" }).success, true);
});
