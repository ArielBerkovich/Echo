import assert from "node:assert/strict";
import test from "node:test";
import { whatsNewSince } from "./whatsNew.js";

test("shows release notes after the previous version through the current version", () => {
  assert.deepEqual(whatsNewSince("0.36.0", "0.37.0").map((entry) => entry.version), ["0.37.0"]);
});

test("does not show notes for a first install or invalid versions", () => {
  assert.deepEqual(whatsNewSince("", "0.37.0"), []);
  assert.deepEqual(whatsNewSince("not-a-version", "0.37.0"), []);
});
