import TurndownService from "turndown";

// Converts the WYSIWYG editor's HTML into the Markdown we store and re-render.
const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
});

function normalizeCodeBlockBreaks(html) {
  return String(html || "").replace(
    /(<pre\b[^>]*>\s*<code\b[^>]*>)([\s\S]*?)(<\/code>\s*<\/pre>)/gi,
    (_, open, inner, close) => `${open}${inner.replace(/<br\s*\/?>/gi, "\n")}${close}`
  );
}

// Turndown core has no strikethrough rule; messages use ~~text~~.
td.addRule("strikethrough", {
  filter: ["s", "del", "strike"],
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html) {
  // Strip zero-width spaces (used as caret anchors inside empty code spans).
  return td.turndown(normalizeCodeBlockBreaks(html)).replace(/​/g, "").trim();
}
