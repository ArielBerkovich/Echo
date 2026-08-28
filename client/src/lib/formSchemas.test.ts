import assert from "node:assert/strict";
import test from "node:test";
import { channelSchema, normalizeChannelNameInput } from "./formSchemas.ts";

test("channel input lowercases names and turns spaces into dashes", () => {
  assert.equal(normalizeChannelNameInput("ProjectName"), "projectname");
  assert.equal(normalizeChannelNameInput("Release Notes"), "release-notes");
});

test("new channel names reject underscores and repeated dashes", () => {
  assert.equal(channelSchema.safeParse({ name: "legacy_name", type: "public" }).success, false);
  assert.equal(channelSchema.safeParse({ name: "release--notes", type: "public" }).success, false);
  assert.equal(channelSchema.safeParse({ name: "release-notes", type: "public" }).success, true);
});
