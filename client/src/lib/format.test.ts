import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSize } from "./format.js";

describe("formatSize", () => {
  it("returns an empty string for absent values", () => {
    assert.equal(formatSize(null), "");
    assert.equal(formatSize(undefined), "");
  });

  it("formats bytes, kilobytes, and megabytes", () => {
    assert.equal(formatSize(0), "0 B");
    assert.equal(formatSize(24), "24 B");
    assert.equal(formatSize(1024), "1 KB");
    assert.equal(formatSize(1536), "2 KB");
    assert.equal(formatSize(1024 * 1024), "1.0 MB");
    assert.equal(formatSize(1024 * 1024 * 1.4), "1.4 MB");
  });
});
