import assert from "node:assert/strict";
import { test } from "node:test";
import { Group, GroupMembership } from "./models/Group.js";
import { User } from "./models/User.js";
import { listGroups } from "./groupDirectory.js";

test("listGroups pages group rows and fetches memberships in one batch", async () => {
  const originalGroupFind = Group.find;
  const originalMembershipFind = GroupMembership.find;
  const originalUserFindById = User.findById;
  const group = {
    _id: "group-1",
    owner: "owner",
    toPublicJSON: () => ({ id: "group-1", name: "Alpha" }),
  };
  const member = {
    group: "group-1",
    role: "member",
    user: { _id: "viewer", toPublicJSON: () => ({ id: "viewer", username: "viewer" }) },
  };
  const calls = { groupLimit: null, membershipQueries: 0 };
  Group.find = () => ({
    sort() { return this; },
    skip() { return this; },
    limit(value) { calls.groupLimit = value; return Promise.resolve([group]); },
  });
  GroupMembership.find = () => {
    calls.membershipQueries += 1;
    return { populate() { return this; }, sort() { return Promise.resolve([member]); } };
  };
  User.findById = () => ({ lean: async () => ({ isAdmin: false }) });
  try {
    const result = await listGroups("viewer", { skip: 100, limit: 50 });
    assert.equal(calls.groupLimit, 51);
    assert.equal(calls.membershipQueries, 1);
    assert.equal(result.groups[0].isMember, true);
    assert.deepEqual(result.groups[0].members, [{ id: "viewer", username: "viewer", role: "member" }]);
  } finally {
    Group.find = originalGroupFind;
    GroupMembership.find = originalMembershipFind;
    User.findById = originalUserFindById;
  }
});
