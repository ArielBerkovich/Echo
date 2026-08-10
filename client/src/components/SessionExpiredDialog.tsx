import Modal, { ModalActions } from "./Modal.js";

export default function SessionExpiredDialog({ onSignOut }) {
  return (
    <Modal
      title="Your session has expired"
      testId="session-expired-dialog"
      showClose={false}
      closeDisabled
      onClose={() => {}}
    >
      <p className="settings-hint">Please sign out and sign in again to continue using Echo.</p>
      <ModalActions className="justify-center">
        <button type="button" className="btn-primary" onClick={onSignOut} autoFocus data-testid="session-expired-signout">
          Sign out
        </button>
      </ModalActions>
    </Modal>
  );
}
