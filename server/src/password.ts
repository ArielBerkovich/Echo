// Single source of truth for password strength. Returns a human-readable
// reason the password is too weak, or null when it's acceptable.
export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 8) return "Password must be at least 8 characters";
  if (!/[a-z]/.test(s)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(s)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(s)) return "Password must include a number";
  return null;
}
