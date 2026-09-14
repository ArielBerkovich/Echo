import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractMentionHandles, mentionsEveryone } from "./messageActivity.js";

describe("message activity metadata helpers", () => {
  it("extracts unique normalized user mention handles and skips everyone", () => {
    assert.deepEqual(
      extractMentionHandles("Hi @Ariel.Berkovich and @maya-dev and @ariel.berkovich @dev\\_5 @everyone"),
      ["ariel.berkovich", "maya-dev", "dev_5"]
    );
  });

  it("detects @everyone as a broadcast mention", () => {
    assert.equal(mentionsEveryone("deploying now @everyone"), true);
    assert.equal(mentionsEveryone("email me at admin@everyone.test"), false);
  });

  it("normalizes markdown-escaped underscores in user handles", () => {
    assert.deepEqual(extractMentionHandles("Please ask @dev\\_5 and @other-user"), ["dev_5", "other-user"]);
  });
});
