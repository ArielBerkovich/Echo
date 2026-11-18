import assert from "node:assert/strict";
import { test } from "node:test";
import { loadUserDirectory } from "./userDirectory.js";

test("loads every bounded page and deduplicates the signed-in user's repeated entry", async () => {
  const calls = [];
  const controller = new AbortController();
  const users = await loadUserDirectory(async (options) => {
    calls.push(options);
    return [
      { users: [{ id: "self", name: "Before" }, { id: "first", name: "First" }], hasMore: true },
      { users: [{ id: "last", name: "Last" }, { id: "self", name: "Current" }], hasMore: false },
    ][options.page];
  }, { signal: controller.signal });
  assert.deepEqual(calls.map(({ page, limit }) => ({ page, limit })), [{ page: 0, limit: 200 }, { page: 1, limit: 200 }]);
  assert.ok(calls.every(({ signal }) => signal === controller.signal));
  assert.deepEqual(users, [{ id: "self", name: "Current" }, { id: "first", name: "First" }, { id: "last", name: "Last" }]);
});

test("rejects a later page failure rather than returning a partial directory", async () => {
  const unavailable = new Error("Directory unavailable");
  await assert.rejects(loadUserDirectory(async ({ page }) => {
    if (page > 0) throw unavailable;
    return { users: [{ id: "first" }], hasMore: true };
  }), (error) => error === unavailable);
});

test("returns an empty completed directory without requesting more pages", async () => {
  let calls = 0;
  assert.deepEqual(await loadUserDirectory(async () => {
    calls++;
    return { users: [], hasMore: false };
  }), []);
  assert.equal(calls, 1);
});
