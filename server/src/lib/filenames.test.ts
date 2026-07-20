import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeMultipartFilename } from "./filenames.js";

describe("decodeMultipartFilename", () => {
  it("repairs UTF-8 Hebrew filenames decoded as Latin-1", () => {
    const expected = "מסמך בדיקה.pdf";
    const mojibake = Buffer.from(expected, "utf8").toString("latin1");
    assert.equal(decodeMultipartFilename(mojibake), expected);
  });

  it("preserves ASCII and already-correct Unicode filenames", () => {
    assert.equal(decodeMultipartFilename("report.pdf"), "report.pdf");
    assert.equal(decodeMultipartFilename("מסמך.pdf"), "מסמך.pdf");
  });

  it("does not corrupt genuine Latin-1 names", () => {
    assert.equal(decodeMultipartFilename("café.txt"), "café.txt");
  });
});
