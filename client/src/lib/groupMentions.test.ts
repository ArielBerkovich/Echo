import assert from "node:assert/strict";
import test from "node:test";
import { displayGroupMentions } from "./groupMentions.js";

test("renders Echo group IDs using the stored historical name", () => {
  const result = displayGroupMentions("Please ask @group.echo.507f1f77bcf86cd799439011", [{
    provider: "echo", id: "507f1f77bcf86cd799439011", name: "Frontend", memberCount: 1,
  }]);
  assert.equal(result, "Please ask @Frontend");
});

test("keeps old provider-qualified mentions readable", () => {
  assert.equal(displayGroupMentions("@group.rhsso.legacy-id", [{ provider: "rhsso", id: "legacy-id", name: "Legacy" }]), "@Legacy");
});
