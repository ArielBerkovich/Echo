import { readString, writeString } from "./storage.js";

const AUTOCORRECT_KEY = "echo.autocorrect.enabled";
const AUTOCORRECT_EVENT = "echo-autocorrect-preference-changed";

export function autocorrectEnabled() {
  return readString(AUTOCORRECT_KEY, "on") !== "off";
}

export function setAutocorrectEnabled(enabled) {
  writeString(AUTOCORRECT_KEY, enabled ? "on" : "off");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTOCORRECT_EVENT));
}

export function onAutocorrectPreferenceChange(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTOCORRECT_EVENT, listener);
  return () => window.removeEventListener(AUTOCORRECT_EVENT, listener);
}
