// Mirrors the server's password policy so the signup form can give instant
// feedback. Returns a reason the password is too weak, or null when it's fine.
export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 8) return "Password must be at least 8 characters";
  if (!/[a-z]/.test(s)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(s)) return "Password must include an uppercase letter";
  if (!/[0-9]/.test(s)) return "Password must include a number";
  return null;
}

export const PASSWORD_RULE = "At least 8 characters with uppercase, lowercase, and a number.";
