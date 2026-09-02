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

// ProseMirror/Tiptap represents list-item text as <li><p>…</p></li>. Treat
// that paragraph as structural so the persisted Markdown stays compatible
// with the previous editor's compact "- item" representation.
td.addRule("listItemParagraph", {
  filter: (node) => node.nodeName === "P" && node.parentNode?.nodeName === "LI",
  replacement: (content) => content,
});

td.addRule("customEmoji", {
  filter: (node) => node.nodeName === "IMG" && node.getAttribute("data-custom-emoji") === "true",
  replacement: (_content, node) => node.getAttribute("alt") || "",
});

export function htmlToMarkdown(html) {
  // Strip zero-width spaces (used as caret anchors inside empty code spans).
  return td.turndown(normalizeCodeBlockBreaks(html)).replace(/​/g, "").trim();
}
