import { Marked } from "marked";
import createDOMPurify from "dompurify";

const pastedMarkdown = new Marked({
  breaks: true,
  gfm: true,
});

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "del", "s", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "span", "h1", "h2", "h3", "hr",
];

const ALLOWED_ATTR = ["class", "href", "title", "target", "rel"];

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
