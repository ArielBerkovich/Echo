import { readString, writeString } from "./storage.js";

const ENABLED_KEY = "echo.messageSounds.enabled";
const SOUND_KEY = "echo.messageSounds.sound";
const DEFAULT_SOUND_ID = "soft-chime";
const COOLDOWN_MS = 1000;

export const MESSAGE_SOUNDS = [
  {
    id: "soft-chime",
    label: "Soft chime",
    description: "A subtle, clear notification chime.",
    url: new URL("../assets/sounds/soft-chime.wav", import.meta.url).href,
  },
  {
    id: "bright-pop",
    label: "Bright pop",
    description: "A short, crisp message pop.",
    url: new URL("../assets/sounds/bright-pop.wav", import.meta.url).href,
  },
  {
    id: "warm-bell",
    label: "Warm bell",
    description: "A gentle bell with a warmer decay.",
    url: new URL("../assets/sounds/warm-bell.wav", import.meta.url).href,
  },
];

let lastPlayedAt = 0;
let unlockInstalled = false;

export function messageSoundsEnabled() {
  return readString(ENABLED_KEY, "on") !== "off";
}

export function setMessageSoundsEnabled(enabled) {
  writeString(ENABLED_KEY, enabled ? "on" : "off");
}

export function selectedMessageSound() {
  const selected = readString(SOUND_KEY, DEFAULT_SOUND_ID);
  return MESSAGE_SOUNDS.some((sound) => sound.id === selected) ? selected : DEFAULT_SOUND_ID;
}

export function setSelectedMessageSound(soundId) {
  if (!MESSAGE_SOUNDS.some((sound) => sound.id === soundId)) return false;
  writeString(SOUND_KEY, soundId);
  return true;
}

function soundById(soundId) {
  return MESSAGE_SOUNDS.find((sound) => sound.id === soundId) || MESSAGE_SOUNDS[0];
}

function playAudio(soundId, volume = 1) {
  if (typeof Audio === "undefined") return false;
  try {
    const audio = new Audio(soundById(soundId).url);
    audio.volume = volume;
    const playback = audio.play();
    playback?.catch?.(() => {});
    return true;
  } catch {
    return false;
  }
}

export function previewMessageSound(soundId = selectedMessageSound()) {
  return playAudio(soundId);
}

export function playIncomingMessageSound(now = Date.now()) {
  if (!messageSoundsEnabled() || now - lastPlayedAt < COOLDOWN_MS) return false;
  const started = playAudio(selectedMessageSound());
  if (started) lastPlayedAt = now;
  return started;
}

export function shouldPlayMessageSound(message, currentUserId) {
  return Boolean(message && message.kind !== "system" && message.author?.id !== currentUserId);
}

// Browsers may reject audio before the page receives a user gesture. Prime a
// muted instance on the first ordinary click or keypress for later messages.
export function installMessageSoundUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    if (typeof Audio === "undefined") return;
    try {
      const audio = new Audio(soundById(selectedMessageSound()).url);
      audio.volume = 0;
      const playback = audio.play();
      playback?.then?.(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch?.(() => {});
    } catch {
      /* a later settings preview can still unlock audio */
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}

export function resetMessageSoundCooldownForTests() {
  lastPlayedAt = 0;
}
