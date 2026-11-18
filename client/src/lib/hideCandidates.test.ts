import assert from "node:assert/strict";
import { test } from "node:test";
import { findHideCandidates } from "./hideCandidates.js";

const person = (username, extra = {}) => ({ id: username, username, displayName: username, ...extra });
test("matches the exact base after removing one final 1 or 2", () => {
  const users = ["programmer1", "programmer11", "programmer12", "programmer13", "other2", "prefix", "prefix1", "prefix2", "prefix21"].map((username) => person(username));
  assert.deepEqual(findHideCandidates(users, "admin").duplicates.map((user) => user.username), ["programmer11", "programmer12", "prefix1", "prefix2", "prefix21"]);
});
test("includes archived people once and excludes hidden, admin, self and system accounts", () => {
  const users = [person("base"), person("base1", { deprecated: true }), person("archived", { deprecated: true }), person("hidden", { hidden: true, deprecated: true }), person("admin", { isAdmin: true, deprecated: true }), person("self", { deprecated: true }), person("system", { deprecated: true })];
  const result = findHideCandidates(users, "self");
  assert.deepEqual(result.archived.map((user) => user.username), ["base1", "archived"]);
  assert.deepEqual(result.duplicates, []);
});
test("allows an already hidden base and ignores similar prefixes without an exact base", () => {
  const users = [person("Base", { hidden: true }), person("base2"), person("bases1"), person("base9")];
  assert.deepEqual(findHideCandidates(users, "admin").duplicates.map((user) => user.username), ["base2"]);
});
