import { readString, writeString } from "./storage.js";
import { isDesktopApp } from "./runtime.js";

// Desktop (Web) notifications for DMs, mentions, and VIP messages.
const PREF_KEY = "echo.notify";
const ICON = "/echo-logo.png";

export function notifySupported() {
  return isDesktopApp() || (typeof window !== "undefined" && "Notification" in window);
}
export function notifyPermission() {
  if (isDesktopApp()) return "granted";
  return notifySupported() ? Notification.permission : "denied";
}
export function notifyPref() {
  return readString(PREF_KEY) === "on";
}
export function setNotifyPref(on) {
  writeString(PREF_KEY, on ? "on" : "off");
}

// Ask the browser for permission (from a user gesture). Returns the result.
export async function requestNotifyPermission() {
  if (!notifySupported()) return "denied";
  if (isDesktopApp()) return "granted";
  let p = Notification.permission;
  if (p === "default") p = await Notification.requestPermission();
  return p;
}

// Notifications fire only when enabled in settings AND permission is granted.
export function notificationsActive() {
  return notifySupported() && (isDesktopApp() || Notification.permission === "granted") && notifyPref();
}

// Show one notification; clicking it focuses the app and runs onClick (e.g. to
// jump to the conversation). `tag` collapses repeats from the same conversation.
export function showNotification(title, { body, tag, onClick } = {}) {
  if (!notificationsActive()) return;
  try {
    if (isDesktopApp()) {
      window.electron?.notify(title, body, tag);
      return;
    }
    const opts = { body, icon: ICON };
    if (tag) {
      opts.tag = tag;
      opts.renotify = true; // re-alert for a new message in the same conversation
    }
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      n.close();
      onClick?.();
    };
  } catch {
    /* notifications unavailable — ignore */
  }
}

// Fire a sample notification regardless of focus, for the Settings "test" button.
export function showTestNotification() {
  if (!notificationsActive()) return false;
  showNotification("Echo notifications work 🎉", {
    body: "You'll be alerted about DMs, @mentions, and VIP messages.",
  });
  return true;
}
