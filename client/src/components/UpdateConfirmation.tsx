import { useState } from "react";
import Modal from "./Modal.js";

let updateNoticeClaimed = false;

export default function UpdateConfirmation() {
  const appVersion = window.echoDesktopConfig?.appVersion || "";
  const storageKey = `echo.desktop-update-notice.v1.${appVersion}`;
  const [open, setOpen] = useState(() => {
    if (!window.echoDesktopConfig?.wasUpdated || !appVersion || updateNoticeClaimed) return false;
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
    <Modal title="Echo was updated" className="update-confirmation-modal" onClose={() => setOpen(false)}>
      <p className="update-confirmation-version">Echo has been updated to version {appVersion}.</p>
      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={() => setOpen(false)}>OK</button>
      </div>
    </Modal>
  );
}
