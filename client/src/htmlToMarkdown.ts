import TurndownService from "turndown";

// Converts the WYSIWYG editor's HTML into the Markdown we store and re-render.
const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
});

// Turndown core has no strikethrough rule; messages use ~~text~~.
td.addRule("strikethrough", {
  filter: ["s", "del", "strike"],
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html) {
  // Strip zero-width spaces (used as caret anchors inside empty code spans).
  return td.turndown(html || "").replace(/​/g, "").trim();
}
