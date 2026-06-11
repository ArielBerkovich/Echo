import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requireAdmin } from "./requireAdmin.js";

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("requireAdmin", () => {
  it("rejects missing users and non-admin users", () => {
    for (const req of [{}, { user: { isAdmin: false } }]) {
      const res = createRes();
      let called = false;

      requireAdmin(req, res, () => (called = true));

      assert.equal(called, false);
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.body, { error: "admin only" });
    }
  });

  it("allows admin users through", () => {
    const res = createRes();
    let called = false;

    requireAdmin({ user: { isAdmin: true } }, res, () => (called = true));

    assert.equal(called, true);
    assert.equal(res.statusCode, null);
    assert.equal(res.body, null);
  });
});
