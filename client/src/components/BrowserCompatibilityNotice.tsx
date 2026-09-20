import { useState } from "react";
import {
  detectCurrentChromiumBrowser,
  MIN_CHROMIUM_MAJOR,
} from "../lib/browserCompatibility.js";

export default function BrowserCompatibilityNotice() {
  const [dismissed, setDismissed] = useState(false);
  const browser = detectCurrentChromiumBrowser();

  if (dismissed || !browser || browser.major >= MIN_CHROMIUM_MAJOR) return null;

  return (
    <aside className="browser-warning" role="alert">
      <div className="browser-warning-copy">
        <strong>Update {browser.name} for the best Echo experience</strong>
        <span>
          This browser is version {browser.major}. Echo recommends Chromium {MIN_CHROMIUM_MAJOR} or newer;
          some interface features may not render correctly.
        </span>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss browser compatibility warning">
        Dismiss
      </button>
    </aside>
  );
}
