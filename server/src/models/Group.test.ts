import assert from "node:assert/strict";
import test from "node:test";
import { Group, GroupChannel, GroupMembership } from "./Group.js";

test("Group models enforce stable ownership and association indexes", () => {
  const groupIndexes = Group.schema.indexes();
  const membershipIndexes = GroupMembership.schema.indexes();
  const channelIndexes = GroupChannel.schema.indexes();
  assert.ok(groupIndexes.some(([fields, options]) => fields.handle === 1 && options?.unique));
  assert.ok(membershipIndexes.some(([fields, options]) => fields.group === 1 && fields.user === 1 && options?.unique));
  assert.ok(channelIndexes.some(([fields, options]) => fields.group === 1 && fields.channel === 1 && options?.unique));
  assert.equal(Group.schema.path("owner").options.required, true);
  assert.equal(GroupMembership.schema.path("role").options.default, "member");
});
