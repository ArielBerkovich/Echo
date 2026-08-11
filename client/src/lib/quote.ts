export function neutralizeMentions(text) {
  return String(text || "").replace(/@(?=[\w.-]+)/g, "@\u2060");
}

export function buildQuoteMarkdown(message) {
  const author = message?.author?.displayName || message?.author?.username || "Someone";
  const body = String(message?.body || "").trim();
  const quotedBody = body
    ? body.split("\n").map((line) => `> ${neutralizeMentions(line)}`).join("\n")
    : "> ";
  return `> ${author} said:\n${quotedBody}\n\n`;
}
