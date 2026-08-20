import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentRoute, parseWorkspacePath, workspacePath } from "./workspaceRoutes.js";

describe("workspace routes", () => {
  it("builds stable paths for workspace views and conversations", () => {
    assert.equal(workspacePath({ view: "activity" }), "/activity");
    assert.equal(workspacePath({ view: "settings" }), "/settings/account");
    assert.equal(workspacePath({ view: "home", convId: "id-1", convName: "channel 1", convType: "public" }), "/channels/channel%201");
    assert.equal(workspacePath({ view: "dms", convId: "id-2", convName: "alice", convType: "dm" }), "/dms/alice");
    assert.equal(workspacePath({ view: "home", convId: "id-2", convName: "alice", convType: "dm" }), "/home/dms/alice");
    assert.equal(workspacePath({ view: "home", convId: "legacy-id", convType: "public" }), "/channels/legacy-id");
    assert.equal(workspacePath({ view: "home", convId: "abc", convType: "public", messageId: "507f1f77bcf86cd799439011" }), "/channels/abc?message=507f1f77bcf86cd799439011");
    assert.equal(workspacePath({ view: "dms", convId: "id-2", convName: "alice", convType: "dm", messageId: "507f1f77bcf86cd799439011" }), "/dms/alice?message=507f1f77bcf86cd799439011");
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
    assert.equal(parseWorkspacePath("/search", "?q=release%20notes").searchQuery, "release notes");
  });

  it("treats settings as a first-class workspace view", () => {
    assert.deepEqual(
      currentRoute({ pathname: "/settings", search: "", state: { workspacePath: "/dms/direct-1" } }),
      { overlay: null, view: "settings", settingsTab: "account", convId: null, convType: null, searchQuery: null }
    );
  });
});
