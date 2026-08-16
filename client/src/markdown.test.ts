import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatEchoDateTime } from "./markdown.js";

describe("Echo datetime tokens", () => {
  it("formats valid ISO timestamps in the browser locale", () => {
    const formatted = formatEchoDateTime("2026-08-16T05:27:31Z");
    assert.equal(typeof formatted, "string");
    assert.ok(formatted.length > 0);
  });

  it("rejects invalid or non-ISO datetime values", () => {
    assert.equal(formatEchoDateTime("not-a-date"), null);
    assert.equal(formatEchoDateTime("2026-08-16 05:27:31"), null);
    assert.equal(formatEchoDateTime("2026-02-30T05:27:31Z"), null);
  });
});
