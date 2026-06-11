import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { passwordProblem } from "./password.js";

describe("passwordProblem", () => {
  it("rejects missing and short passwords", () => {
    assert.equal(passwordProblem(null), "Password must be at least 8 characters");
    assert.equal(passwordProblem("Aa1"), "Password must be at least 8 characters");
  });

  it("requires lowercase, uppercase, and numeric characters", () => {
    assert.equal(passwordProblem("PASSWORD1"), "Password must include a lowercase letter");
    assert.equal(passwordProblem("password1"), "Password must include an uppercase letter");
    assert.equal(passwordProblem("Password"), "Password must include a number");
  });

  it("accepts valid passwords", () => {
    assert.equal(passwordProblem("Password1"), null);
  });
});
