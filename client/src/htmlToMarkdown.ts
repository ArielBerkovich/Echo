import TurndownService from "turndown";

// Converts the WYSIWYG editor's HTML into the Markdown we store and re-render.
const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
});

// Text nodes are ordinary composer text. Keep HTML-like input literal in
// stored Markdown; structured underline nodes still pass through their rule.
const escapeMarkdownText = td.escape.bind(td);
td.escape = (text) => escapeMarkdownText(text).replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

td.addRule("underline", {
  filter: "u",
  replacement: (content) => `<u>${content}</u>`,
});

// A plain paragraph beginning with a Markdown heading marker is still plain
// composer text. Escape the marker in the stored body so the message renderer
// only treats raw Markdown as source inside an explicit Markdown section.
td.addRule("literalHeading", {
  filter: (node) => node.nodeName === "P" && node.parentNode?.nodeName !== "LI",
  replacement: (content) => `${content.replace(/(^|\n)( {0,3}#{1,6})([ \t]+)/g, "$1\\$2$3")}\n\n`,
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

td.addRule("userMention", {
  filter: (node) => node.nodeName === "SPAN" && node.getAttribute("data-user-mention") !== null,
  replacement: (_content, node) => `@${node.getAttribute("data-user-mention") || ""}`,
});

td.addRule("channelMention", {
  filter: (node) => node.nodeName === "SPAN" && node.getAttribute("data-channel-mention") !== null,
  replacement: (_content, node) => `#${node.getAttribute("data-channel-mention") || ""}`,
});

td.addRule("markdownSection", {
  filter: (node) => node.nodeName === "PRE" && node.hasAttribute("data-markdown-section"),
  replacement: (_content, node) => {
    const source = node.textContent || "";
    const longestFence = Math.max(2, ...[...source.matchAll(/^ {0,3}(~{3,})/gm)].map((match) => match[1].length));
    const fence = "~".repeat(longestFence + 1);
    return `\n\n${fence}echo-markdown\n${source}\n${fence}\n\n`;
  },
});

export function htmlToMarkdown(html) {
  // Strip zero-width spaces (used as caret anchors inside empty code spans).
  return td.turndown(normalizeCodeBlockBreaks(html)).replace(/[​\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
}
