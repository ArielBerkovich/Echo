import { useAuthUrl } from "../lib/useAuthUrl.js";

// Deterministic colored avatar built from a person's initials.
const PALETTE = [
  "#2563eb", "#0891b2", "#7c3aed", "#db2777", "#ea580c",
  "#16a34a", "#0d9488", "#4f46e5", "#c026d3", "#dc2626",
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name = "?", size = 36, src = null }) {
  const authSrc = useAuthUrl(src);
  // Uploaded profile picture takes precedence over the initials fallback.
  if (src && authSrc) {
    return (
      <img
        className="avatar avatar-img"
        src={authSrc}
        alt={name}
        style={{ width: size, height: size }}
      />
    );
  }
  const color = PALETTE[hashString(name) % PALETTE.length];
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.4,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
