import { useEffect, useState } from "react";
import { readString, writeString } from "./storage.js";

export type InterfaceDirectionPreference = "auto" | "ltr" | "rtl";
export type InterfaceDirection = Exclude<InterfaceDirectionPreference, "auto">;

const STORAGE_KEY = "echo.interfaceDirection";
const RTL_LOCALES = /^(ar|fa|he|iw|ku|ps|ur)(-|$)/i;

function preferredDirection(): InterfaceDirection {
  if (typeof navigator !== "undefined" && RTL_LOCALES.test(navigator.language || "")) return "rtl";
  return "ltr";
}

function readPreference(): InterfaceDirectionPreference {
  const value = readString(STORAGE_KEY);
  return value === "ltr" || value === "rtl" || value === "auto" ? value : "auto";
}

export function useInterfaceDirection() {
  const [preference, setPreference] = useState<InterfaceDirectionPreference>(readPreference);
  const direction = preference === "auto" ? preferredDirection() : preference;

  useEffect(() => {
    document.documentElement.dataset.interfaceDirection = direction;
    // Keep the document's semantic bidi direction in sync with the visual
    // preference. This lets native HTML direction inheritance, `:dir()` and
    // `dir="auto"` work consistently without component-specific overrides.
    document.documentElement.setAttribute("dir", direction);
    writeString(STORAGE_KEY, preference);
  }, [direction, preference]);

  return { preference, direction, setPreference };
}
