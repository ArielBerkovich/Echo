import { useState } from "react";
import Modal from "./Modal.js";

export default function BackendConnectionModal({ backendUrl, onClose, onRetry }) {
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
        setError(result.error || "Could not save the backend URL.");
        setSaving(false);
      }
    } catch {
      setError("Could not save the backend URL. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Can't reach Echo" className="backend-connection-modal" closeDisabled={saving} onClose={onClose}>
      <p>Echo couldn't connect to the backend below. Make sure the address and port are correct.</p>
      <label className="backend-connection-field">
        <span>Backend URL</span>
        <input
          type="url"
          className="settings-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="http://192.168.1.110:8090"
          autoFocus
          disabled={saving}
        />
      </label>
      {error ? <div className="error backend-connection-error" role="alert">{error}</div> : null}
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onRetry} disabled={saving}>Try again</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !value.trim()}>
          {saving ? "Restarting Echo…" : "Save and reconnect"}
        </button>
      </div>
    </Modal>
  );
}
