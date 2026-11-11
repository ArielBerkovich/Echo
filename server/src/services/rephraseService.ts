import { REPHRASE_PROMPT } from "./rephrasePrompt.js";
import { requestRephrase } from "./rephraseProvider.js";


const MIN_REPHRASE_OUTPUT_TOKENS = 500;

function rephraseError(status, message) {
  return Object.assign(new Error(message), { status });
}

function preservesProtectedContent(text, draft) {
  const listPattern = /^[ \t]{0,3}(?:[-*+][ \t]+|\d+[.)][ \t]+).+$/gm;
  const originalItems = draft.match(listPattern) || [];
  const rewrittenItems = text.match(listPattern) || [];
  if (originalItems.length && rewrittenItems.length !== originalItems.length) return false;
  const numberedItems = draft.match(/^[ \t]{0,3}\d+[.)][ \t]+.+$/gm) || [];
  const rewrittenNumberedItems = text.match(/^[ \t]{0,3}\d+[.)][ \t]+.+$/gm) || [];
  if (numberedItems.length && rewrittenNumberedItems.length !== numberedItems.length) return false;
  const numbers = draft.match(/(?<![\p{L}\p{N}])\d+(?:[.,:]\d+)*/gu) || [];
  if (numbers.some((number) => !(text.match(/(?<![\p{L}\p{N}])\d+(?:[.,:]\d+)*/gu) || []).includes(number))) return false;
  const quotes = [...draft.matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)].map(match => match[0]);
  if (quotes.some(quote => !text.includes(quote))) return false;
  const urls = draft.match(/https?:\/\/[^\s)]+/g) || [];
  if (urls.some((url) => !text.includes(url))) return false;
  const inlineCode = [...draft.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)].map((match) => match[0]);
  if (inlineCode.some((code) => !text.includes(code))) return false;
  const blocks = [...draft.matchAll(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1\s*$/gm)];
  if (blocks.some((block) => !text.includes(block[0]))) return false;
  if (/[\u0590-\u08ff]/.test(draft) && !/[\u0590-\u08ff]/.test(text)) return false;
  return true;
}

function inputConstraints(draft) {
  const constraints = [];
  if (/```|~~~/.test(draft) || /(?:const|let|var|function|SELECT\s|npm run)\b/.test(draft)) {
    constraints.push("The draft may contain code: preserve code and commands exactly. Use a fenced block only when a standalone block helps readability.");
  }
  if (/(^|\n)\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(draft)) {
    constraints.push("The draft contains a list: every list item must remain a list item in the same order.");
  }
  if (/(^|\n)\s{0,3}(?:#{1,6}\s+|>\s+)/.test(draft) || /\*\*|__|~~|`[^`\n]+`/.test(draft)) {
    constraints.push("The draft contains Markdown: preserve each Markdown structure in the option.");
  }
  if (/[\u0590-\u08ff]/.test(draft)) {
    constraints.push("The draft uses Hebrew or another RTL script: write the option in that same language and script; do not translate.");
  }
  return constraints;
}

function parseOptions(content, draft) {
  const cleaned = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw rephraseError(502, "The rephrase provider returned invalid options.");
    try { parsed = JSON.parse(cleaned.slice(start, end + 1)); }
    catch { throw rephraseError(502, "The rephrase provider returned invalid options."); }
  }
  if (parsed?.canRephrase === false) {
    return { canRephrase: false, reason: typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 240) : "The message needs more context before it can be rephrased.", options: [] };
  }
  const options = Array.isArray(parsed) ? parsed : parsed?.options;
  if (!Array.isArray(options)) throw rephraseError(502, "The rephrase provider returned invalid options.");
  const option = options.find((candidate) => candidate?.key === "professional");
  const text = typeof option?.text === "string" ? option.text.trim() : "";
  if (!text) throw rephraseError(502, "The rephrase provider returned incomplete options.");
  if (!preservesProtectedContent(text, draft)) {
    return { canRephrase: false, reason: "The rewrite changed protected formatting or content. Please try again.", options: [] };
  }
  return { canRephrase: true, options: [{ key: "professional", text }] };
}

function validateDraft(text) {
  const draft = String(text || "").trim();
  if (!draft) throw rephraseError(400, "Write a message before asking AI to rephrase it.");
  if (draft.length > 4000) throw rephraseError(400, "Messages must be 4000 characters or fewer.");
  return draft;
}

export async function rephraseMessage(text, settings) {
  const draft = validateDraft(text);
  const outputTokens = Math.min(Math.max(settings.maxOutputTokens, MIN_REPHRASE_OUTPUT_TOKENS), 900);
  if (Math.ceil((draft.length + REPHRASE_PROMPT.length) / 3) + outputTokens > settings.maxContextTokens) {
    throw rephraseError(413, "This message is too long for the configured AI context.");
  }
  const content = await requestRephrase(draft, inputConstraints(draft), settings, outputTokens);
  return parseOptions(content, draft);
}
