const SHORTCUTS = [
  { id: "focus-search", group: "Navigation", keys: ["⌘ / Ctrl", "F"], hotkeys: ["ctrl+f", "meta+f"], description: "Focus workspace search" },
  { id: "open-switcher", group: "Navigation", keys: ["⌘ / Ctrl", "K"], hotkeys: ["ctrl+k", "meta+k"], description: "Open quick switcher" },
  { id: "new-message", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "M"], hotkeys: ["ctrl+shift+m", "meta+shift+m"], description: "Start a new direct message" },
  { id: "browse-channels", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "O"], hotkeys: ["ctrl+shift+o", "meta+shift+o"], description: "Browse public channels" },
  { id: "create-channel", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "C"], hotkeys: ["ctrl+shift+c", "meta+shift+c"], description: "Create a new channel" },
  { id: "focus-composer", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "Space"], hotkeys: ["ctrl+shift+space", "meta+shift+space"], description: "Focus the message composer" },
  { id: "go-home", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "H"], hotkeys: ["ctrl+shift+h", "meta+shift+h"], description: "Go to Home" },
  { id: "go-dms", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "D"], hotkeys: ["ctrl+shift+d", "meta+shift+d"], description: "Go to Direct messages" },
  { id: "go-activity", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "A"], hotkeys: ["ctrl+shift+a", "meta+shift+a"], description: "Go to Activity" },
  { id: "go-saved", group: "Navigation", keys: ["⌘ / Ctrl", "⇧", "S"], hotkeys: ["ctrl+shift+s", "meta+shift+s"], description: "Go to Saved messages" },
  { id: "open-settings", group: "Navigation", keys: ["⌘ / Ctrl", ","], hotkeys: ["ctrl+comma", "meta+comma"], description: "Open Settings" },
  { id: "message-actions", group: "Message actions", keys: ["Enter"], description: "Open actions for the focused message" },
];

export const KEYBOARD_SHORTCUTS = SHORTCUTS;

export const KEYBOARD_SHORTCUT_GROUPS = ["Navigation", "Message actions"].map((label) => ({
  label,
  shortcuts: SHORTCUTS.filter((shortcut) => shortcut.group === label),
}));

const shortcutById = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]));

export function getKeyboardShortcut(id) {
  return shortcutById.get(id);
}

export function getKeyboardHotkeys(id) {
  return getKeyboardShortcut(id)?.hotkeys || [];
}

export function formatKeyboardShortcut(id) {
  const shortcut = getKeyboardShortcut(id);
  return shortcut?.keys
    .map((key) => key.replace("⌘ / Ctrl", "⌘/Ctrl"))
    .join("+")
    .replace("+⇧+", "+⇧") || "";
}

export function shortcutTitle(label, id) {
  const shortcut = formatKeyboardShortcut(id);
  return shortcut ? `${label} · ${shortcut}` : label;
}
