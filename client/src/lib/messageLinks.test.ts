import assert from "node:assert/strict";
import test from "node:test";
import { findMessageLink, messageLinkPath } from "./messageLinks.js";

test("builds a stable channel message permalink", () => {
  assert.equal(
    messageLinkPath({ id: "channel-1", type: "public" }, "507f1f77bcf86cd799439011"),
    "/channels/channel-1?message=507f1f77bcf86cd799439011",
  );
});

test("finds same-origin Echo message links in plain and markdown text", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: "https://echo.example" } };
  try {
    const id = "507f1f77bcf86cd799439011";
    assert.equal(findMessageLink(`See https://echo.example/channels/general?message=${id}.`), id);
    assert.equal(findMessageLink(`[Read this](https://echo.example/dms/abc?message=${id})`), id);
    assert.equal(findMessageLink(`https://other.example/channels/general?message=${id}`), null);
  } finally {
    globalThis.window = previousWindow;
  }
});
