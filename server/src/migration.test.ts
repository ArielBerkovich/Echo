import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sourceEligible } from "./migration.js";

describe("sourceEligible", () => {
  it("rejects the admin account even when its role flag is missing", () => {
    assert.equal(sourceEligible({
      username: "admin",
      authOrigin: "local",
      isAdmin: false,
      migratedAt: null,
      mustResetPassword: false,
    }), false);
  });

  it("allows an ordinary eligible local account", () => {
    assert.equal(sourceEligible({
      username: "alice",
      authOrigin: "local",
      isAdmin: false,
      migratedAt: null,
      mustResetPassword: false,
    }), true);
  });
});
