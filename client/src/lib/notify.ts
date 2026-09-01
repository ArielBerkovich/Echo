import { readString, writeString } from "./storage.js";

// Desktop (Web) notifications for DMs, mentions, and Starred messages.
const PREF_KEY = "echo.notify";
const ICON = "/echo-logo.png";
const desktopClickHandlers = new Map();
let desktopClickListenerReady = false;

// Notification bodies should read like short native alerts, not raw Markdown.
export function notificationPreview(value, limit = 160) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function desktopNotifications() {
  return typeof window !== "undefined" ? window.echoDesktopNotifications : undefined;
}

function ensureDesktopClickListener() {
  const desktop = desktopNotifications();
  if (!desktop || desktopClickListenerReady) return;
  desktopClickListenerReady = true;
  desktop.onNotificationClick((id) => {
    const onClick = desktopClickHandlers.get(id);
    desktopClickHandlers.delete(id);
    onClick?.();
  });
}

export function notifySupported() {
  return Boolean(desktopNotifications()) || (typeof window !== "undefined" && "Notification" in window);
}
export function notifyPermission() {
  if (desktopNotifications()) return "granted";
  return notifySupported() ? Notification.permission : "denied";
}
export function notifyPref() {
  // Notifications are opt-out: an unset preference is the default-on state.
  // Keep an explicit "off" value so users can still disable them from Settings.
  return readString(PREF_KEY, "on") !== "off";
}
export function setNotifyPref(on) {
  writeString(PREF_KEY, on ? "on" : "off");
}

// Ask the browser for permission (from a user gesture). Returns the result.
export async function requestNotifyPermission() {
  if (desktopNotifications()) return "granted";
  if (!notifySupported()) return "denied";
  let p = Notification.permission;
  if (p === "default") p = await Notification.requestPermission();
  return p;
}

// Notifications fire only when enabled in settings AND permission is granted.
export function notificationsActive() {
  return notifySupported() && notifyPermission() === "granted" && notifyPref();
}

// Show one notification; clicking it focuses the app and runs onClick (e.g. to
// jump to the conversation). `tag` collapses repeats from the same conversation.
export function showNotification(title, { body, tag, onClick } = {}) {
  if (!notificationsActive()) return false;

  const desktop = desktopNotifications();
  if (desktop) {
    ensureDesktopClickListener();
    const id = desktop.showNotification({ title, body, tag });
    if (onClick && id) {
      desktopClickHandlers.set(id, onClick);
      // The main process drops notifications after five seconds. Avoid
      // retaining a navigation callback if the user never clicks it.
      window.setTimeout(() => desktopClickHandlers.delete(id), 6000);
    }
    return true;
  }

  try {
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
    return true;
  } catch {
    /* notifications unavailable — ignore */
    return false;
  }
}

// Fire a sample notification regardless of focus, for the Settings "test" button.
export function showTestNotification() {
  if (!notificationsActive()) return false;
  showNotification("Echo notifications work 🎉", {
    body: "You'll be alerted about DMs, @mentions, and Starred messages.",
  });
  return true;
}
