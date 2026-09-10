export const MAX_CARD_ATTRIBUTES = 12;

const CARD_COLORS = new Set([
  "blue", "cyan", "green", "amber", "orange", "red", "pink", "purple", "gray",
]);
const ZULU_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function sanitizeColor(value) {
  const color = String(value || "").trim().toLowerCase();
  if (!color) return "";
  return CARD_COLORS.has(color) || /^#[0-9a-f]{6}$/.test(color) ? color : null;
}

function sanitizeTimestamp(value) {
  const timestamp = String(value || "").trim();
  if (!timestamp) return "";
  if (!ZULU_TIMESTAMP.test(timestamp)) return null;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sanitizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim().slice(0, 2048));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeCard(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const title = String(card.title || "").trim().slice(0, 300);
  const url = sanitizeUrl(card.url);
  const color = sanitizeColor(card.color);
  const titleColor = sanitizeColor(card.titleColor);
  const timestamp = sanitizeTimestamp(card.timestamp);
  if (!title || !url || color === null || titleColor === null || timestamp === null) return null;

  const attributes = (Array.isArray(card.attributes) ? card.attributes : [])
    .map((attribute) => ({
      label: String(attribute?.label || "").trim().slice(0, 64),
      value: String(attribute?.value || "").trim().slice(0, 400),
      type: ["user", "person"].includes(String(attribute?.type || "").toLowerCase()) ? "user" : "text",
    }))
    .filter(({ label, value }) => label && value)
    .slice(0, MAX_CARD_ATTRIBUTES);

  return {
    eyebrow: String(card.eyebrow || "").trim().slice(0, 120),
    title,
    description: String(card.description || "").trim().slice(0, 1000),
    url,
    color,
    titleColor,
    timestamp,
    attributes,
  };
}

export function cardError(card) {
  if (card === undefined || card === null) return null;
  if (Array.isArray(card?.attributes) && card.attributes.length > MAX_CARD_ATTRIBUTES) {
    return `a card can have up to ${MAX_CARD_ATTRIBUTES} attributes`;
  }
  if (card?.timestamp && sanitizeTimestamp(card.timestamp) === null) {
    return "card timestamp must be an ISO 8601 Zulu time ending in Z";
  }
  return sanitizeCard(card) ? null : "a card needs a title, a valid HTTP(S) URL, and valid colors";
}
