const MESSAGE_ID = /^[a-f\d]{24}$/i;

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
  const candidates = String(body || "").match(/https?:\/\/[^\s<>]+/gi) || [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.!?;:]+$/, ""));
      if (typeof window !== "undefined" && url.origin !== window.location.origin) continue;
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
