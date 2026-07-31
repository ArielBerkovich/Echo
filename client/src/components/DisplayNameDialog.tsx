import { useState } from "react";
import Modal, { ModalActions } from "./Modal.js";
import { MAX_DISPLAY_NAME_LENGTH } from "../lib/profile.js";

export default function DisplayNameDialog({ value, onSave, onClose }) {
  const [displayName, setDisplayName] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    const nextName = displayName.trim();
    if (!nextName || saving) return;
    if (nextName.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(nextName);
    } catch (saveError) {
      setError(saveError.message || "Could not update display name");
      setSaving(false);
    }
  }

  return (
    <Modal title="Update display name" onClose={onClose} closeDisabled={saving} testId="display-name-dialog">
      <label className="display-name-dialog-field">
        <span>Display name</span>
        <input
          className="settings-input"
          data-testid="display-name-dialog-input"
          value={displayName}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          autoFocus
          onChange={(event) => setDisplayName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && save()}
        />
      </label>
      {error && <div className="error">{error}</div>}
      <ModalActions>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !displayName.trim()}>{saving ? "Saving…" : "Save"}</button>
      </ModalActions>
    </Modal>
  );
}
