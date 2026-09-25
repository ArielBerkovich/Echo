import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { translations } from "./i18n.js";

describe("Hebrew survey translations", () => {
  it("uses gender-neutral saving and natural vote-count forms", () => {
    assert.equal(translations.he.savingVote, "ההצבעה נשמרת");
    assert.equal(translations.he.surveyVoteCountOne, "הצבעה אחת");
    assert.equal(translations.he.surveyVoteCountMany.replace("{count}", "2"), "2 הצבעות");
    assert.equal(translations.he.surveyVoteCountMany.replace("{count}", "5"), "5 הצבעות");
  });
});
