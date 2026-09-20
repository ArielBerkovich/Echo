import { useState } from "react";

const MIN_CHROMIUM_MAJOR = 111;

function chromiumBrowser() {
  const userAgent = navigator.userAgent;
  // iOS browsers expose Chromium-like product tokens but all use WebKit.
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)) return null;

  const match = userAgent.match(/(Edg|OPR|Vivaldi|SamsungBrowser|Chromium|HeadlessChrome|Chrome)\/(\d+)/i);
  if (!match) return null;

  const token = match[1].toLowerCase();
  const name = token === "edg"
    ? "Microsoft Edge"
    : token === "opr"
      ? "Opera"
      : token === "chromium"
        ? "Chromium"
        : token === "vivaldi"
          ? "Vivaldi"
          : token === "samsungbrowser"
            ? "Samsung Internet"
            : "Chrome";
  return { name, major: Number(match[2]) };
}

export default function BrowserCompatibilityNotice() {
  const [dismissed, setDismissed] = useState(false);
  const browser = chromiumBrowser();

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
