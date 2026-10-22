export function parsePage(value: unknown, maximum = 10_000): number | null {
  if (value === undefined) return 0;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= maximum ? page : null;
}
