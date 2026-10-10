import { Marked } from "marked";
import createDOMPurify from "dompurify";
import { escapeHtml } from "./lib/syntaxHighlight.js";

const pastedMarkdown = new Marked({
  breaks: true,
  gfm: true,
});
pastedMarkdown.use({
  // A pasted Markdown string is message text, not trusted HTML. Keep
  // tag-shaped text such as `<name>` as literal text in the composer.
  renderer: {
    html(token) {
      const raw = typeof token === "string" ? token : token.text;
      return escapeHtml(raw).replace(/&lt;(\/?)u&gt;/gi, "<$1u>");
    },
    code(codeArg, infostring) {
      const token = codeArg && typeof codeArg === "object" ? codeArg : null;
      const text = token ? token.text : codeArg;
      const language = (token ? token.lang : infostring || "").trim().split(/\s+/)[0];
      if (language.toLowerCase() === "echo-markdown") {
        return `<pre data-markdown-section="true"><code>${escapeHtml(text ?? "")}</code></pre>`;
      }
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      return `<pre><code${className}>${escapeHtml(text ?? "")}</code></pre>\n`;
    },
  },
});

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "del", "s", "u", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "span", "h1", "h2", "h3", "hr",
];

const ALLOWED_ATTR = ["class", "href", "title", "target", "rel", "data-markdown-section"];

export function markdownTextToComposerHtml(text) {
  const html = pastedMarkdown.parse(text || "");
  if (typeof window === "undefined") {
    const paragraph = html.match(/^<p>([\s\S]*)<\/p>\n?$/);
    return paragraph ? paragraph[1] : html;
  }

  const purifier = createDOMPurify(window);
  const sanitized = purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });

  // Marked wraps even a plain one-line paste in <p>. Inside the contenteditable
  // composer that block wrapper creates an extra visual line compared with
  // typing the same message directly. Keep inline-only pastes inline, while
  // preserving paragraphs when the paste actually contains multiple blocks.
  const template = document.createElement("template");
  template.innerHTML = sanitized.trim();
  const elements = [...template.content.children];
  if (elements.length === 1 && elements[0].tagName === "P") {
    return elements[0].innerHTML;
  }
  return sanitized;
}
