export const KEYBOARD_SHORTCUT_GROUPS = [
  {
    label: "Navigation",
    shortcuts: [
      { keys: ["⌘ / Ctrl", "F"], description: "Focus workspace search" },
      { keys: ["⌘ / Ctrl", "⇧", "M"], description: "Start a new direct message" },
      { keys: ["⌘ / Ctrl", "⇧", "O"], description: "Browse public channels" },
      { keys: ["⌘ / Ctrl", "⇧", "C"], description: "Create a new channel" },
      { keys: ["⌘ / Ctrl", "⇧", "Space"], description: "Focus the message composer" },
      { keys: ["⌘ / Ctrl", "⇧", "H"], description: "Go to Home" },
      { keys: ["⌘ / Ctrl", "⇧", "D"], description: "Go to Direct messages" },
      { keys: ["⌘ / Ctrl", "⇧", "A"], description: "Go to Activity" },
      { keys: ["⌘ / Ctrl", "⇧", "S"], description: "Go to Saved messages" },
      { keys: ["⌘ / Ctrl", ","], description: "Open Settings" },
    ],
  },
  {
    label: "Message actions",
    shortcuts: [
      { keys: ["Enter"], description: "Open actions for the focused message" },
    ],
  },
];
