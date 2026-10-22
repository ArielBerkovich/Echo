import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidObjectId, validObjectId } from "./objectId.js";

test("ObjectId validation accepts only 24-character hexadecimal strings", () => {
  assert.equal(isValidObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidObjectId("5"), false);
  assert.equal(isValidObjectId(5), false);
  assert.equal(isValidObjectId("507f1f77bcf86cd79943901g"), false);
  assert.equal(validObjectId("5"), null);
});
