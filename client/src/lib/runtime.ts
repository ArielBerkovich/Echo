// Electron exposes this marker through preload. The browser deployment remains
// zero-config while the desktop build asks for the remote Echo backend.
export function isDesktopApp() {
  return typeof window !== "undefined" && (Boolean(window.electron?.isElectron) || import.meta.env?.VITE_DESKTOP === "true");
}
