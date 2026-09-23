// Shared date/time formatting helpers. All are forgiving: a bad/missing input
// yields an empty string rather than throwing.

const TIME = { hour: "2-digit", minute: "2-digit", hour12: false };

// Dates are part of Echo's interface, so they follow the language selected in
// Echo rather than whichever language the browser happens to be using.
export function interfaceLocale() {
  if (typeof document !== "undefined" && document.documentElement.dataset.language === "he") return "he-IL";
  try {
    return globalThis.localStorage?.getItem("echo.language") === "he" ? "he-IL" : "en-US";
  } catch {
    return "en-US";
  }
}

function isHebrewInterface() {
  return interfaceLocale() === "he-IL";
}

// "21:42" — used for message timestamps.
export function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(interfaceLocale(), TIME);
  } catch {
    return "";
  }
}

// "Jun 4, 21:42" — used in activity/search feeds. Pass a locale when a
// screen needs stable wording instead of the device's locale.
export function formatDateTime(iso, locale = interfaceLocale()) {
  try {
    return new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", ...TIME });
  } catch {
    return "";
  }
}

// "Jun 4, 2026" — used for "created on" dates.
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(interfaceLocale(), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// "Today" / "Yesterday" / "June 4, 2026" — day-divider label between messages.
export function formatDayDivider(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return isHebrewInterface() ? "היום" : "Today";
  if (sameDay(d, yesterday)) return isHebrewInterface() ? "אתמול" : "Yesterday";
  return d.toLocaleDateString(interfaceLocale(), { year: "numeric", month: "long", day: "numeric" });
}

// "Today", "Yesterday", or a recent weekday — used beside every thread message.
export function formatThreadDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const dayNumber = (value) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000;
  const daysAgo = dayNumber(today) - dayNumber(d);
  if (daysAgo === 0) return isHebrewInterface() ? "היום" : "Today";
  if (daysAgo === 1) return isHebrewInterface() ? "אתמול" : "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return d.toLocaleDateString(interfaceLocale(), { weekday: "long" });
  return d.toLocaleDateString(interfaceLocale(), { year: "numeric", month: "long", day: "numeric" });
}

// True when two timestamps fall on different calendar days.
export function isDifferentDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  );
}

// True when two timestamps are in the same local calendar minute.
export function isSameMinute(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  );
}

// Compact, recency-aware label for conversation lists ("now", "5 min", time,
// "Yesterday", or a date).
export function relativeTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return "";
  if (diff < 60) return isHebrewInterface() ? "עכשיו" : "now";
  if (diff < 3600) return isHebrewInterface() ? `לפני ${Math.floor(diff / 60)} דק׳` : `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return d.toLocaleTimeString(interfaceLocale(), TIME);
  if (diff < 172800) return isHebrewInterface() ? "אתמול" : "Yesterday";
  return d.toLocaleDateString(interfaceLocale(), { month: "short", day: "numeric" });
}
