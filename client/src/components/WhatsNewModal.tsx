import { useState } from "react";
import Modal, { ModalActions } from "./Modal.js";
import {
  getWhatsNewReleases,
  hasSeenWhatsNew,
  isNativeDesktop,
  isWhatsNewPreview,
  markWhatsNewSeen,
} from "../lib/whatsNew.js";

function hasSeenLegacyUpdateNotice(version: string) {
  try {
    return localStorage.getItem(`echo.desktop-update-notice.v1.${version}`) === "true";
  } catch {
    return false;
  }
}

export default function WhatsNewModal() {
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
      <Modal title="Echo was updated" className="update-confirmation-modal" onClose={closeLegacyNotice} onPointerDownOutside={(event) => event.preventDefault()}>
        <p className="update-confirmation-version">Echo has been updated to version {appVersion}.</p>
        <ModalActions>
          <button type="button" className="btn-primary" onClick={closeLegacyNotice}>OK</button>
        </ModalActions>
      </Modal>
    );
  }

  function close() {
    if (!preview) releases.forEach(({ id }) => markWhatsNewSeen(id));
    setOpen(false);
  }

  return (
    <Modal title={preview ? "What's new in Echo" : `Welcome to Echo ${release.id}`} className="whats-new-modal" onClose={close} onPointerDownOutside={(event) => event.preventDefault()}>
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
                <span>
                  <strong>{releaseItem.id}</strong>
                  {index === 0 && <small>Latest</small>}
                </span>
                <span aria-hidden="true">{expanded ? "−" : "+"}</span>
              </button>
              {expanded && (
                <div className="whats-new-release-content">
                  {releases.length > 1 && (
                    <>
                      <h3>{releaseItem.title}</h3>
                      <p className="whats-new-summary">{releaseItem.summary}</p>
                    </>
                  )}
                  {releaseItem.items.map((item) => (
                    <article
                      className={`whats-new-item whats-new-item-${item.category.toLowerCase()}`}
                      key={`${releaseItem.id}-${item.title}`}
                    >
                      <span className="whats-new-item-badge">{item.category}</span>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
