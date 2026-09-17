export type WhatsNewEntry = {
  version: string;
  title: string;
  items: string[];
};

// Keep entries in release order. Older entries remain here so users who skip
// versions can catch up after a later desktop update.
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: "0.37.0",
    title: "A smoother Echo experience",
    items: [
      "Improved message actions and search presentation.",
      "More reliable desktop session recovery and updates.",
    ],
  },
];

function parseVersion(version: string) {
  const match = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function whatsNewSince(previousVersion: string, currentVersion: string) {
  if (compareVersions(previousVersion, currentVersion) === null) return [];
  return WHATS_NEW.filter((entry) => {
    const afterPrevious = compareVersions(entry.version, previousVersion);
    const atOrBeforeCurrent = compareVersions(entry.version, currentVersion);
    return afterPrevious !== null && atOrBeforeCurrent !== null && afterPrevious > 0 && atOrBeforeCurrent <= 0;
  });
}
