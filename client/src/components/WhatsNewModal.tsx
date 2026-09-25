import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import Modal, { ModalActions } from "./Modal.js";
import {
  getWhatsNewRelease,
  getWhatsNewReleases,
  hasSeenWhatsNew,
  isNativeDesktop,
  isWhatsNewPreview,
  markWhatsNewSeen,
} from "../lib/whatsNew.js";
import { useI18n } from "../lib/i18n.js";

function hasSeenLegacyUpdateNotice(version: string) {
  try {
    return localStorage.getItem(`echo.desktop-update-notice.v1.${version}`) === "true";
  } catch {
    return false;
  }
}

export default function WhatsNewModal() {
  const { t } = useI18n();
  const appVersion = window.echoDesktopConfig?.appVersion || "";
  const nativeDesktop = isNativeDesktop();
  // Preview mode is intentionally latched for this mount. App startup may
  // replace the query string while restoring the active conversation.
  const [preview] = useState(() => isWhatsNewPreview());
  const releases = getWhatsNewReleases(appVersion, preview);
  const release = preview ? releases[0] || null : getWhatsNewRelease(appVersion);
  const hasUpdateNotice = Boolean(
    nativeDesktop
    && appVersion
    && window.echoDesktopConfig?.wasUpdated
    && !release
    && !hasSeenLegacyUpdateNotice(appVersion)
  );
  const [open, setOpen] = useState(() => Boolean(
    preview
    || (nativeDesktop
      && window.echoDesktopConfig?.wasUpdated
      && (release ? !hasSeenWhatsNew(release.id) : hasUpdateNotice))
  ));
  const [expandedIds, setExpandedIds] = useState(() => new Set(releases.map(({ id }) => id)));

  if (!open) return null;

  if (!release) {
    if (!hasUpdateNotice) return null;

    function closeLegacyNotice() {
      try {
        localStorage.setItem(`echo.desktop-update-notice.v1.${appVersion}`, "true");
      } catch {
        // Keep the notice usable when storage is unavailable.
      }
      setOpen(false);
    }

    return (
      <Modal title={t("echoUpdated")} className="update-confirmation-modal" onClose={closeLegacyNotice} onPointerDownOutside={(event) => event.preventDefault()}>
        <p className="update-confirmation-version">{t("echoUpdatedVersion").replace("{version}", appVersion)}</p>
        <ModalActions>
          <button type="button" className="btn-primary" onClick={closeLegacyNotice}>{t("ok")}</button>
        </ModalActions>
      </Modal>
    );
  }

  function close() {
    if (!preview) releases.forEach(({ id }) => markWhatsNewSeen(id));
    setOpen(false);
  }

  return (
    <Modal title={preview ? t("whatsNew") : t("welcomeToEcho").replace("{version}", release.id)} className="whats-new-modal" onClose={close} onPointerDownOutside={(event) => event.preventDefault()}>
      <div className="whats-new-items">
        {releases.map((releaseItem, index) => {
          const expanded = expandedIds.has(releaseItem.id);
          return (
            <section className={`whats-new-release${expanded ? " expanded" : ""}`} key={releaseItem.id}>
              <button
                type="button"
                className="whats-new-release-toggle"
                aria-expanded={expanded}
                data-testid={`whats-new-release-${releaseItem.id}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedIds((current) => {
                    const next = new Set(current);
                    if (next.has(releaseItem.id)) next.delete(releaseItem.id);
                    else next.add(releaseItem.id);
                    return next;
                  });
                }}
              >
                <span className="whats-new-release-heading">
                  <span className="whats-new-release-version">
                    <strong>{t("version").replace("{version}", releaseItem.id)}</strong>
                    {index === 0 && <small>{t("latest")}</small>}
                  </span>
                  <span className="whats-new-release-summary">{releaseItem.summary}</span>
                </span>
                <ChevronDownIcon className="whats-new-release-chevron" size={19} strokeWidth={2} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="whats-new-release-content">
                  <div className="whats-new-feature-grid">
                    {releaseItem.items.map((item) => (
                      <article
                        className={`whats-new-item whats-new-item-${item.category.toLowerCase()}`}
                        key={`${releaseItem.id}-${item.title}`}
                      >
                        <span className="whats-new-item-badge">{item.category}</span>
                        <h4>{item.title}</h4>
                        {item.description && <p>{item.description}</p>}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
