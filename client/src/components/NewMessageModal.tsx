import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.js";
import Composer from "./Composer.js";
import Modal from "./Modal.js";

export default function NewMessageModal({ currentUserId, users, customEmojis, mode, onPrepare, onStart, onClose }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [channel, setChannel] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);
  const composerRef = useRef(null);
  const draftChannel = { id: "new-message-draft", type: "dm", dmName: selected?.displayName || "recipient" };

  useEffect(() => {
    if (!channel || preparing) return undefined;
    const focusTimer = window.setTimeout(() => composerRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [channel, preparing]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const matches = useMemo(() => {
    const normalized = debouncedQuery.toLowerCase();
    return users
      .filter((user) => user.id !== currentUserId)
      .filter((user) => !normalized
        || user.displayName.toLowerCase().includes(normalized)
        || user.username.toLowerCase().includes(normalized))
      .slice(0, 20);
  }, [currentUserId, debouncedQuery, users]);

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
        <div className="new-message-layout">
          <div className="new-message-picker">
            <label className="new-message-search people-filter" data-testid="new-message-search">
              <input
                className="new-message-search-input"
                data-testid="new-message-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const normalized = query.trim().toLowerCase();
                    const firstMatch = users
                      .filter((user) => user.id !== currentUserId)
                      .filter((user) => !normalized
                        || user.displayName.toLowerCase().includes(normalized)
                        || user.username.toLowerCase().includes(normalized))
                      .slice(0, 20)[0];
                    if (!firstMatch) return;
                    event.preventDefault();
                    select(firstMatch);
                  }
                }}
                placeholder="Search people"
                autoFocus
              />
            </label>

            {debouncedQuery ? <div className="new-message-people" role="listbox" aria-label="People">
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
                </button>
              )) : <div className="people-empty">No people found.</div>}
            </div> : null}
          </div>

          <div className={`new-message-compose ${channel ? "has-channel" : ""}`}>
            {preparing ? <div className="people-empty">Opening conversation…</div> : null}
            <Composer
                ref={composerRef}
                key={channel?.id || draftChannel.id}
                channel={channel || draftChannel}
                users={users}
                customEmojis={customEmojis}
                mode={mode}
                showSchedule={false}
                disabled={!channel}
                onError={setError}
                onSent={handleSent}
              />
          </div>
        </div>

        {error ? <div className="error" role="alert">{error}</div> : null}
    </Modal>
  );
}
