import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authSchema,
  channelSchema,
  emojiNameSchema,
  normalizeChannelNameInput,
  normalizeEmojiNameInput,
  passwordPairSchema,
} from "./formSchemas.js";

describe("formSchemas", () => {
  it("normalizes channel and emoji names", () => {
    assert.equal(normalizeChannelNameInput("  #Team Space!  "), "team-space");
    assert.equal(normalizeEmojiNameInput(" :Party_Parrot: "), "party_parrot");
  });

  it("accepts login passwords without strength validation", () => {
    const parsed = authSchema("login").safeParse({
      username: "Ariel",
      password: "pw",
    });

    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.username, "ariel");
    }
  });

  it("enforces strong passwords during registration", () => {
    const weak = authSchema("register").safeParse({
      username: "Ariel",
      password: "pw",
      displayName: "Ariel",
    });

    assert.equal(weak.success, false);
  });

  it("validates and normalizes channels", () => {
    const parsed = channelSchema.safeParse({ name: "  My New Channel  ", type: "private" });

    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data, { name: "my-new-channel", type: "private" });
    }
  });

  it("rejects duplicate emoji names and mismatched passwords", () => {
    const emoji = emojiNameSchema([{ name: "party-parrot" }]).safeParse(" :party-parrot: ");
    assert.equal(emoji.success, false);

    const passwords = passwordPairSchema().safeParse({
      newPassword: "Password1",
      confirmPassword: "Password2",
    });
    assert.equal(passwords.success, false);
  });
});
