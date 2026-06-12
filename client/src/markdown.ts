import { Marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import emojiData from "@emoji-mart/data";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Syntax-highlight a fenced code block. Uses the declared language (```python)
// when given/known, otherwise auto-detects across the common languages
// (Java, Bash, Python, JS, Go, SQL, …).
function highlightCode(text, lang) {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

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

// Build a Markdown renderer that also turns @mentions into highlighted pills.
// `knownUsernames` is a Set of lowercase handles; `me` is the current handle.
// Matches an emoji incl. ZWJ sequences and variation selectors.
const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
const HAS_EMOJI = /\p{Extended_Pictographic}/u;

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
export function createRenderer(knownUsernames, me, customEmojis = []) {
  const customMap = new Map(customEmojis.map((e) => [e.name.toLowerCase(), e.url]));
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
          const mine = handle === String(me).toLowerCase() ? " mention--me" : "";
          return `<span class="mention${mine}" data-mention="${handle}">@${token.handle}</span>`;
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
    ],
  });

  return (text) => {
    const html = marked.parse(text ?? "");
    // Sanitize: allow only the safe subset markdown produces. `class` is kept so
    // our mention pills stay styled; links open safely in a new tab.
    const safe = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
        "ul", "ol", "li", "a", "span", "h1", "h2", "h3", "hr", "img",
      ],
      ALLOWED_ATTR: ["class", "href", "title", "target", "rel", "src", "alt"],
    });
    return wrapEmojis(safe).trim();
  };
}
