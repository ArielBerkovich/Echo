import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePage } from "./page.js";
import { decodePathValue } from "./uri.js";

test("parsePage accepts bounded nonnegative integer pages only", () => {
  assert.equal(parsePage(undefined), 0);
  assert.equal(parsePage("12"), 12);
  for (const invalid of ["-1", "1.5", "1abc", "10001", "9007199254740992", ["2"]]) {
    assert.equal(parsePage(invalid), null);
  }
});

test("decodePathValue reports malformed percent escapes without throwing", () => {
  assert.equal(decodePathValue("room%20one"), "room one");
  assert.equal(decodePathValue("%E0%A4%A"), null);
});
