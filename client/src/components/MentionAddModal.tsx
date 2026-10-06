import Avatar from "./Avatar.js";
import Modal, { ModalActions } from "./Modal.js";
import { useI18n } from "../lib/i18n.js";

// "Add to #channel?" prompt shown when a message @-mentions people who aren't
// in the (private) channel. Purely presentational — state lives in useMentionGate.
export default function MentionAddModal({ prompt, channelName, adding, error, onAdd, onSendAnyway, onClose }) {
  const { t } = useI18n();
  if (!prompt) return null;
  const n = prompt.users.length;
  return (
    <Modal title={t("mentionAddTitle").replace("{channel}", channelName)} className="mention-add-modal" closeDisabled={adding} onClose={onClose}>
      <p className="settings-hint">
        {n === 1
          ? t("mentionAddPromptSingle")
          : t("mentionAddPromptMultiple")}
      </p>
      <div className="mention-add-list">
        {prompt.users.map((u) => (
          <div className="mention-add-user" key={u.id}>
            <Avatar name={u.displayName} src={u.avatarUrl} size={28} />
            <span className="mi-name">{u.displayName}</span>
            <span className="mi-handle">@{u.username}</span>
          </div>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      <ModalActions>
        <button type="button" className="btn-secondary" onClick={onSendAnyway} disabled={adding}>
          {t("mentionSendWithoutAdding")}
        </button>
        <button type="button" className="btn-primary" onClick={onAdd} disabled={adding}>
          {adding ? t("mentionAdding") : t("mentionAddAndSend")}
        </button>
      </ModalActions>
    </Modal>
  );
}
