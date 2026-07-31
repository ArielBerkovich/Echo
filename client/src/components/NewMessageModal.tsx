import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import Composer from "./Composer.js";
import Modal from "./Modal.js";

export default function NewMessageModal({ currentUserId, users, customEmojis, mode, onPrepare, onStart, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [channel, setChannel] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users
      .filter((user) => user.id !== currentUserId)
      .filter((user) => !normalized
        || user.displayName.toLowerCase().includes(normalized)
        || user.username.toLowerCase().includes(normalized))
      .slice(0, 20);
  }, [currentUserId, query, users]);

  async function select(user) {
    setSelected(user);
    setChannel(null);
    setError(null);
    setPreparing(true);
    try {
      setChannel(await onPrepare(user));
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  async function handleSent() {
    try {
      await onStart(selected, channel);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="New message" className="new-message-modal" testId="new-message-modal" closeDisabled={preparing} onClose={onClose}>
        <label className="new-message-search" data-testid="new-message-search">
          <SearchIcon size={17} strokeWidth={1.8} aria-hidden="true" />
          <input
            className="new-message-search-input"
            data-testid="new-message-search-input"
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
            style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
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

        {error ? <div className="error" role="alert">{error}</div> : null}
        {preparing ? <div className="people-empty">Opening conversation…</div> : null}
        {channel ? (
          <Composer
            key={channel.id}
            channel={channel}
            users={users}
            customEmojis={customEmojis}
            mode={mode}
            onError={setError}
            onSent={handleSent}
          />
        ) : null}
    </Modal>
  );
}
