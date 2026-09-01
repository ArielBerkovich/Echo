import { useEffect, useMemo, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import Composer from "./Composer.js";
import Modal from "./Modal.js";

const MAX_GROUP_DM_RECIPIENTS = 9;

export default function NewMessageModal({ currentUserId, users, customEmojis, mode, onPrepare, onStart, onClose }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [channel, setChannel] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);
  const prepareRequestRef = useRef(0);
  const draftChannel = {
    id: "new-message-draft",
    type: "dm",
    dmName: selected.length > 1
      ? selected.map((user) => user.displayName).join(", ")
      : selected[0]?.displayName || "recipient",
  };

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
  const availableMatches = matches.filter((user) => !selected.some((candidate) => candidate.id === user.id));

  async function prepare(nextSelected) {
    const requestId = ++prepareRequestRef.current;
    setChannel(null);
    setError(null);
    setPreparing(true);
    try {
      const nextChannel = await onPrepare(nextSelected);
      if (requestId === prepareRequestRef.current) setChannel(nextChannel);
    } catch (err) {
      if (requestId === prepareRequestRef.current) setError(err.message);
    } finally {
      if (requestId === prepareRequestRef.current) setPreparing(false);
    }
  }

  function select(user) {
    if (selected.length >= MAX_GROUP_DM_RECIPIENTS) {
      return;
    }
    const nextSelected = [...selected, user];
    setSelected(nextSelected);
    setQuery("");
    setDebouncedQuery("");
    prepare(nextSelected);
  }

  function remove(userId) {
    const nextSelected = selected.filter((user) => user.id !== userId);
    setSelected(nextSelected);
    setQuery("");
    setDebouncedQuery("");
    if (nextSelected.length) prepare(nextSelected);
    else {
      setChannel(null);
      setError(null);
    }
  }

  async function handleSent() {
    if (!selected.length || !channel) {
      setError("Select a recipient first.");
      return;
    }
    try {
      await onStart(selected, channel);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="New Message" className="new-message-modal" testId="new-message-modal" closeDisabled={preparing} onClose={onClose}>
        <div className="new-message-layout">
          <div className="new-message-picker">
            {selected.length ? (
              <div className="new-message-search new-message-search-selected" data-testid="new-message-search">
                {selected.map((user) => <span className="forward-chip new-message-recipient" data-testid="new-message-recipient" key={user.id}>
                  <span>{user.displayName}</span>
                  <button type="button" aria-label={`Remove ${user.displayName}`} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); remove(user.id); }}>
                    <XIcon size={13} aria-hidden="true" />
                  </button>
                </span>)}
                {selected.length < MAX_GROUP_DM_RECIPIENTS ? (
                  <input
                    className="new-message-search-input new-message-add-input"
                    data-testid="new-message-search-input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      const firstMatch = availableMatches[0];
                      if (!firstMatch) return;
                      event.preventDefault();
                      select(firstMatch);
                    }}
                    placeholder="Add people"
                    autoFocus
                  />
                ) : null}
              </div>
            ) : (
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
            )}

            {debouncedQuery ? <div className="new-message-people" role="listbox" aria-label="People">
              {availableMatches.length ? availableMatches.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  className="new-message-person"
                  data-testid={`new-message-user-${user.username}`}
                  role="option"
                  aria-selected="false"
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
                key="new-message-composer"
                channel={draftChannel}
                sendChannel={channel}
                users={users}
                customEmojis={customEmojis}
                mode={mode}
                placeholder="Write a message…"
                showSchedule={false}
                showSend
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
