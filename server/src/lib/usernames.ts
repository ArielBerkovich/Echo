// Convert a person's name into the handle format used by Echo.
export function usernameFromName(firstName: string, lastName: string): string {
  const normalized = `${firstName} ${lastName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  return normalized.slice(0, 32).replace(/\.+$/g, "") || "user";
}

export function usernameCandidate(base: string, suffix: number): string {
  if (suffix === 0) return base;
  const suffixText = String(suffix);
  return `${base.slice(0, 32 - suffixText.length)}${suffixText}`;
}
