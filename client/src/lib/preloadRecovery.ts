export const PRELOAD_RELOAD_KEY = "echo:preload-reload-attempted";

export function claimPreloadReload(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  try {
    if (storage.getItem(PRELOAD_RELOAD_KEY)) return false;
    storage.setItem(PRELOAD_RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
