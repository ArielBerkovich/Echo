import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "./app.js";
import { compactChannel, compactMessage } from "./mcp.js";

describe("MCP response shaping", () => {
  it("does not include channel membership rosters in compact responses", () => {
    const compact = compactChannel({
      id: "channel-id",
      name: "general",
      type: "public",
      topic: "topic",
      description: "description",
      memberCount: 5000,
      members: Array.from({ length: 5000 }, (_, index) => `user-${index}`),
      createdBy: "owner-id",
      managers: ["owner-id"],
      readOnly: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      isArchived: false,
      external: null,
    });

    assert.equal(compact.memberCount, 5000);
    assert.equal("members" in compact, false);
    assert.equal("managers" in compact, false);
  });

  it("keeps small DM membership while omitting default message fields", () => {
    const channel = compactChannel({ id: "dm-id", name: "dm", type: "dm", members: ["a", "b"], memberCount: 2 });
    const message = compactMessage({
      id: "message-id",
      channelId: "dm-id",
      body: "hello",
      createdAt: "2026-01-01T00:00:00.000Z",
      editedAt: null,
      kind: "user",
      parentId: null,
      broadcastToChannel: false,
      attachments: [],
      reactions: [],
      author: { id: "a", displayName: "Alice" },
    });

    assert.deepEqual(channel.members, ["a", "b"]);
    assert.deepEqual(message, {
      id: "message-id",
      channelId: "dm-id",
      body: "hello",
      createdAt: "2026-01-01T00:00:00.000Z",
      author: { id: "a", displayName: "Alice" },
    });
  });
});

describe("MCP endpoint authentication", () => {
  let server;
  let origin;

  before(async () => {
    server = http.createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("rejects MCP requests without an Echo Bearer token", async () => {
    const response = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Missing authentication token" });
  });
});
