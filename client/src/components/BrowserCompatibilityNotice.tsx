import { useState } from "react";
import { useNavigate } from "react-router";
import {
  detectCurrentChromiumBrowser,
  MIN_CHROMIUM_MAJOR,
} from "../lib/browserCompatibility.js";

export default function BrowserCompatibilityNotice() {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const browser = detectCurrentChromiumBrowser();

  if (dismissed || !browser || browser.major >= MIN_CHROMIUM_MAJOR) return null;

  return (
    <aside className="browser-warning" role="alert">
      <div className="browser-warning-copy">
        <strong>Browser update required</strong>
        <span>
          {browser.name} {browser.major} is below Echo’s supported Chromium version ({MIN_CHROMIUM_MAJOR}+).
          Some features may not work correctly until you update.
        </span>
      </div>
      <a
        className="browser-warning-download"
        href="/settings/desktop"
        onClick={(event) => {
          event.preventDefault();
          setDismissed(true);
          navigate("/settings/desktop");
        }}
      >
        <span>Prefer an app?</span>
        <strong>Download Echo native app</strong>
      </a>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss browser compatibility warning">
        Dismiss
      </button>
    </aside>
  );
}
