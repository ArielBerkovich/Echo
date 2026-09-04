import Modal, { ModalActions } from "./Modal.js";
import { Button } from "./Button.js";

// A styled confirmation dialog matching the app's modals (replaces the native
// window.confirm, which ignores the theme).
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} className="confirm-modal" onClose={onCancel}>
      {message && <p className="settings-hint">{message}</p>}
      <ModalActions>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </ModalActions>
    </Modal>
  );
}
