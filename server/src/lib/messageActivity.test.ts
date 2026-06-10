import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractMentionHandles, mentionsEveryone } from "./messageActivity.js";

describe("message activity metadata helpers", () => {
  it("extracts unique normalized user mention handles and skips everyone", () => {
    assert.deepEqual(
      extractMentionHandles("Hi @Ariel.Berkovich and @maya-dev and @ariel.berkovich @everyone"),
      ["ariel.berkovich", "maya-dev"]
    );
  });

  it("detects @everyone as a broadcast mention", () => {
    assert.equal(mentionsEveryone("deploying now @everyone"), true);
    assert.equal(mentionsEveryone("email me at admin@everyone.test"), false);
  });
});
