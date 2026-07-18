import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { usernameCandidate, usernameFromName } from "./usernames.js";

describe("username generation", () => {
  it("converts names into dot-separated handles", () => {
    assert.equal(usernameFromName("Ariel", "Cohen"), "ariel.cohen");
    assert.equal(usernameFromName("Élodie", "O'Neil"), "elodie.o.neil");
  });

  it("adds numeric suffixes without exceeding the handle limit", () => {
    assert.equal(usernameCandidate("ariel.cohen", 1), "ariel.cohen1");
    assert.equal(usernameCandidate("a".repeat(32), 12), `${"a".repeat(30)}12`);
  });
});
