import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { playEmojiEffectFor } from "./emojiEffects.js";

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

describe("playEmojiEffectFor", () => {
  let events;
  let now;
  let baseNow = 10_000;
  const originalDateNow = Date.now;
  const originalWindow = globalThis.window;
  const originalCustomEvent = globalThis.CustomEvent;

  beforeEach(() => {
    events = [];
    baseNow += 10_000;
    now = baseNow;
    Date.now = () => now;
    globalThis.CustomEvent = TestCustomEvent;
    globalThis.window = {
      dispatchEvent(event) {
        events.push(event);
      },
    };
  });

  it("dispatches an effect for a standalone trigger emoji", () => {
    playEmojiEffectFor("🎉");

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "echo:effect");
    assert.deepEqual(events[0].detail, { type: "confetti" });
  });


  it("ignores trigger emojis mixed with text or other emojis", () => {
    playEmojiEffectFor("ship it 🚀");
    playEmojiEffectFor("❤️ thanks");
    playEmojiEffectFor("🚀 🎉");

    assert.deepEqual(events, []);
  });

  it("does nothing when text has no trigger emoji", () => {
    playEmojiEffectFor("plain message");

    assert.deepEqual(events, []);
  });

  it("throttles repeated effects for short bursts", () => {
    playEmojiEffectFor("🚀");
    playEmojiEffectFor("🔥");
    now += 1500;
    playEmojiEffectFor("🔥");

    assert.deepEqual(events.map((event) => event.detail.type), ["rocket", "fire"]);
  });

  it("treats common heart variants as heart effects", () => {
    now += 2000;
    playEmojiEffectFor("❤️");

    assert.deepEqual(events.map((event) => event.detail.type), ["hearts"]);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
  });
});
