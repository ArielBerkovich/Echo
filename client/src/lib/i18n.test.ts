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

describe("Hebrew emoji picker translations", () => {
  it("keeps Emoji Mart locale labels in the central translation map", () => {
    assert.equal(translations.he.emojiMart.categories.people, "סמיילי ואנשים");
    assert.equal(translations.he.emojiMart.categories.frequent, "אחרונים");
    assert.equal(translations.en.emojiMart.categories.people, "Smileys & People");
  });

  it("translates the reaction picker actions", () => {
    assert.equal(translations.he.moreEmojis, "עוד אימוג׳ים");
    assert.equal(translations.he.chooseReaction, "בחירת תגובה");
    assert.equal(translations.he.addCustomEmoji, "הוספת אימוג׳י מותאם אישית");
  });

  it("uses a translated name in the custom emoji usage hint", () => {
    assert.equal(
      translations.he.emojiUsageHint.replace("{name}", translations.he.name),
      "יש להקליד :שם: בהודעה כדי להשתמש בו."
    );
  });
});

describe("Hebrew admin and reaction translations", () => {
  it("uses neutral, singular admin copy and localized reaction wording", () => {
    assert.equal(translations.he.workspaceIdentity, "פרטי סביבת העבודה");
    assert.equal(translations.he.integrationsTitle, "אינטגרציות ואפליקציות מחוברות");
    assert.equal(translations.he.configure, "הגדרה");
    assert.equal(translations.he.connect, "חיבור");
    assert.equal(translations.he.moreMessageActions, "פעולות נוספות");
    assert.equal(translations.he.available, "לשימוש");
    assert.equal(translations.he.disabled, "במצב לא פעיל");
    assert.equal(translations.he.youReactedWith.replace("{emoji}", "🎉"), "הגבת באמצעות 🎉");
    assert.equal(
      translations.he.oneOtherReactedWithYou.replace("{name}", "דנה").replace("{emoji}", "🎉"),
      "תגובה שלך ושל דנה באמצעות 🎉"
    );
    assert.equal(
      translations.he.othersReactedWithYou.replace("{names}", "דנה ויוסי").replace("{emoji}", "🎉"),
      "דנה ויוסי הגיבו יחד איתך באמצעות 🎉"
    );
    assert.equal(
      translations.he.reactionByWithEmoji.replace("{who}", "דנה").replace("{emoji}", "🎉"),
      "תגובה של דנה באמצעות 🎉"
    );
  });
});

describe("Hebrew scheduled message translations", () => {
  it("translates the scheduling form and scheduled-message preview labels", () => {
    assert.equal(translations.he.scheduleHint, "אפשר לבחור אפשרות מהירה או להגדיר זמן מדויק. Echo משתמש בשעה המקומית שלך.");
    assert.equal(translations.he.customDateAndTime, "בחירת תאריך ושעה");
    assert.equal(translations.he.scheduleAction, "תזמון");
    assert.equal(translations.he.scheduledMessageSingular, "הודעה מתוזמנת אחת");
    assert.equal(translations.he.scheduledMessagesPlural.replace("{count}", "3"), "3 הודעות מתוזמנות");
    assert.equal(translations.he.scheduledForTarget.replace("{target}", translations.he.thisChannel), "עבור הערוץ הזה");
    assert.equal(translations.he.pickFutureTime, "יש לבחור שעה בעתיד.");
    assert.equal(translations.he.writeBeforeScheduling, "יש לכתוב הודעה לפני התזמון.");
  });
});

describe("Hebrew starred navigation translation", () => {
  it("keeps the Starred section distinct from saved messages", () => {
    assert.equal(translations.he.starred, "מועדפים");
    assert.equal(translations.he.savedMessages, "הודעות שמורות");
  });
});

describe("Hebrew user profile translations", () => {
  it("uses gender-neutral presence labels and translates the message action", () => {
    assert.equal(translations.he.online, "אונליין");
    assert.equal(translations.he.offline, "אופליין");
    assert.equal(translations.he.message, "שליחת הודעה");
  });
});
