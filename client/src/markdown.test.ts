import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Marked } from "marked";

import { formatEchoDateTime, preserveMarkdownBlankLines, protectChannelTags } from "./markdown.js";

describe("channel tags", () => {
  it("protects a channel tag at the start of a message from heading parsing", () => {
    assert.equal(
      protectChannelTags("#team-leaders-forum", new Set(["team-leaders-forum"])),
      '<span class="channel-tag" data-channel-tag="team-leaders-forum">#team-leaders-forum</span>'
    );
  });

  it("does not rewrite unknown tags or fenced code", () => {
    assert.equal(
      protectChannelTags("#missing\n```\n#team-leaders-forum\n```", new Set(["team-leaders-forum"])),
      "#missing\n```\n#team-leaders-forum\n```"
    );
  });
});

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

describe("preserveMarkdownBlankLines", () => {
  it("keeps consecutive blank lines as explicit empty paragraphs", () => {
    const renderedSource = preserveMarkdownBlankLines("first\n\n\n\nlast");
    assert.match(renderedSource, /first\n\n<p><br><\/p>\n\n<p><br><\/p>\n\nlast/);

    const html = new Marked({ breaks: true, gfm: true }).parse(renderedSource);
    assert.equal((html.match(/<p>/g) || []).length, 4);
  });

  it("preserves blank lines produced by the rich-text composer", () => {
    const composerMarkdown = "first  \n  \n  \n  \nlast";
    const renderedSource = preserveMarkdownBlankLines(composerMarkdown);
    assert.match(renderedSource, /<p><br><\/p>/g);
  });

  it("does not rewrite blank lines inside fenced code", () => {
    assert.equal(
      preserveMarkdownBlankLines("```\nfirst\n\n\nlast\n```"),
      "```\nfirst\n\n\nlast\n```"
    );
  });
});
