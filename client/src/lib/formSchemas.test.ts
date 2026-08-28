import assert from "node:assert/strict";
import test from "node:test";
import { channelSchema, normalizeChannelNameInput } from "./formSchemas.ts";

test("channel input lowercases names and turns spaces into dashes", () => {
  assert.equal(normalizeChannelNameInput("ProjectName"), "projectname");
  assert.equal(normalizeChannelNameInput("Release Notes"), "release-notes");
});

test("new channel names reject underscores and repeated dashes", () => {
  const underscore = channelSchema.safeParse({ name: "legacy_name", type: "public" });
  const repeatedDash = channelSchema.safeParse({ name: "release--notes", type: "public" });
  assert.equal(underscore.success, false);
  assert.equal(repeatedDash.success, false);
  assert.equal(repeatedDash.error.issues[0].message, "Channel names cannot contain underscores, consecutive dashes, or start/end with a dash");
  assert.equal(channelSchema.safeParse({ name: "release-notes", type: "public" }).success, true);
});
