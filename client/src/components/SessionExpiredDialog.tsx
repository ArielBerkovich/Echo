import Modal, { ModalActions } from "./Modal.js";
import { useI18n } from "../lib/i18n.js";

export default function SessionExpiredDialog({ onSignOut }) {
  const { t } = useI18n();
  return (
    <Modal
      title={t("sessionExpired")}
      testId="session-expired-dialog"
      showClose={false}
      closeDisabled
      onClose={() => {}}
    >
      <p className="settings-hint">{t("sessionExpiredHint")}</p>
      <ModalActions className="justify-center">
        <button type="button" className="btn-primary" onClick={onSignOut} autoFocus data-testid="session-expired-signout">
          Sign out
        </button>
      </ModalActions>
    </Modal>
  );
}
