import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuoteMarkdown, neutralizeMentions } from "./quote.js";
import { translations } from "./i18n.js";

describe("neutralizeMentions", () => {
  it("breaks mention triggers without changing visible text", () => {
    assert.equal(neutralizeMentions("@alice and @everyone"), "@\u2060alice and @\u2060everyone");
    assert.equal(neutralizeMentions("mail me at admin@example.com"), "mail me at admin@\u2060example.com");
  });
});

describe("buildQuoteMarkdown", () => {
  it("includes the author attribution and quotes bodies without active mention triggers", () => {
    const markdown = buildQuoteMarkdown({
      author: { displayName: "Alice Test" },
      body: [
        "Hello @bob.builder",
        "",
        "Please check @everyone and the deployment notes.",
      ].join("\n"),
    });

    assert.equal(
      markdown,
      [
        "> Alice Test said:",
        "> Hello @\u2060bob.builder",
        "> ",
        "> Please check @\u2060everyone and the deployment notes.",
        "",
        "",
      ].join("\n")
    );
  });

  it("uses a natural, gender-neutral Hebrew attribution in the Hebrew interface", () => {
    const markdown = buildQuoteMarkdown({
      author: { displayName: "דנה" },
      body: "שלום @everyone",
    }, translations.he.quoteAttribution);

    assert.equal(markdown, "> מאת דנה:\n> שלום @\u2060everyone\n\n");
  });
});
