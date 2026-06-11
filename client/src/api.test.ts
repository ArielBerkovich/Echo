import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { api, getToken, setToken } from "./api.js";

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

describe("api token helpers", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage();
  });

  it("stores, reads, and clears the auth token", () => {
    assert.equal(getToken(), null);
    setToken("abc");
    assert.equal(getToken(), "abc");
    setToken(null);
    assert.equal(getToken(), null);
  });
});

describe("api request helpers", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage();
  });

  it("sends JSON requests with bearer tokens", async () => {
    setToken("secret");
    let call;
    globalThis.fetch = async (...args) => {
      call = args;
      return { ok: true, json: async () => ({ ok: true }) };
    };

    assert.deepEqual(await api.createChannel("general", "private"), { ok: true });
    assert.equal(call[0], "/api/channels");
    assert.equal(call[1].method, "POST");
    assert.equal(call[1].headers.Authorization, "Bearer secret");
    assert.equal(call[1].body, JSON.stringify({ name: "general", type: "private" }));
  });

  it("omits empty request bodies", async () => {
    let call;
    globalThis.fetch = async (...args) => {
      call = args;
      return { ok: true, json: async () => ({ channels: [] }) };
    };

    await api.listChannels();
    assert.equal(call[0], "/api/channels");
    assert.equal(call[1].method, "GET");
    assert.equal(call[1].body, undefined);
  });

  it("encodes query-string values", async () => {
    let path;
    globalThis.fetch = async (...args) => {
      path = args[0];
      return { ok: true, json: async () => ({ results: [] }) };
    };

    await api.searchMessages("hello #general", 2, "relevance");
    assert.equal(path, "/api/search/messages?q=hello%20%23general&page=2&sort=relevance");
  });

  it("throws server-provided error messages", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "nope" }),
    });

    await assert.rejects(api.me(), /nope/);
  });

  it("uploads multipart files without setting a content-type header", async () => {
    setToken("secret");
    let call;
    globalThis.fetch = async (...args) => {
      call = args;
      return { ok: true, json: async () => ({ attachments: [] }) };
    };

    await api.uploadFiles([{ name: "a.txt" }]);
    assert.equal(call[0], "/api/uploads");
    assert.equal(call[1].method, "POST");
    assert.equal(call[1].headers.Authorization, "Bearer secret");
    assert.equal(call[1].headers["Content-Type"], undefined);
    assert.ok(call[1].body instanceof FormData);
  });
});
