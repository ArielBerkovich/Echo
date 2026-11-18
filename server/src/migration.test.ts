import assert from "node:assert/strict";
import { describe, it } from "node:test";

import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { User } from "./models/User.js";
import { UserAlias } from "./models/UserAlias.js";
import { MigrationIntent } from "./models/MigrationIntent.js";
import { completeRhssoSignup, createRhssoCreationIntent, sourceEligible } from "./migration.js";

describe("RHSSO username identity", () => {
  it("rejects another signup intent for an existing username with a different subject", async (t) => {
    t.mock.method(User, "exists", async (query) => {
      assert.equal(query.username, "my_user");
      assert.equal(query.rhssoSubject, undefined);
      return { _id: "existing-user" };
    });
    await assert.rejects(createRhssoCreationIntent({
      username: "my_user", issuer: "new-issuer", subject: "recreated-subject",
    }), /already belongs/);
  });

  it("rejects a reserved username instead of creating a suffixed account", async (t) => {
    const intentId = new mongoose.Types.ObjectId();
    const intent = {
      targetType: "rhsso", targetUsername: "my_user", status: "identity_verified",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const queryResult = (value) => ({ session: async () => value });
    t.mock.method(mongoose, "startSession", async () => ({
      withTransaction: async (callback) => callback(), endSession: async () => {},
    }));
    t.mock.method(MigrationIntent, "findById", () => queryResult(intent));
    t.mock.method(User, "findOne", () => queryResult(null));
    const checkedNames = [];
    t.mock.method(User, "exists", (query) => {
      checkedNames.push(query.username);
      return queryResult({ _id: "local-user" });
    });
    t.mock.method(UserAlias, "exists", () => queryResult(null));
    const create = t.mock.method(User, "create", () => assert.fail("must not create a duplicate"));
    const token = jwt.sign({ kind: "identity-migration", intentId }, config.jwtSecret);
    await assert.rejects(completeRhssoSignup(token), /already taken/);
    assert.deepEqual(checkedNames, ["my_user"]);
    assert.equal(create.mock.callCount(), 0);
  });
});

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
