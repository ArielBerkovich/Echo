import { useMemo, useState } from "react";
import Avatar from "./Avatar.js";
import Modal from "./Modal.js";
import { ShareIcon } from "./Icons.js";

// Send a message to one conversation at a time, with an optional note.
export default function ForwardModal({ message, channels = [], dms = [], users = [], onForward, onClose }) {
  const [filter, setFilter] = useState("");
  const [note, setNote] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const q = filter.trim().toLowerCase();

  const destinationGroups = useMemo(() => {
    const channelItems = channels.map((channel) => ({
      id: channel.id,
      kind: "channel",
      label: channel.name,
      handle: channel.type === "private" ? "Private channel" : "Public channel",
      icon: channel.type === "private" ? "🔒" : "#",
    }));
    const dmItems = dms.map((dm) => ({
      id: dm.id,
      kind: "dm",
      label: dm.withUser?.displayName || "Direct message",
      handle: "Direct message",
      avatarUrl: dm.withUser?.avatarUrl || null,
    }));
    const knownDmUserIds = new Set(dms.map((dm) => dm.withUser?.id).filter(Boolean));
    const people = users
      .filter((user) => !knownDmUserIds.has(user.id))
      .map((user) => ({
        id: user.id,
        kind: "user",
        label: user.displayName || user.username || "Person",
        handle: `@${user.username}`,
        avatarUrl: user.avatarUrl || null,
      }));
    const recent = [...channelItems, ...dmItems];
    return { recent, all: [...recent, ...people] };
  }, [channels, dms, users]);

  const allDestinations = destinationGroups.all;
  const destinations = useMemo(
    () => (q ? destinationGroups.all : destinationGroups.recent)
      .filter((item) => !q || `${item.label} ${item.handle}`.toLowerCase().includes(q)),
    [destinationGroups, q]
  );

  function toggleDestination(destination) {
    const key = `${destination.kind}:${destination.id}`;
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function forwardSelected() {
    const selected = allDestinations.filter((destination) => selectedKeys.has(`${destination.kind}:${destination.id}`));
    if (selected.length === 0) return;
    setSending(true);
    setError(null);
    try {
      for (const destination of selected) {
        await onForward(destination, { note: note.trim() });
      }
      onClose();
    } catch (err) {
      setError(err.message || "Could not forward message");
      setSending(false);
    }
  }

  const preview = (message?.body || "").trim();
  const authorName = message?.author?.displayName || "Unknown person";

  return (
    <Modal title="Forward message" className="forward-modal" onClose={onClose}>
      <div className="forward-dialog" data-testid="forward-modal">
        <div className="forward-intro">
          <span className="forward-eyebrow">Share a message</span>
          <p>Send this message to a conversation, with an optional note.</p>
        </div>

        <section className="forward-source-card" aria-label="Message to forward">
          <div className="forward-source-header">
            <Avatar name={authorName} src={message?.author?.avatarUrl} size={34} />
            <div className="forward-source-author">
              <strong>{authorName}</strong>
              <span>Original message</span>
            </div>
            <ShareIcon aria-hidden="true" />
          </div>
          <p>{preview || "(No text in this message)"}</p>
        </section>

        <label className="forward-note-field">
          <span className="forward-field-heading">
            <span>Note <em>Optional</em></span>
            <small>{note.length}/4000</small>
          </span>
          <textarea
            value={note}
            maxLength={4000}
            rows={2}
            placeholder="Add context for the recipient…"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <section className="forward-destination-section" aria-label="Forward destination">
          <div className="forward-destination-heading">
            <div>
              <strong>To</strong>
              <span>{q ? "Search everyone" : "Recent conversations"}</span>
            </div>
            <span className="forward-destination-count">{destinations.length}</span>
          </div>
          <input
            className="people-filter forward-destination-search"
            data-testid="forward-search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search channels and people"
            autoFocus
          />

          <div className="forward-destination-list">
            {destinations.length === 0 ? (
              <div className="people-empty">No matching destinations.</div>
            ) : (
              destinations.map((destination) => (
                <button
                  type="button"
                  className={`forward-destination-row ${selectedKeys.has(`${destination.kind}:${destination.id}`) ? "selected" : ""}`}
                  key={`${destination.kind}-${destination.id}`}
                  data-testid={`forward-dest-${destination.kind}-${destination.id}`}
                  disabled={sending}
                  aria-pressed={selectedKeys.has(`${destination.kind}:${destination.id}`)}
                  onClick={() => toggleDestination(destination)}
                >
                  {destination.kind === "channel" ? (
                    <span className="forward-destination-icon">{destination.icon}</span>
                  ) : (
                    <Avatar name={destination.label} src={destination.avatarUrl} size={34} />
                  )}
                  <span className="forward-destination-copy">
                    <strong>{destination.label}</strong>
                    <small>{destination.handle}</small>
                  </span>
                  <span className="forward-selection-indicator" aria-hidden="true">
                    {selectedKeys.has(`${destination.kind}:${destination.id}`) ? "✓" : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {error && <div className="error forward-error">{error}</div>}
        <div className="forward-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            data-testid="forward-send-selected"
            disabled={sending || selectedKeys.size === 0}
            onClick={forwardSelected}
          >
            {sending ? "Sending…" : `Forward to ${selectedKeys.size || "…"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
