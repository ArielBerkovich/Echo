import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roomFor, userRoom } from "./lib/rooms.js";
import { attachmentLimitError, sanitizeAttachments, sanitizeSurvey, surveyError } from "./deliver.js";

describe("room helpers", () => {
  it("build channel and user room names", () => {
    assert.equal(roomFor("c1"), "channel:c1");
    assert.equal(userRoom("u1"), "user:u1");
  });
});

describe("sanitizeAttachments", () => {
  it("returns an empty list for non-arrays", () => {
    assert.deepEqual(sanitizeAttachments(), []);
    assert.deepEqual(sanitizeAttachments({ key: "file.txt" }), []);
  });

  it("keeps only attachments with safe storage keys", () => {
    const result = sanitizeAttachments([
      null,
      { key: "../secret.txt" },
      { key: "nested/file.txt" },
      { key: "abc-123.PNG", name: "image.png" },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].key, "abc-123.PNG");
  });

  it("normalizes optional fields and caps text values", () => {
    const result = sanitizeAttachments([
      {
        key: "abc.txt",
        name: "x".repeat(300),
        size: "42",
        contentType: "text/plain;".repeat(20),
        isImage: 1,
        width: "640",
        height: 0,
      },
    ]);

    assert.equal(result[0].name.length, 255);
    assert.equal(result[0].size, 42);
    assert.equal(result[0].contentType.length, 100);
    assert.equal(result[0].isImage, true);
    assert.equal(result[0].width, 640);
    assert.equal(result[0].height, undefined);
  });

  it("keeps at most ten attachments", () => {
    const result = sanitizeAttachments(
      Array.from({ length: 12 }, (_, i) => ({ key: `file-${i}.txt`, name: `file-${i}` }))
    );

    assert.equal(result.length, 10);
    assert.equal(result.at(-1).key, "file-9.txt");
  });
});

describe("attachmentLimitError", () => {
  it("returns the shared user-facing error only above the limit", () => {
    assert.equal(attachmentLimitError([]), null);
    assert.equal(attachmentLimitError(Array.from({ length: 10 }, () => ({ key: "file.txt" }))), null);
    assert.equal(
      attachmentLimitError(Array.from({ length: 11 }, () => ({ key: "file.txt" }))),
      "A message can have up to 10 attachments"
    );
  });
});

describe("surveys", () => {
  it("normalizes valid surveys and removes duplicate or empty options", () => {
    const result = sanitizeSurvey({
      question: "  Lunch? ",
      multipleChoice: true,
      options: [{ label: "Pizza" }, { label: "" }, { label: "pizza" }, { label: "Salad" }],
    });
    assert.equal(result.question, "Lunch?");
    assert.equal(result.allowMultiple, true);
    assert.deepEqual(result.options.map((option) => option.label), ["Pizza", "Salad"]);
    assert.ok(result.options.every((option) => option.votes.length === 0 && option.id.length > 0));
  });

  it("rejects surveys without a question or two distinct options", () => {
    assert.equal(surveyError({ question: "Pick one", options: [{ label: "Only" }] }) !== null, true);
    assert.equal(surveyError({ question: "", options: [{ label: "A" }, { label: "B" }] }) !== null, true);
    assert.equal(surveyError(undefined), null);
  });
});
