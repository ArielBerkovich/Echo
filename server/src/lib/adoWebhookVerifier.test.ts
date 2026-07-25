import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashAdoToken, createAdoToken } from "../lib/adoWebhookVerifier.js";

describe("adoWebhookVerifier", () => {
  it("hashAdoToken produces a 64-char hex SHA-256 string", () => {
    const hash = hashAdoToken("my-secret-token");
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it("hashAdoToken is deterministic", () => {
    assert.equal(hashAdoToken("abc"), hashAdoToken("abc"));
  });

  it("hashAdoToken produces distinct hashes for distinct inputs", () => {
    assert.notEqual(hashAdoToken("tokenA"), hashAdoToken("tokenB"));
  });

  it("createAdoToken returns a non-empty base64url string of expected length", () => {
    const token = createAdoToken();
    assert.equal(typeof token, "string");
    // 32 bytes → 43 base64url chars (no padding)
    assert.ok(token.length >= 40, `token too short: ${token.length}`);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  it("createAdoToken generates unique tokens", () => {
    const a = createAdoToken();
    const b = createAdoToken();
    assert.notEqual(a, b);
  });
});
