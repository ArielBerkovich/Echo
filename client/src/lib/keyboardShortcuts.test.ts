import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KEYBOARD_SHORTCUT_GROUPS,
  KEYBOARD_SHORTCUTS,
  formatKeyboardShortcut,
  getKeyboardHotkeys,
  shortcutTitle,
} from "./keyboardShortcuts.js";

describe("keyboard shortcut registry", () => {
  it("keeps displayed shortcuts and runtime hotkeys together", () => {
    assert.deepEqual(getKeyboardHotkeys("new-message"), ["ctrl+shift+m", "meta+shift+m"]);
    assert.equal(formatKeyboardShortcut("new-message"), "⌘/Ctrl+⇧M");
    assert.equal(shortcutTitle("New message", "new-message"), "New message · \u2066⌘/Ctrl+⇧M\u2069");
  });

  it("exposes every registered shortcut in the settings groups", () => {
    const grouped = KEYBOARD_SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);
    assert.equal(grouped.length, KEYBOARD_SHORTCUTS.length);
    assert.deepEqual(
      new Set(grouped.map((shortcut) => shortcut.id)),
      new Set(KEYBOARD_SHORTCUTS.map((shortcut) => shortcut.id))
    );
  });

  it("documents the Electron zoom controls without registering them as web hotkeys", () => {
    const desktop = KEYBOARD_SHORTCUT_GROUPS.find((group) => group.label === "Desktop");
    assert.deepEqual(desktop.shortcuts.map((shortcut) => shortcut.id), [
      "desktop-zoom-in", "desktop-zoom-out", "desktop-zoom-reset",
    ]);
    assert.deepEqual(desktop.shortcuts.map((shortcut) => shortcut.keys), [
      ["Ctrl / ⌘", "+ / ="], ["Ctrl / ⌘", "−"], ["Ctrl / ⌘", "0"],
    ]);
    for (const shortcut of desktop.shortcuts) assert.deepEqual(getKeyboardHotkeys(shortcut.id), []);
  });
});
