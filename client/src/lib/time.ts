// Shared date/time formatting helpers. All are forgiving: a bad/missing input
// yields an empty string rather than throwing.

const TIME = { hour: "2-digit", minute: "2-digit" };

// "3:42 PM" — used for message timestamps.
export function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], TIME);
  } catch {
    return "";
  }
}

// "Jun 4, 3:42 PM" — used in activity/search feeds. Pass a locale when a
// screen needs stable wording instead of the device's locale.
export function formatDateTime(iso, locale = []) {
  try {
    return new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", ...TIME });
  } catch {
    return "";
  }
}

// "Jun 4, 2026" — used for "created on" dates.
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
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
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
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

// Compact, recency-aware label for conversation lists ("now", "5 min", time,
// "Yesterday", or a date).
export function relativeTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return "";
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return d.toLocaleTimeString([], TIME);
  if (diff < 172800) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
