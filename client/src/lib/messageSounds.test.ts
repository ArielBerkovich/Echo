import test from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_SOUNDS,
  NONE_SOUND_ID,
  messageSoundsEnabled,
  playIncomingMessageSound,
  previewMessageSound,
  resetMessageSoundCooldownForTests,
  selectedMessageSound,
  shouldPlayMessageSound,
  setMessageSoundsEnabled,
  setSelectedMessageSound,
} from "./messageSounds.js";

function withStorage(fn) {
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try { fn(values); } finally { globalThis.localStorage = previousStorage; }
}

test("message sounds default on with the soft chime selected", () => withStorage(() => {
  assert.equal(messageSoundsEnabled(), true);
  assert.equal(selectedMessageSound(), "soft-chime");
  assert.deepEqual(MESSAGE_SOUNDS.map((sound) => sound.id), [NONE_SOUND_ID, "bright-pop", "short-alert", "clear-ding", "soft-chime", "warm-bell"]);
  assert.equal(MESSAGE_SOUNDS[0].url, null);
  assert.ok(MESSAGE_SOUNDS.slice(1).every((sound) => sound.url.endsWith(".wav")));
}));

test("message sound preferences persist and reject unknown sounds", () => withStorage(() => {
  setMessageSoundsEnabled(false);
  assert.equal(messageSoundsEnabled(), false);
  assert.equal(selectedMessageSound(), NONE_SOUND_ID);
  assert.equal(setSelectedMessageSound(NONE_SOUND_ID), true);
  assert.equal(messageSoundsEnabled(), false);
  assert.equal(setSelectedMessageSound("warm-bell"), true);
  assert.equal(selectedMessageSound(), "warm-bell");
  assert.equal(setSelectedMessageSound("unknown"), false);
  assert.equal(selectedMessageSound(), "warm-bell");
}));

test("incoming playback respects the one-second cooldown while previews do not", () => withStorage(() => {
  const played = [];
  const previousAudio = globalThis.Audio;
  globalThis.Audio = class {
    constructor(url) { this.url = url; }
    play() { played.push(this.url); return Promise.resolve(); }
  };
  try {
    resetMessageSoundCooldownForTests();
    assert.equal(playIncomingMessageSound(1000), true);
    assert.equal(playIncomingMessageSound(1500), false);
    assert.equal(playIncomingMessageSound(2000), true);
    assert.equal(previewMessageSound("bright-pop"), true);
    assert.equal(played.length, 3);
  } finally {
    globalThis.Audio = previousAudio;
  }
}));

test("only incoming authored messages qualify for sound", () => {
  assert.equal(shouldPlayMessageSound({ kind: "user", author: { id: "other" } }, "me"), true);
  assert.equal(shouldPlayMessageSound({ kind: "user", author: { id: "me" } }, "me"), false);
  assert.equal(shouldPlayMessageSound({ kind: "system", author: { id: "other" } }, "me"), false);
});
