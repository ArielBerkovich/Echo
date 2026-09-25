import { useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../lib/i18n.js";
import {
  detectCurrentChromiumBrowser,
  MIN_CHROMIUM_MAJOR,
} from "../lib/browserCompatibility.js";

export default function BrowserCompatibilityNotice() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const browser = detectCurrentChromiumBrowser();

  if (dismissed || !browser || browser.major >= MIN_CHROMIUM_MAJOR) return null;

  return (
    <aside className="browser-warning" role="alert">
      <div className="browser-warning-copy">
        <strong>{t("browserUpdateRequired")}</strong>
        <span>
          {t("browserUpdateHint").replace("{browser}", browser.name).replace("{version}", String(browser.major)).replace("{minimum}", String(MIN_CHROMIUM_MAJOR))}
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
        <span>{t("preferApp")}</span>
        <strong>{t("downloadEchoApp")}</strong>
      </a>
      <button type="button" onClick={() => setDismissed(true)} aria-label={t("dismissBrowserWarning")}>
        {t("dismiss")}
      </button>
    </aside>
  );
}
