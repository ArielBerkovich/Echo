import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentRoute, isEchoMessageLink, parseWorkspacePath, workspacePath } from "./workspaceRoutes.js";

describe("workspace routes", () => {
  it("builds stable paths for workspace views and conversations", () => {
    assert.equal(workspacePath({ view: "activity" }), "/activity");
    assert.equal(workspacePath({ view: "settings" }), "/settings/account");
    assert.equal(workspacePath({ view: "home", convId: "id-1", convName: "channel 1", convType: "public" }), "/channels/id-1");
    assert.equal(workspacePath({ view: "dms", convId: "id-2", convName: "alice", convType: "dm" }), "/dms/id-2");
    assert.equal(workspacePath({ view: "home", convId: "id-2", convName: "alice", convType: "dm" }), "/home/dms/id-2");
    assert.equal(workspacePath({ view: "dms", convName: "Alice Test, Bob Builder", convType: "dm" }), "/dms/Alice%20Test%2C%20Bob%20Builder");
    assert.equal(workspacePath({ view: "home", convId: "legacy-id", convType: "public" }), "/channels/legacy-id");
    assert.equal(workspacePath({ view: "home", convId: "abc", convType: "public", messageId: "507f1f77bcf86cd799439011" }), "/channels/abc?message=507f1f77bcf86cd799439011");
    assert.equal(workspacePath({ view: "dms", convId: "id-2", convName: "alice", convType: "dm", messageId: "507f1f77bcf86cd799439011" }), "/dms/id-2?message=507f1f77bcf86cd799439011");
    assert.equal(
      workspacePath({ view: "home", convId: "channel-id", convType: "public", messageId: "reply-id", threadId: "root-id" }),
      "/channels/channel-id?message=reply-id&thread=root-id"
    );
    assert.equal(
      workspacePath({ view: "dms", convId: "dm-id", convType: "dm", messageId: "message-id", threadId: "root-id" }),
      "/dms/dm-id?message=message-id&thread=root-id"
    );
    assert.equal(workspacePath({ searchQuery: "from:alice deployment" }), "/search?q=from%3Aalice%20deployment");
  });

  it("parses view, conversation, and search routes", () => {
    assert.deepEqual(parseWorkspacePath("/saved"), {
      overlay: null, view: "saved", convId: null, convType: null, searchQuery: null,
    });
    assert.deepEqual(parseWorkspacePath("/channels/abc"), {
      overlay: null, view: "home", convId: "abc", convType: "channel", searchQuery: null,
    });
    assert.equal(parseWorkspacePath("/channels/abc", "?message=507f1f77bcf86cd799439011").messageId, "507f1f77bcf86cd799439011");
    assert.deepEqual(
      parseWorkspacePath("/channels/channel-id", "?message=reply-id&thread=root-id"),
      {
        overlay: null,
        view: "home",
        convId: "channel-id",
        convType: "channel",
        messageId: "reply-id",
        threadId: "root-id",
        searchQuery: null,
      }
    );
    assert.equal(parseWorkspacePath("/dms/dm-id", "?message=message-id&thread=root-id").threadId, "root-id");
    assert.deepEqual(parseWorkspacePath("/home/dms/dm-id"), {
      overlay: null, view: "home", convId: "dm-id", convType: "dm", searchQuery: null,
    });
    assert.equal(parseWorkspacePath("/search", "?q=release%20notes").searchQuery, "release notes");
  });

  it("treats settings as a first-class workspace view", () => {
    assert.deepEqual(
      currentRoute({ pathname: "/settings", search: "", state: { workspacePath: "/dms/direct-1" } }),
      { overlay: null, view: "settings", settingsTab: "account", convId: null, convType: null, searchQuery: null }
    );
    assert.equal(parseWorkspacePath("/settings/shortcuts").settingsTab, "shortcuts");
    assert.equal(workspacePath({ view: "settings", settingsTab: "webhooks" }), "/settings/webhooks");
    assert.equal(parseWorkspacePath("/settings/webhooks").settingsTab, "webhooks");
  });

  it("recognizes only same-origin Echo message links", () => {
    assert.equal(isEchoMessageLink("/channels/channel-id?message=message-id", "https://echo.test"), true);
    assert.equal(isEchoMessageLink("https://echo.test/dms/dm-id?message=message-id", "https://echo.test"), true);
    assert.equal(isEchoMessageLink("https://example.com/channels/channel-id?message=message-id", "https://echo.test"), false);
    assert.equal(isEchoMessageLink("/channels/channel-id", "https://echo.test"), false);
  });
});
