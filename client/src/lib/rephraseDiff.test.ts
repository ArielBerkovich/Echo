import { test } from "node:test";
import assert from "node:assert/strict";
import { rephraseDiff } from "./rephraseDiff.js";

test("highlights removed and added words while preserving whitespace and text", () => {
  const result = rephraseDiff("Please send it tomorrow.\nThanks!", "Please share it today.\nThanks!");
  assert.equal(result.before.map(part => part.text).join(""), "Please send it tomorrow.\nThanks!");
  assert.equal(result.after.map(part => part.text).join(""), "Please share it today.\nThanks!");
  assert.match(result.before.filter(part => part.changed).map(part => part.text).join(""), /send/);
  assert.match(result.after.filter(part => part.changed).map(part => part.text).join(""), /share/);
});

test("leaves identical multilingual text unmarked", () => {
  const result = rephraseDiff("שלום עולם!", "שלום עולם!");
  assert.ok(result.before.every(part => !part.changed));
  assert.ok(result.after.every(part => !part.changed));
});
