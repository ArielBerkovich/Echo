// Screen effects triggered by certain emojis in a message.
// First matching trigger wins. Effects are dispatched as a window event that
// the <EmojiEffects/> overlay listens for, so any component can fire one.
const TRIGGERS = [
  { type: "confetti", emojis: ["🎉", "🥳", "🎊"] },
  { type: "rocket", emojis: ["🚀"] },
  { type: "hearts", emojis: ["❤️", "❤", "😍", "🥰", "💕", "💖", "💗"] },
  { type: "fire", emojis: ["🔥"] },
];

function effectForText(text) {
  const emoji = String(text || "").trim();
  if (!emoji) return null;
  for (const t of TRIGGERS) {
    if (t.emojis.includes(emoji)) return t.type;
  }
  return null;
}

let lastFired = 0;

// Fire the matching effect for a message body, throttled so a burst of messages
// doesn't flood the screen.
export function playEmojiEffectFor(text) {
  const type = effectForText(text);
  if (!type) return;
  const now = Date.now();
  if (now - lastFired < 1500) return;
  lastFired = now;
  window.dispatchEvent(new CustomEvent("echo:effect", { detail: { type } }));
}
