import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { User } from "./User.js";

describe("User.toPublicJSON", () => {
  it("serializes public user fields and hides sensitive data", () => {
    const user = new User({
      username: "alice",
      displayName: "Alice",
      passwordHash: "hash",
      avatarKey: "avatar.png",
      isAdmin: true,
      mustResetPassword: true,
      onboarded: true,
    });

    const json = user.toPublicJSON();

    assert.deepEqual(Object.keys(json).sort(), [
      "avatarUrl",
      "displayName",
      "id",
      "isAdmin",
      "mustResetPassword",
      "onboarded",
      "username",
    ]);
    assert.equal(json.username, "alice");
    assert.equal(json.avatarUrl, "/api/files/avatar.png");
    assert.equal(json.passwordHash, undefined);
  });

  it("uses null avatar URLs and boolean defaults", () => {
    const user = new User({ username: "bob", displayName: "Bob", passwordHash: "hash" });
    const json = user.toPublicJSON();

    assert.equal(json.avatarUrl, null);
    assert.equal(json.isAdmin, false);
    assert.equal(json.mustResetPassword, false);
    assert.equal(json.onboarded, false);
  });
});
