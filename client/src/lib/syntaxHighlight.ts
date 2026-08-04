import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

for (const [name, language] of Object.entries({
  bash, css, javascript, json, markdown, python, typescript, xml, yaml,
})) {
  hljs.registerLanguage(name, language);
}

const EXTENSION_LANGUAGES = {
  bash: "bash", sh: "bash", zsh: "bash",
  css: "css",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json",
  md: "markdown", markdown: "markdown",
  py: "python",
  ts: "typescript", tsx: "typescript",
  html: "xml", htm: "xml", svg: "xml", xml: "xml",
  yaml: "yaml", yml: "yaml",
};

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function languageForFilename(name = "") {
  const extension = String(name).toLowerCase().split(".").pop();
  return EXTENSION_LANGUAGES[extension] || "plaintext";
}

export function highlightCode(text, language = "") {
  try {
    if (language && language !== "plaintext" && hljs.getLanguage(language)) {
      return hljs.highlight(String(text), { language, ignoreIllegals: true }).value;
    }
  } catch {
    // Fall through to escaped plain text if a grammar rejects the input.
  }
  return escapeHtml(text);
}

export function highlightFile(text, name) {
  return highlightCode(text, languageForFilename(name));
}
