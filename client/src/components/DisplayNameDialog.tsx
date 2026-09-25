import { useState } from "react";
import Modal, { ModalActions } from "./Modal.js";
import { MAX_DISPLAY_NAME_LENGTH } from "../lib/profile.js";
import { useI18n } from "../lib/i18n.js";

export default function DisplayNameDialog({ value, onSave, onClose }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    const nextName = displayName.trim();
    if (!nextName || saving) return;
    if (nextName.length > MAX_DISPLAY_NAME_LENGTH) {
      setError(t("displayNameMaxLength").replace("{count}", String(MAX_DISPLAY_NAME_LENGTH)));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(nextName);
    } catch (saveError) {
      setError(saveError.message || t("displayNameUpdateFailed"));
      setSaving(false);
    }
  }

  return (
    <Modal title={t("updateDisplayName")} onClose={onClose} closeDisabled={saving} testId="display-name-dialog">
      <label className="display-name-dialog-field">
        <span>{t("displayName")}</span>
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
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t("cancel")}</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !displayName.trim()}>{saving ? t("saving") : t("save")}</button>
      </ModalActions>
    </Modal>
  );
}
