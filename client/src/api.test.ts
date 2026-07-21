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

  it("sends password-help requests without requiring a session", async () => {
    let call;
    globalThis.fetch = async (...args) => {
      call = args;
      return { ok: true, json: async () => ({ ok: true }) };
    };

    assert.deepEqual(await api.requestPasswordHelp("alice.test"), { ok: true });
    assert.equal(call[0], "/api/auth/forgot-password");
    assert.equal(call[1].method, "POST");
    assert.equal(call[1].headers.Authorization, undefined);
    assert.equal(call[1].body, JSON.stringify({ username: "alice.test" }));
  });

  it("issues an admin password-help request by its server-authored message id", async () => {
    setToken("admin-token");
    let call;
    globalThis.fetch = async (...args) => {
      call = args;
      return { ok: true, json: async () => ({ ok: true }) };
    };

    await api.adminIssuePasswordHelp("message-1");
    assert.equal(call[0], "/api/admin/password-help/message-1/issue");
    assert.equal(call[1].method, "POST");
    assert.equal(call[1].headers.Authorization, "Bearer admin-token");
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

  it("softens authentication errors while preserving server details", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "nope" }),
    });

    await assert.rejects(
      api.me(),
      (error) => error.message === "Your session may have expired. Please sign in again." && error.error === "nope"
    );
  });

  it("does not expose internal server errors to the UI", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Mongo connection details" }),
    });

    await assert.rejects(
      api.login({ username: "a", password: "b" }),
      /We couldn't sign you in right now\. Please try again in a moment\./
    );
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
