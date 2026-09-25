import { useState } from "react";
import Modal, { ModalActions } from "./Modal.js";
import { useI18n } from "../lib/i18n.js";

export default function BackendConnectionModal({ backendUrl, onClose, onRetry }) {
  const { t } = useI18n();
  const [value, setValue] = useState(backendUrl);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const nextUrl = value.trim().replace(/\/+$/, "");
    setError("");
    setSaving(true);
    try {
      const result = await window.echoDesktopConfig.changeBackendUrl(nextUrl);
      if (!result.ok) {
        setError(result.error || t("backendUrlSaveFailed"));
        setSaving(false);
      }
    } catch {
      setError(t("backendUrlSaveRetry"));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("cannotReachEcho")} className="backend-connection-modal" closeDisabled={saving} onClose={onClose}>
      <p>{t("backendConnectionHint")}</p>
      <label className="backend-connection-field">
        <span>{t("backendUrl")}</span>
        <input
          type="url"
          className="settings-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="http://localhost:8090"
          autoFocus
          disabled={saving}
        />
      </label>
      {error ? <div className="error backend-connection-error" role="alert">{error}</div> : null}
      <ModalActions>
        <button type="button" className="btn-secondary" onClick={onRetry} disabled={saving}>{t("tryAgain")}</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !value.trim()}>
          {saving ? t("restartingEcho") : t("saveAndReconnect")}
        </button>
      </ModalActions>
    </Modal>
  );
}
