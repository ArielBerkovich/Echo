import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { User } from "./User.js";

describe("User.toPublicJSON", () => {
  it("exposes built-in avatar overrides", () => {
    const user = new User({ username: "azure-bot", displayName: "azure bot", passwordHash: "x", avatarUrlOverride: "/azure-devops-icon.svg" });
    assert.equal(user.toPublicJSON().avatarUrl, "/azure-devops-icon.svg");
  });
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
      "canChangePassword",
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
    assert.equal(json.canChangePassword, true);
  });

  it("uses null avatar URLs and boolean defaults", () => {
    const user = new User({ username: "bob", displayName: "Bob", passwordHash: "hash" });
    const json = user.toPublicJSON();

    assert.equal(json.avatarUrl, null);
    assert.equal(json.isAdmin, false);
    assert.equal(json.mustResetPassword, false);
    assert.equal(json.onboarded, false);
    assert.equal(json.canChangePassword, true);
  });

  it("does not expose password changes for SSO identities", () => {
    const user = new User({
      username: "sso-user",
      displayName: "SSO User",
      passwordHash: "placeholder",
      authOrigin: "rhsso",
      rhssoIssuer: "https://sso.example.test/realms/echo",
      rhssoSubject: "subject-1",
    });

    assert.equal(user.toPublicJSON().canChangePassword, false);
  });

  it("defaults channel stars independently from VIP users", () => {
    const user = new User({ username: "bob", displayName: "Bob", passwordHash: "hash" });

    assert.deepEqual(user.starredChannels, []);
    assert.deepEqual(user.vips, []);
  });
});
