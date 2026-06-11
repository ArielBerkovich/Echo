import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roomFor, userRoom } from "./lib/rooms.js";
import { sanitizeAttachments } from "./deliver.js";

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
