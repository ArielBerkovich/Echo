export type WhatsNewItem = {
  title: string;
  description: string;
  category: "New" | "Improved" | "Fixed";
};

export type WhatsNewRelease = {
  id: string;
  title: string;
  summary: string;
  items: WhatsNewItem[];
};

// Keep release notes in the renderer so they work for air-gapped deployments
// and always match the desktop binary that shipped them.
const RELEASES: Record<string, WhatsNewRelease> = {
  "0.39.0": {
    id: "0.39.0",
    title: "What's new in 0.39.0",
    summary: "Three focused updates for your everyday work in Echo.",
    items: [
      {
        title: "Groups",
        description: "Create and manage Echo groups for the people you work with.",
        category: "New",
      },
      {
        title: "Channel renames",
        description: "Channel managers can rename channels.",
        category: "New",
      },
      {
        title: "Outdated browser warnings",
        description: "Echo now warns users about outdated Chromium browsers.",
        category: "New",
      },
    ],
  },
};

// Preview content lets the release flow be reviewed in a regular browser
// before the native desktop version is published.
const PREVIEW_RELEASES: WhatsNewRelease[] = [RELEASES["0.39.0"]];

export function isNativeDesktop() {
  return typeof window !== "undefined" && Boolean(window.echoDesktopConfig?.appVersion);
}

export function isWhatsNewPreview() {
  return typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("whats-new-preview") === "1";
}

export function getWhatsNewRelease(version = "") {
  return RELEASES[version] || null;
}

export function getWhatsNewReleases(version = "", preview = false) {
  if (preview) return PREVIEW_RELEASES;
  const release = getWhatsNewRelease(version);
  return release ? [release] : [];
}

export function whatsNewStorageKey(releaseId: string) {
  return `echo.whats-new.seen.v1.${releaseId}`;
}

export function hasSeenWhatsNew(releaseId: string) {
  try {
    return localStorage.getItem(whatsNewStorageKey(releaseId)) === "true";
  } catch {
    return false;
  }
}

export function markWhatsNewSeen(releaseId: string) {
  try {
    localStorage.setItem(whatsNewStorageKey(releaseId), "true");
  } catch {
    // The modal remains usable when storage is unavailable.
  }
}
