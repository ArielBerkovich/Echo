import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCardMarkup } from "./lib/cards.js";

describe("generic card markup", () => {
  it("parses a card with an eyebrow, title, description, attributes, and link", () => {
    const result = parseCardMarkup(`Before\n<card eyebrow="Work item 42" url="https://example.com/42"><title>Fix login</title><description>A short summary.</description><attribute label="Status">Active</attribute><attribute label="Owner">Ariel</attribute></card>`);
    assert.equal(result.before, "Before");
    assert.deepEqual(result.card, { type: "card", eyebrow: "Work item 42", title: "Fix login", description: "A short summary.", attributes: [{ label: "Status", value: "Active" }, { label: "Owner", value: "Ariel" }], url: "https://example.com/42" });
  });

  it("requires a title and safe HTTP(S) link", () => {
    assert.equal(parseCardMarkup('<card url="javascript:alert(1)"><title>Unsafe</title></card>'), null);
    assert.equal(parseCardMarkup('<card url="https://example.com"></card>'), null);
  });

  it("marks username attributes as people", () => {
    const result = parseCardMarkup('<card url="https://example.com"><title>Review</title><attribute label="Assignee" type="user">alice</attribute></card>');
    assert.deepEqual(result.card.attributes, [{ label: "Assignee", value: "alice", type: "user" }]);
  });

  it("keeps an optional card color", () => {
    const result = parseCardMarkup('<card color="purple" title-color="#16a34a" timestamp="2026-09-10T10:15:00Z" url="https://example.com"><title>Release</title></card>');
    assert.equal(result.card.color, "purple");
    assert.equal(result.card.titleColor, "#16a34a");
    assert.equal(result.card.timestamp, "2026-09-10T10:15:00Z");
  });
});
