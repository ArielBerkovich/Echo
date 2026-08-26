import { detectTextLanguage, fileInfoForLanguage } from "./syntaxHighlight.js";

export const MAX_MESSAGE_CHARACTERS = 4000;
export const LARGE_PASTE_CHARACTERS = 2000;
export const MAX_PASTE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function pasteByteLength(text) {
  return new Blob([text]).size;
}

const FENCED_LANGUAGE_ALIASES = {
  bash: "bash", sh: "bash", shell: "bash",
  css: "css",
  java: "java",
  javascript: "javascript", js: "javascript", typescript: "typescript", ts: "typescript",
  json: "json", jsonc: "json",
  markdown: "markdown", md: "markdown",
  python: "python", py: "python",
  html: "xml", xml: "xml",
  yaml: "yaml", yml: "yaml",
};

function detectPastedLanguage(text) {
  const trimmed = text.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Keep the generic text extension for JSON-like, but invalid, content.
    }
  }
  const fence = text.match(/```\s*([\w+#-]+)/i);
  const fencedLanguage = fence && FENCED_LANGUAGE_ALIASES[fence[1].toLowerCase()];
  if (fencedLanguage) return fencedLanguage;
  if (/\b(?:package\s+[\w.]+;|import\s+java\.|public\s+(?:final\s+)?class\b|System\.out\.)/.test(text)) return "java";
  return detectTextLanguage(text) || "plaintext";
}

export function detectPastedFile(text) {
  const info = fileInfoForLanguage(detectPastedLanguage(text));
  return { ...info, name: `pasted.${info.extension}` };
}

export function pasteAttachmentName(text) {
  return detectPastedFile(text).name;
}

export function createPasteAttachment(text) {
  const { name, contentType } = detectPastedFile(text);
  return new File([text], name, { type: contentType });
}
