import { useState } from "react";
import Modal, { ModalActions } from "./Modal.js";
import { whatsNewSince } from "../lib/whatsNew.js";

let updateNoticeClaimed = false;

export default function UpdateConfirmation() {
  const appVersion = window.echoDesktopConfig?.appVersion || "";
  const previousVersion = window.echoDesktopConfig?.previousVersion || "";
  const entries = whatsNewSince(previousVersion, appVersion);
  const storageKey = `echo.desktop-update-notice.v1.${appVersion}`;
  const [open, setOpen] = useState(() => {
    if (!window.echoDesktopConfig?.wasUpdated || !previousVersion || !appVersion || entries.length === 0 || updateNoticeClaimed) return false;
    try {
      if (localStorage.getItem(storageKey) === "true") return false;
      localStorage.setItem(storageKey, "true");
    } catch {
      // Keep showing the notice when storage is unavailable.
    }
    updateNoticeClaimed = true;
    return true;
  });

  if (!open) return null;

  return (
    <Modal title="What's new in Echo" className="update-confirmation-modal" onClose={() => setOpen(false)}>
      <p className="update-confirmation-version">Since version {previousVersion}, Echo has added:</p>
      {entries.map((entry) => (
        <section key={entry.version}>
          <h3>{entry.title} <span>({entry.version})</span></h3>
          <ul>
            {entry.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
      <ModalActions>
        <button type="button" className="btn-primary" onClick={() => setOpen(false)}>Done</button>
      </ModalActions>
    </Modal>
  );
}
