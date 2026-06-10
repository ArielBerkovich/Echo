import Modal from "./Modal.js";

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
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
