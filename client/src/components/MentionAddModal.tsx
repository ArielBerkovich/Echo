import Avatar from "./Avatar.js";
import Modal from "./Modal.js";

// "Add to #channel?" prompt shown when a message @-mentions people who aren't
// in the (private) channel. Purely presentational — state lives in useMentionGate.
export default function MentionAddModal({ prompt, channelName, adding, error, onAdd, onSendAnyway, onClose }) {
  if (!prompt) return null;
  const n = prompt.users.length;
  return (
    <Modal title={`Add to #${channelName}?`} className="mention-add-modal" closeDisabled={adding} onClose={onClose}>
      <p className="settings-hint">
        {n === 1
          ? "This person isn't in this channel yet, so they won't be notified. Add them?"
          : "These people aren't in this channel yet, so they won't be notified. Add them?"}
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
      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onSendAnyway} disabled={adding}>
          Send without adding
        </button>
        <button type="button" className="btn-primary" onClick={onAdd} disabled={adding}>
          {adding ? "Adding…" : n === 1 ? "Add & send" : `Add ${n} & send`}
        </button>
      </div>
    </Modal>
  );
}
