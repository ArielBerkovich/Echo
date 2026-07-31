import { useMemo, useRef, useState } from "react";
import { SendIcon, SearchIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import Modal, { ModalActions } from "./Modal.js";

export default function NewMessageModal({ currentUserId, users, onStart, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const messageRef = useRef(null);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users
      .filter((user) => user.id !== currentUserId)
      .filter((user) => !normalized
        || user.displayName.toLowerCase().includes(normalized)
        || user.username.toLowerCase().includes(normalized))
      .slice(0, 20);
  }, [currentUserId, query, users]);

  function select(user) {
    setSelected(user);
    setError(null);
    requestAnimationFrame(() => messageRef.current?.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    try {
      await onStart(selected, message.trim());
      onClose();
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  }

  return (
    <Modal title="New message" className="new-message-modal" testId="new-message-modal" closeDisabled={sending} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="new-message-search">
          <SearchIcon size={17} strokeWidth={1.8} aria-hidden="true" />
          <input
            data-testid="new-message-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                select(matches[0]);
              }
            }}
            placeholder="Search people"
            autoFocus
          />
        </label>

        <div className="new-message-people" role="listbox" aria-label="People">
          {matches.length ? matches.map((user) => (
            <button
              type="button"
              key={user.id}
              className={`new-message-person ${selected?.id === user.id ? "selected" : ""}`}
              data-testid={`new-message-user-${user.username}`}
              role="option"
              aria-selected={selected?.id === user.id}
              onClick={() => select(user)}
            >
              <Avatar name={user.displayName} src={user.avatarUrl} size={34} />
              <span className="person-info">
                <span className="person-name">{user.displayName}</span>
                <span className="person-handle">@{user.username}</span>
              </span>
              <span className="new-message-check" aria-hidden="true">✓</span>
            </button>
          )) : <div className="people-empty">No people found.</div>}
        </div>

        <label className="new-message-compose">
          <span>Message <span className="settings-hint">(optional)</span></span>
          <textarea
            ref={messageRef}
            data-testid="new-message-body"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={selected ? `Message ${selected.displayName}` : "Choose someone first"}
            disabled={!selected || sending}
            rows={4}
          />
        </label>

        {error ? <div className="error" role="alert">{error}</div> : null}
        <ModalActions>
          <button type="button" className="btn-secondary" disabled={sending} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary new-message-send" data-testid="new-message-submit" disabled={!selected || sending}>
            <SendIcon size={16} strokeWidth={1.9} aria-hidden="true" />
            {sending ? "Sending…" : message.trim() ? "Send message" : "Open DM"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
