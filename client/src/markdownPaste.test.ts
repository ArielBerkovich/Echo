import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { htmlToMarkdown } from "./htmlToMarkdown.js";
import { markdownTextToComposerHtml } from "./markdownPaste.js";

describe("markdownTextToComposerHtml", () => {
  it("renders pasted markdown into composer HTML", () => {
    const html = markdownTextToComposerHtml([
      "# Heading 1",
      "",
      "**Bold text**",
      "_Italic text_",
      "~~Strikethrough text~~",
      "`inline code`",
      "",
      "```js",
      "const message = \"formatted via API\";",
      "```",
      "",
      "> Quote line",
      "",
      "- Bullet item",
      "",
      "1. Numbered item",
      "",
      "[Echo link](https://example.com)",
    ].join("\n"));

    assert.match(html, /<h1>Heading 1<\/h1>/);
    assert.match(html, /<strong>Bold text<\/strong>/);
    assert.match(html, /<em>Italic text<\/em>/);
    assert.match(html, /<del>Strikethrough text<\/del>/);
    assert.match(html, /<pre><code class="language-js">/);
    assert.match(html, /<blockquote>/);
    assert.match(html, /<ul>/);
    assert.match(html, /<ol>/);
    assert.match(html, /<a href="https:\/\/example.com">Echo link<\/a>/);
  });

  it("round-trips pasted markdown through the composer send conversion", () => {
    const html = markdownTextToComposerHtml([
      "API formatting test",
      "",
      "# Heading 1",
      "",
      "**Bold text**",
      "_Italic text_",
      "~~Strikethrough text~~",
      "",
      "```js",
      "const message = \"formatted via API\";",
      "```",
      "",
      "- Bullet item",
      "1. Numbered item",
    ].join("\n"));

    const markdown = htmlToMarkdown(html);

    assert.match(markdown, /# Heading 1/);
    assert.match(markdown, /\*\*Bold text\*\*/);
    assert.match(markdown, /_Italic text_/);
    assert.match(markdown, /~~Strikethrough text~~/);
    assert.match(markdown, /```js\nconst message = "formatted via API";\n```/);
    assert.match(markdown, /- {3}Bullet item/);
    assert.match(markdown, /1\. {2}Numbered item/);
  });
});
