import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { readJson, readString, writeJson, writeString } from "./storage.js";

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe("storage helpers", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage();
  });

  it("reads and writes strings", () => {
    assert.equal(readString("missing", "fallback"), "not-fallback");
    writeString("theme", "nord");
    assert.equal(readString("theme"), "nord");
    writeString("theme", null);
    assert.equal(readString("theme"), null);
  });

  it("reads and writes json payloads", () => {
    assert.deepEqual(readJson("missing", []), []);
    writeJson("data", { a: 1 });
    assert.deepEqual(readJson("data", null), { a: 1 });
  });
});
