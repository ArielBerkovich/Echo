import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getWhatsNewRelease,
  getWhatsNewReleases,
  hasSeenWhatsNew,
  isNativeDesktop,
  isWhatsNewPreview,
  markWhatsNewSeen,
  whatsNewStorageKey,
} from "./whatsNew.js";

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

function installBrowser({ version = "0.38.0", values = {} } = {}) {
  const storage = new Map(Object.entries(values));
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  } as Storage;
  globalThis.window = { echoDesktopConfig: { appVersion: version } } as Window & typeof globalThis;
  return storage;
}

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
});

describe("What's new release content", () => {
  it("matches authored content to the desktop version", () => {
    assert.equal(getWhatsNewRelease("0.38.0")?.id, "0.38.0");
    assert.deepEqual(
      getWhatsNewRelease("0.39.0")?.items.map(({ title }) => title),
      ["Groups", "Channel renames", "Outdated browser warnings"],
    );
    assert.equal(getWhatsNewRelease("9.9.9"), null);
  });

  it("provides the upcoming release in browser preview mode", () => {
    installBrowser();
    globalThis.window = { location: { search: "?whats-new-preview=1" } } as Window & typeof globalThis;
    assert.equal(isWhatsNewPreview(), true);
    assert.deepEqual(getWhatsNewReleases("0.38.0", true).map(({ id }) => id), ["0.39.0"]);
  });

  it("only treats the native renderer as a desktop app", () => {
    installBrowser();
    assert.equal(isNativeDesktop(), true);
    globalThis.window = {} as Window & typeof globalThis;
    assert.equal(isNativeDesktop(), false);
  });

  it("persists seen state per release", () => {
    const storage = installBrowser();
    const key = whatsNewStorageKey("0.38.0");
    assert.equal(hasSeenWhatsNew("0.38.0"), false);
    markWhatsNewSeen("0.38.0");
    assert.equal(storage.get(key), "true");
    assert.equal(hasSeenWhatsNew("0.38.0"), true);
    assert.equal(hasSeenWhatsNew("0.39.0"), false);
  });
});
