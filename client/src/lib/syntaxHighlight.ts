import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import java from "highlight.js/lib/languages/java";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

for (const [name, language] of Object.entries({
  bash, css, java, javascript, json, markdown, python, typescript, xml, yaml,
})) {
  hljs.registerLanguage(name, language);
}

const LANGUAGE_INFO = {
  bash: { extension: "sh", contentType: "text/x-shellscript" },
  css: { extension: "css", contentType: "text/css" },
  java: { extension: "java", contentType: "text/x-java-source" },
  javascript: { extension: "js", contentType: "text/javascript" },
  json: { extension: "json", contentType: "application/json" },
  markdown: { extension: "md", contentType: "text/markdown" },
  python: { extension: "py", contentType: "text/x-python" },
  typescript: { extension: "ts", contentType: "text/typescript" },
  xml: { extension: "html", contentType: "text/html" },
  yaml: { extension: "yaml", contentType: "application/yaml" },
};

const EXTENSION_LANGUAGES = {
  bash: "bash", sh: "bash", zsh: "bash",
  css: "css",
  java: "java",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json",
  md: "markdown", markdown: "markdown",
  py: "python",
  ts: "typescript", tsx: "typescript",
  html: "xml", htm: "xml", svg: "xml", xml: "xml",
  yaml: "yaml", yml: "yaml",
};

const AUTO_DETECT_LANGUAGES = ["bash", "css", "java", "javascript", "json", "markdown", "python", "typescript", "xml", "yaml"];

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

export function fileInfoForLanguage(language = "plaintext") {
  const info = LANGUAGE_INFO[language];
  return info ? { language, ...info } : { language: "plaintext", extension: "txt", contentType: "text/plain" };
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

export function detectTextLanguage(text) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  try {
    const result = hljs.highlightAuto(value, AUTO_DETECT_LANGUAGES);
    return result.language || null;
  } catch {
    return null;
  }
}
