import assert from "node:assert/strict";
import test from "node:test";
import { filterJenkinsChannels } from "./jenkins.js";

const channels = [
  { id: "1", name: "general" },
  { id: "2", name: "builds" },
  { id: "3", name: "frontend-builds" },
];

test.describe("Jenkins channel filtering", () => {
  test("matches channel names case-insensitively", () => {
    assert.deepEqual(filterJenkinsChannels(channels, "BUILD"), [channels[1], channels[2]]);
  });

  test("returns every channel for an empty filter", () => {
    assert.deepEqual(filterJenkinsChannels(channels), channels);
  });

  test("keeps the selected channel visible when it is filtered out", () => {
    assert.deepEqual(filterJenkinsChannels(channels, "front", "1"), [channels[0], channels[2]]);
  });
});
