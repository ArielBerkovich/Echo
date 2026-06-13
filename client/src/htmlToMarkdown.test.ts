import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { htmlToMarkdown } from "./htmlToMarkdown.js";

describe("htmlToMarkdown", () => {
  it("handles empty input", () => {
    assert.equal(htmlToMarkdown(), "");
  });

  it("converts common rich-text markup to markdown", () => {
    assert.equal(htmlToMarkdown("<h2>Hello</h2><p><strong>Bold</strong> and <em>soft</em></p>"), "## Hello\n\n**Bold** and _soft_");
  });

  it("uses app markdown conventions for lists, code blocks, and strikethrough", () => {
    const html = "<ul><li>one</li><li>two</li></ul><pre><code>const x = 1;</code></pre><p><s>old</s></p>";

    assert.equal(htmlToMarkdown(html), "-   one\n-   two\n\n```\nconst x = 1;\n```\n\n~~old~~");
  });

  it("keeps code block line breaks when the composer uses br tags", () => {
    const html = "<pre><code>line one<br>line two</code></pre>";

    assert.equal(htmlToMarkdown(html), "```\nline one\nline two\n```");
  });

  it("strips zero-width caret anchors", () => {
    assert.equal(htmlToMarkdown("<p>he\u200bllo</p>"), "hello");
  });
});
