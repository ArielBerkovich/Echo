const CARD_RE = /<card\b([^>]*)>([\s\S]*?)<\/card>/i;
const VALUE_RE = (name) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i");

function decode(value) {
  return String(value || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

export function parseCardMarkup(body) {
  const match = String(body || "").match(CARD_RE);
  if (!match) return null;
  const attrs = {};
  for (const item of match[1].matchAll(/([a-z][\w-]*)\s*=\s*["']([^"']*)["']/gi)) attrs[item[1].toLowerCase()] = decode(item[2]);
  const title = decode(match[2].match(VALUE_RE("title"))?.[1] || attrs.title);
  const url = decode(attrs.url || attrs.href);
  if (!title || !/^https?:\/\//i.test(url)) return null;
  const description = decode(match[2].match(VALUE_RE("description"))?.[1]);
  const attributes = [...match[2].matchAll(/<attribute\b([^>]*)>([\s\S]*?)<\/attribute>/gi)].map((item) => {
    const label = decode(item[1].match(/label\s*=\s*["']([^"']+)["']/i)?.[1]);
    const type = decode(item[1].match(/(?:type|format)\s*=\s*["']([^"']+)["']/i)?.[1]).toLowerCase();
    return { label, value: decode(item[2]), ...(type === "user" || type === "person" ? { type: "user" } : {}) };
  }).filter((item) => item.label && item.value).slice(0, 12);
  return {
    before: `${body.slice(0, match.index)}${body.slice(match.index + match[0].length)}`.trim(),
    card: {
      type: "card", eyebrow: decode(attrs.eyebrow), title, description, attributes, url,
      ...(attrs.color ? { color: decode(attrs.color) } : {}),
      ...(attrs["title-color"] || attrs.titlecolor ? { titleColor: decode(attrs["title-color"] || attrs.titlecolor) } : {}),
      ...(attrs.timestamp ? { timestamp: decode(attrs.timestamp) } : {}),
    },
  };
}
