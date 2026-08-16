import { Marked } from "marked";
import DOMPurify from "dompurify";
import emojiData from "@emoji-mart/data";
import { escapeHtml, highlightCode } from "./lib/syntaxHighlight.js";

// Syntax-highlight a fenced code block. Uses the declared language (```python)
// when given/known, otherwise auto-detects across the common languages
// (Java, Bash, Python, JS, Go, SQL, …).

// Build a ":shortcode:" -> native-emoji map from the emoji-mart dataset
// (covers every emoji and its aliases, e.g. :smile:, :rocket:, :+1:).
const shortcodeToNative = new Map();
for (const [id, e] of Object.entries(emojiData.emojis || {})) {
  const native = e?.skins?.[0]?.native;
  if (native) shortcodeToNative.set(id, native);
}
for (const [alias, id] of Object.entries(emojiData.aliases || {})) {
  const native = emojiData.emojis?.[id]?.skins?.[0]?.native;
  if (native) shortcodeToNative.set(alias, native);
}

// Build a Markdown renderer that also turns @mentions and public #channel tags
// into highlighted, clickable pills.
// `knownUsernames` is a Set of handles or a handle->mention-user Map. The map
// keeps the canonical username for storage/profile lookup while also carrying
// the display name used by the rendered mention pill.
// Matches an emoji incl. ZWJ sequences and variation selectors.
const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
const HAS_EMOJI = /\p{Extended_Pictographic}/u;

const ECHO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function formatEchoDateTime(value) {
  const iso = String(value || "");
  const match = ECHO_DATETIME_RE.exec(iso);
  if (!match) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const [year, month, day, hour, minute, second] = [
    Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)),
    Number(iso.slice(11, 13)), Number(iso.slice(14, 16)), Number(iso.slice(17, 19)),
  ];
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day
    || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

// Split preview text into safe React-renderable pieces. Unlike the full
// Markdown renderer, this deliberately recognizes only emoji shortcodes;
// everything else remains plain text.
export function tokenizeEmojiShortcodes(text, customEmojis = []) {
  const customMap = new Map(customEmojis.map((emoji) => [String(emoji.name).toLowerCase(), emoji.url]));
  const shortcode = /:([a-z0-9_+.-]+):/gi;
  const tokens = [];
  let last = 0;
  let match;
  while ((match = shortcode.exec(String(text ?? "")))) {
    if (match.index > last) tokens.push({ type: "text", value: String(text).slice(last, match.index) });
    const code = match[1];
    const native = shortcodeToNative.get(code.toLowerCase());
    const customUrl = customMap.get(code.toLowerCase());
    if (native) tokens.push({ type: "native", value: native });
    else if (customUrl) tokens.push({ type: "custom", value: customUrl, alt: `:${code}:` });
    else tokens.push({ type: "text", value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < String(text ?? "").length) tokens.push({ type: "text", value: String(text).slice(last) });
  return tokens;
}

// Wrap emoji characters in styled spans so they render larger than body text.
// Emoji-only messages get a "jumbo" size.
function wrapEmojis(html) {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const root = tpl.content;

  const plain = root.textContent || "";
  const emojiCount = (plain.match(EMOJI_RE) || []).length;
  const jumbo = emojiCount > 0 && emojiCount <= 12 && plain.replace(EMOJI_RE, "").trim() === "";
  const cls = jumbo ? "emoji emoji--jumbo" : "emoji";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    const p = node.parentNode;
    if (p && p.nodeType === 1 && p.closest("code, pre")) continue; // leave code as-is
    if (HAS_EMOJI.test(node.nodeValue)) targets.push(node);
  }

  for (const textNode of targets) {
    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0;
    text.replace(EMOJI_RE, (match, idx) => {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = match;
      frag.appendChild(span);
      last = idx + match.length;
      return match;
    });
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
  return tpl.innerHTML;
}

// `customEmojis` is an array of { name, url } for workspace custom emoji/GIFs.
export function createRenderer(knownUsernames, me, customEmojis = [], channels = []) {
  // Message feeds are frequently unmounted and remounted while navigating
  // between workspace views. Keep rendered HTML for the lifetime of this
  // renderer so revisiting a feed does not repeat Markdown parsing, sanitizing,
  // and emoji DOM processing for unchanged message bodies.
  const renderedCache = new Map();
  const RENDER_CACHE_LIMIT = 500;
  const customMap = new Map(customEmojis.map((e) => [e.name.toLowerCase(), e.url]));
  const publicChannels = new Set(
    channels.filter((channel) => channel.type === "public").map((channel) => channel.name.toLowerCase())
  );
  const marked = new Marked({
    breaks: true, // single newline => <br>
    gfm: true,
  });

  // Syntax-highlight fenced code blocks (keywords/strings/etc. get their own
  // colours, per language).
  marked.use({
    renderer: {
      // marked may call this with a token object or positional (code, lang) args
      // depending on version — handle both.
      code(codeArg, infostring) {
        const token = codeArg && typeof codeArg === "object" ? codeArg : null;
        const text = token ? token.text : codeArg;
        const lang = token ? token.lang : infostring;
        const language = (lang || "").trim().split(/\s+/)[0];
        return `<pre><code class="hljs">${highlightCode(text ?? "", language)}</code></pre>`;
      },
    },
  });

  // Custom inline token so "@alice" renders as a styled mention (only when real).
  marked.use({
    extensions: [
      {
        name: "mention",
        level: "inline",
        start(src) {
          const i = src.indexOf("@");
          return i < 0 ? undefined : i;
        },
        tokenizer(src) {
          const m = /^@([a-z0-9_.-]+)/i.exec(src);
          if (!m) return undefined;
          return { type: "mention", raw: m[0], handle: m[1] };
        },
        renderer(token) {
          const handle = token.handle.toLowerCase();
          // @everyone broadcasts to everyone in the channel (not a personal
          // mention) — flag it with a megaphone so it reads as an announcement.
          if (handle === "everyone") {
            return `<span class="mention mention--broadcast">📣 @${token.handle}</span>`;
          }
          if (!knownUsernames.has(handle)) return token.raw; // not a real user
          const mentionUser = knownUsernames instanceof Map ? knownUsernames.get(handle) : null;
          const canonical = typeof mentionUser === "string" ? mentionUser : mentionUser?.username || handle;
          const displayName = typeof mentionUser === "object"
            ? mentionUser.displayName || canonical
            : canonical;
          const mine = canonical === String(me).toLowerCase() ? " mention--me" : "";
          return `<span class="mention${mine}" data-mention="${escapeHtml(canonical)}">@${escapeHtml(displayName)}</span>`;
        },
      },
      {
        name: "channelTag",
        level: "inline",
        start(src) {
          const i = src.indexOf("#");
          return i < 0 ? undefined : i;
        },
        tokenizer(src) {
          const m = /^#([a-z0-9_-]+)/i.exec(src);
          if (!m || !publicChannels.has(m[1].toLowerCase())) return undefined;
          return { type: "channelTag", raw: m[0], name: m[1].toLowerCase() };
        },
        renderer(token) {
          return `<span class="channel-tag" data-channel-tag="${token.name}">#${token.name}</span>`;
        },
      },
      {
        // ":shortcode:" -> the emoji character (skips unknown codes).
        name: "emoji",
        level: "inline",
        start(src) {
          const i = src.indexOf(":");
          return i < 0 ? undefined : i;
        },
        tokenizer(src) {
          // Dots are allowed so user-handle emoji like :ariel.berkovich: match.
          const m = /^:([a-z0-9_+.-]+):/.exec(src);
          if (!m) return undefined;
          const code = m[1];
          const native = shortcodeToNative.get(code);
          if (native) return { type: "emoji", raw: m[0], native };
          // Fall back to a workspace custom emoji/GIF, if one matches.
          const customUrl = customMap.get(code.toLowerCase());
          if (customUrl) return { type: "emoji", raw: m[0], customUrl, code };
          return undefined;
        },
        renderer(token) {
          if (token.native) return token.native;
          return `<img class="custom-emoji" src="${token.customUrl}" alt=":${token.code}:" title=":${token.code}:" />`;
        },
      },
      {
        // Echo's localized datetime token. The strict ISO format and unusual
        // delimiters keep this separate from ordinary user text.
        name: "echoDatetime",
        level: "inline",
        start(src) {
          const i = src.indexOf("⟦datetime:");
          return i < 0 ? undefined : i;
        },
        tokenizer(src) {
          const m = /^⟦datetime:([^⟧]+)⟧/.exec(src);
          if (!m || !formatEchoDateTime(m[1])) return undefined;
          return { type: "echoDatetime", raw: m[0], iso: m[1] };
        },
        renderer(token) {
          const formatted = formatEchoDateTime(token.iso);
          if (!formatted) return token.raw;
          return `<time class="localized-datetime" datetime="${escapeHtml(token.iso)}">${escapeHtml(formatted)}</time>`;
        },
      },
    ],
  });

  return (text) => {
    const source = text ?? "";
    const cached = renderedCache.get(source);
    if (cached !== undefined) return cached;

    const html = marked.parse(source);
    // Sanitize: allow only the safe subset markdown produces. `class` is kept so
    // our mention pills stay styled; links open safely in a new tab.
    const safe = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
        "ul", "ol", "li", "a", "span", "time", "h1", "h2", "h3", "hr", "img",
      ],
      ALLOWED_ATTR: ["class", "datetime", "href", "title", "target", "rel", "src", "alt", "data-channel-tag"],
      // Authenticated custom emoji are rendered through local blob URLs before
      // this HTML is inserted into the chat. Keep those URLs while retaining
      // a narrow allowlist for markdown links and image sources.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|blob):|(?:\.{0,2}\/)|#)/i,
    });
    // Markdown links should never replace the conversation tab. Add the
    // attributes after sanitizing so every generated link gets the same safe
    // browser behavior, regardless of which marked token path produced it.
    const linksOpenSafely = safe.replace(
      /<a\b(?![^>]*\btarget=)/gi,
      '<a target="_blank" rel="noopener noreferrer"'
    );
    const rendered = wrapEmojis(linksOpenSafely).trim();
    if (renderedCache.size >= RENDER_CACHE_LIMIT) {
      renderedCache.delete(renderedCache.keys().next().value);
    }
    renderedCache.set(source, rendered);
    return rendered;
  };
}
