export function neutralizeMentions(text) {
  return String(text || "").replace(/@(?=[\w.-]+)/g, "@\u2060");
}

export function buildQuoteMarkdown(message, attributionTemplate = "{name} said:") {
  const author = message?.author?.displayName || message?.author?.username || "Someone";
  const body = String(message?.body || "").trim();
  const quotedBody = body
    ? body.split("\n").map((line) => `> ${neutralizeMentions(line)}`).join("\n")
    : "> ";
  // Keep attribution and body in the same quote block. The composer adds a
  // separate real paragraph after this block for the reply; an empty quoted
  // paragraph would make the reply caret appear to remain inside the quote.
  const attribution = attributionTemplate.replace("{name}", () => neutralizeMentions(author));
  return `> ${attribution}\n${quotedBody}\n\n`;
}
