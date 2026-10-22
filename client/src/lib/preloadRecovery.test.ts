import assert from "node:assert/strict";
import { test } from "node:test";
import { claimPreloadReload, PRELOAD_RELOAD_KEY } from "./preloadRecovery.js";

test("a preload failure can trigger only one reload in a browser session", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  assert.equal(claimPreloadReload(storage), true);
  assert.equal(values.get(PRELOAD_RELOAD_KEY), "1");
  assert.equal(claimPreloadReload(storage), false);
});

test("preload errors keep the browser default when session storage is unavailable", () => {
  assert.equal(claimPreloadReload({
    getItem() { throw new Error("storage disabled"); },
    setItem() { throw new Error("storage disabled"); },
  }), false);
});
