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
  if (typeof window === "undefined") return html;

  const purifier = createDOMPurify(window);
  return purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}
