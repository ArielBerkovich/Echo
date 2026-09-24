export function neutralizeMentions(text) {
  return String(text || "").replace(/@(?=[\w.-]+)/g, "@\u2060");
}

export function buildQuoteMarkdown(message) {
  const author = message?.author?.displayName || message?.author?.username || "Someone";
  const body = String(message?.body || "").trim();
  const quotedBody = body
    ? body.split("\n").map((line) => `> ${neutralizeMentions(line)}`).join("\n")
    : "> ";
  // Keep attribution and body in the same quote block. The blank quoted line
  // gives the composer two paragraphs, allowing the body direction to remain
  // independent of an author name written in another script.
  return `> ${neutralizeMentions(author)} said:\n> \n${quotedBody}\n\n`;
}
