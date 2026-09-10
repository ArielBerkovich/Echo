import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardError, sanitizeCard } from "./deliver.js";

describe("message card validation", () => {
  it("normalizes a complete card and user attributes", () => {
    assert.deepEqual(sanitizeCard({
      eyebrow: " Build #1842 ",
      title: " Production deployment ",
      description: "Finished successfully",
      url: "https://ci.example.com/builds/1842",
      color: "GREEN",
      titleColor: "#16A34A",
      timestamp: "2026-09-10T10:15:00Z",
      attributes: [
        { label: "Status", value: "Succeeded" },
        { label: "Owner", value: "alice", type: "person" },
      ],
    }), {
      eyebrow: "Build #1842",
      title: "Production deployment",
      description: "Finished successfully",
      url: "https://ci.example.com/builds/1842",
      color: "green",
      titleColor: "#16a34a",
      timestamp: "2026-09-10T10:15:00.000Z",
      attributes: [
        { label: "Status", value: "Succeeded", type: "text" },
        { label: "Owner", value: "alice", type: "user" },
      ],
    });
  });

  it("rejects unsafe links, invalid colors, and excess attributes", () => {
    assert.equal(cardError({ title: "Unsafe", url: "javascript:alert(1)" }), "a card needs a title, a valid HTTP(S) URL, and valid colors");
    assert.equal(cardError({ title: "Bad color", url: "https://example.com", color: "transparent" }), "a card needs a title, a valid HTTP(S) URL, and valid colors");
    assert.equal(cardError({ title: "Local time", url: "https://example.com", timestamp: "2026-09-10T13:15:00+03:00" }), "card timestamp must be an ISO 8601 Zulu time ending in Z");
    assert.equal(cardError({ title: "Large", url: "https://example.com", attributes: Array.from({ length: 13 }, (_, i) => ({ label: "Field", value: String(i) })) }), "a card can have up to 12 attributes");
  });
});
