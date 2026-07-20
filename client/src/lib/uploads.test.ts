import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_UPLOAD_BYTES, uploadSizeError } from "./uploads.js";

describe("uploadSizeError", () => {
  it("allows files at or below the configured limit", () => {
    assert.equal(uploadSizeError([{ name: "exact.zip", size: MAX_UPLOAD_BYTES }]), "");
  });

  it("identifies an oversized file and explains the intentional limit", () => {
    assert.equal(
      uploadSizeError([{ name: "archive.zip", size: MAX_UPLOAD_BYTES + 1 }]),
      "“archive.zip” is too large. Files are limited to 10 MB each."
    );
  });

  it("supports feature-specific limits and labels", () => {
    assert.equal(
      uploadSizeError([{ name: "party.gif", size: 6 * 1024 * 1024 }], 5 * 1024 * 1024, "Emoji images"),
      "“party.gif” is too large. Emoji images are limited to 5 MB each."
    );
  });
});
