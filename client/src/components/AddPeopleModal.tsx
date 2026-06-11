import { useState } from "react";
import Avatar from "./Avatar.js";
import Modal from "./Modal.js";

// Pick workspace members to add to a channel. Adding is immediate; the person
// then drops out of the list. "Done" closes the dialog.
export default function AddPeopleModal({ channel, users, onAdd, onClose }) {
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  const memberIds = new Set(channel.members || []);
  const q = filter.trim().toLowerCase();
  const available = users
    .filter((u) => !memberIds.has(u.id))
    .filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );

  async function add(u) {
    setAdding(u.id);
    setError(null);
    try {
      await onAdd(u.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(null);
    }
  }

  return (
    <Modal title={`Add people to ${channel.type === "private" ? "🔒" : "#"} ${channel.name}`} onClose={onClose}>
      <input
        className="people-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search people"
        autoFocus
      />

      <div className="people-list">
        {available.length === 0 ? (
          <div className="people-empty">Everyone in the workspace is already here.</div>
        ) : (
          available.map((u) => (
            <div className="person-row" key={u.id}>
              <Avatar name={u.displayName} src={u.avatarUrl} size={32} />
              <div className="person-info">
                <div className="person-name">{u.displayName}</div>
                <div className="person-handle">@{u.username}</div>
              </div>
              <button type="button" className="btn-secondary" disabled={adding === u.id} onClick={() => add(u)}>
                {adding === u.id ? "Adding…" : "Add"}
              </button>
            </div>
          ))
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
