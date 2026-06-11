import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterChipLabel, parseSearchQuery } from "./searchQuery.js";

describe("parseSearchQuery", () => {
  it("returns plain text with no filters", () => {
    assert.deepEqual(parseSearchQuery("release notes"), {
      text: "release notes",
      filters: [],
    });
  });

  it("extracts in, from, and has filters while preserving remaining text", () => {
    assert.deepEqual(parseSearchQuery("bug bash in:#general from:@Alice has:IMAGE"), {
      text: "bug bash",
      filters: [
        { type: "in", value: "general" },
        { type: "from", value: "Alice" },
        { type: "has", value: "image" },
      ],
    });
  });

  it("handles filter-only queries and trims extra whitespace", () => {
    assert.deepEqual(parseSearchQuery("   in:random   "), {
      text: "",
      filters: [{ type: "in", value: "random" }],
    });
  });

  it("only removes the first token of each supported filter type", () => {
    assert.deepEqual(parseSearchQuery("in:one in:two from:bob from:ann has:file has:link"), {
      text: "in:two  from:ann  has:link",
      filters: [
        { type: "in", value: "one" },
        { type: "from", value: "bob" },
        { type: "has", value: "file" },
      ],
    });
  });
});

describe("filterChipLabel", () => {
  it("formats supported filters for display", () => {
    assert.equal(filterChipLabel({ type: "in", value: "general" }), "in: #general");
    assert.equal(filterChipLabel({ type: "from", value: "@alice" }), "from: @alice");
    assert.equal(filterChipLabel({ type: "has", value: "file" }), "has: file");
  });
});
