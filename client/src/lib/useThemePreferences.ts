import { useCallback, useEffect, useState } from "react";
import { readString, writeString } from "./storage.js";

export const THEMES = [
  { id: "nord", label: "Nord", swatch: ["#3b4252", "#2b303b", "#81a1c1"] },
  { id: "aubergine", label: "Aubergine", swatch: ["#5b1b42", "#f7f3f0", "#8c8580"] },
  { id: "azure", label: "Azure", swatch: ["#0d2444", "#08182e", "#2f81f7"] },
  { id: "midnight", label: "Midnight", swatch: ["#1a1640", "#15132e", "#8b5cf6"] },
  { id: "dracula", label: "Dracula", swatch: ["#343746", "#282a36", "#bd93f9"] },
  { id: "sand", label: "Sand", swatch: ["#5a4632", "#fffdf8", "#c2682a"] },
  { id: "high-contrast", label: "High contrast", swatch: ["#000000", "#ffffff", "#005fcc"] },
];

const DEFAULT_THEME = "nord";
const THEME_IDS = new Set(THEMES.map(({ id }) => id));
const LEGACY_DARK_THEMES = new Set(["azure", "midnight", "nord", "dracula"]);

function readPreferences() {
  const storedMode = readString("echo.mode");
  const storedTheme = readString("echo.theme");
  const theme = THEME_IDS.has(storedTheme) ? storedTheme : DEFAULT_THEME;

  if (storedMode === "light" || storedMode === "dark") return { theme, mode: storedMode };
  if (!storedTheme || storedTheme === "dark") return { theme: DEFAULT_THEME, mode: "dark" };
  if (storedTheme === "light") return { theme: DEFAULT_THEME, mode: "light" };
  return { theme, mode: LEGACY_DARK_THEMES.has(storedTheme) ? "dark" : "light" };
}

export function useThemePreferences() {
  const [{ theme: initialTheme, mode: initialMode }] = useState(readPreferences);
  const [theme, setTheme] = useState(initialTheme);
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    writeString("echo.theme", theme);
    writeString("echo.mode", mode);
  }, [theme, mode]);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, mode, setMode, toggleMode };
}
