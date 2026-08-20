const MESSAGE_ID = /^[a-f\d]{24}$/i;

function sameEchoOrigin(url) {
  if (typeof window === "undefined") return true;
  if (url.origin === window.location.origin) return true;
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  return url.protocol === window.location.protocol
    && url.port === window.location.port
    && loopback.has(url.hostname)
    && loopback.has(window.location.hostname);
}

export function messageLinkPath(channel, messageId) {
  const base = channel?.type === "dm"
    ? `/dms/${encodeURIComponent(channel.id)}`
    : `/channels/${encodeURIComponent(channel.id)}`;
  return `${base}?message=${encodeURIComponent(messageId)}`;
}

export function messageLink(channel, messageId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${messageLinkPath(channel, messageId)}`;
}

// Return the first same-origin Echo message permalink in a message body.
// Markdown links and bare URLs both remain detectable because this runs on
// the source text rather than the sanitized HTML.
export function findMessageLink(body) {
  // Keep Markdown delimiters out of the URL. The composer may store a pasted
  // link as `[url](url)`, and a greedy match would combine both URLs and make
  // the message query parameter invalid.
  const candidates = String(body || "").match(/(?:https?:\/\/[^\s<>\]\)]+|\/(?:channels|dms|home\/dms)\/[^\s<>\]\)]+)/gi) || [];
  for (const candidate of candidates) {
    try {
      const cleaned = candidate.replace(/[),.!?;:]+$/, "");
      const url = new URL(cleaned, typeof window !== "undefined" ? window.location.origin : "http://echo.local");
      if (!sameEchoOrigin(url)) continue;
      const parts = url.pathname.split("/").filter(Boolean);
      const isConversationPath = (parts[0] === "channels" && parts[1]) || (parts[0] === "dms" && parts[1]);
      const messageId = url.searchParams.get("message");
      if (isConversationPath && messageId && MESSAGE_ID.test(messageId)) return messageId;
    } catch {
      // Ignore malformed or external URLs.
    }
  }
  return null;
}
