import Modal, { ModalActions } from "./Modal.js";
import { Button } from "./Button.js";
import { useI18n } from "../lib/i18n.js";

// A styled confirmation dialog matching the app's modals (replaces the native
// window.confirm, which ignores the theme).
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} className="confirm-modal" onClose={onCancel}>
      {message && <p className="settings-hint">{message}</p>}
      <ModalActions>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel || t("cancel")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} autoFocus>
          {confirmLabel || t("confirm")}
        </Button>
      </ModalActions>
    </Modal>
  );
}
