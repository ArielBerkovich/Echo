import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.JWT_SECRET ||= "test-secret";

const { signApiToken, signToken, verifyToken } = await import("./auth.js");

const user = {
  _id: { toString: () => "user-1" },
  tokenVersion: 3,
};

describe("auth tokens", () => {
  it("signs and verifies session tokens", () => {
    const decoded = verifyToken(signToken(user));

    assert.equal(decoded.sub, "user-1");
    assert.equal(decoded.tv, 3);
    assert.equal(decoded.kind, undefined);
    assert.ok(decoded.exp > decoded.iat);
  });

  it("signs and verifies long-lived API tokens", () => {
    const decoded = verifyToken(signApiToken(user));

    assert.equal(decoded.sub, "user-1");
    assert.equal(decoded.tv, 3);
    assert.equal(decoded.kind, "api");
    assert.ok(decoded.exp - decoded.iat > 300 * 24 * 60 * 60);
  });

  it("defaults missing token versions to zero", () => {
    const decoded = verifyToken(signToken({ _id: { toString: () => "user-2" } }));

    assert.equal(decoded.tv, 0);
  });

  it("rejects invalid tokens", () => {
    assert.throws(() => verifyToken("not-a-token"), /jwt malformed/);
  });
});
