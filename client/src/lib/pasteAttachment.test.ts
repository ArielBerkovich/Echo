import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_MESSAGE_CHARACTERS,
  MAX_PASTE_ATTACHMENT_BYTES,
  pasteAttachmentName,
  pasteByteLength,
} from "./pasteAttachment.js";
import { languageForFilename } from "./syntaxHighlight.js";

describe("paste attachment helpers", () => {
  it("measures pasted content as UTF-8 bytes", () => {
    assert.equal(pasteByteLength("hello"), 5);
    assert.equal(pasteByteLength("😀"), 4);
  });

  it("uses a JSON extension for valid JSON", () => {
    assert.equal(pasteAttachmentName('{"enabled":true}'), "pasted.json");
  });

  it("detects JSON arrays and fenced JSON", () => {
    assert.equal(pasteAttachmentName('[{"id":1,"active":true}]'), "pasted.json");
    assert.equal(pasteAttachmentName('```json\n[{"id":1}]\n```'), "pasted.json");
  });

  it("uses syntax detection for recognizable code", () => {
    assert.equal(pasteAttachmentName("const total = items.reduce((sum, item) => sum + item.value, 0);"), "pasted.js");
    assert.equal(pasteAttachmentName("package com.example.orders;\n\nimport java.math.BigDecimal;\n\npublic class OrderService {}"), "pasted.java");
    assert.equal(pasteAttachmentName("public class Hello { public static void main(String[] args) { System.out.println(\"Hello\"); } }"), "pasted.java");
  });

  it("maps detected source extensions back to viewer languages", () => {
    assert.equal(languageForFilename("pasted.java"), "java");
    assert.equal(languageForFilename("pasted.py"), "python");
  });

  it("keeps the message and attachment limits explicit", () => {
    assert.equal(MAX_MESSAGE_CHARACTERS, 4000);
    assert.equal(MAX_PASTE_ATTACHMENT_BYTES, 10 * 1024 * 1024);
  });
});
