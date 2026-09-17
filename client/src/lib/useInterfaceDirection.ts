import { useEffect, useState } from "react";
import { readString, writeString } from "./storage.js";

export type InterfaceDirectionPreference = "ltr" | "rtl";
export type InterfaceDirection = InterfaceDirectionPreference;

const STORAGE_KEY = "echo.interfaceDirection";

function readPreference(): InterfaceDirectionPreference {
  const value = readString(STORAGE_KEY);
  // Migrate the former automatic mode to the new LTR default.
  return value === "rtl" ? "rtl" : "ltr";
}

export function useInterfaceDirection() {
  const [preference, setPreference] = useState<InterfaceDirectionPreference>(readPreference);
  const direction = preference;

  useEffect(() => {
    document.documentElement.dataset.interfaceDirection = direction;
    writeString(STORAGE_KEY, preference);
  }, [direction, preference]);

  return { preference, direction, setPreference };
}
