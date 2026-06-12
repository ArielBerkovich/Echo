import { useMemo, useState } from "react";
import Avatar from "./Avatar.js";
import Modal from "./Modal.js";

// Pick a channel or DM to forward a message into. Forwarding is a single click;
// `onForward` resolves once the message lands in the destination.
export default function ForwardModal({ message, channels = [], dms = [], onForward, onClose }) {
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(null);
  const [error, setError] = useState(null);

  const q = filter.trim().toLowerCase();

  // Flatten channels + DMs into one searchable destination list.
  const destinations = useMemo(() => {
    const chans = channels.map((c) => ({
      id: c.id,
      kind: "channel",
      label: c.name,
      icon: c.type === "private" ? "🔒" : "#",
    }));
    const directs = dms.map((d) => ({
      id: d.id,
      kind: "dm",
      label: d.withUser?.displayName || "Direct message",
      avatarUrl: d.withUser?.avatarUrl || null,
    }));
    return [...chans, ...directs].filter((d) => !q || d.label.toLowerCase().includes(q));
  }, [channels, dms, q]);

  async function forward(dest) {
    setSending(dest.id);
    setError(null);
    try {
      await onForward(dest);
      onClose();
    } catch (err) {
      setError(err.message || "Could not forward message");
      setSending(null);
    }
  }

  const preview = (message?.body || "").slice(0, 240);

  return (
    <Modal title="Forward message" onClose={onClose}>
      <div data-testid="forward-modal">
        <div className="forward-preview">
          <div className="forward-preview-author">{message?.author?.displayName || "unknown"}</div>
          <div className="forward-preview-body">{preview || "(no text)"}</div>
        </div>

        <input
          className="people-filter"
          data-testid="forward-search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search channels and people"
          autoFocus
        />

        <div className="people-list">
          {destinations.length === 0 ? (
            <div className="people-empty">No matching destinations.</div>
          ) : (
            destinations.map((dest) => (
              <div className="person-row" key={`${dest.kind}-${dest.id}`}>
                {dest.kind === "dm" ? (
                  <Avatar name={dest.label} src={dest.avatarUrl} size={32} />
                ) : (
                  <span className="forward-chan-icon">{dest.icon}</span>
                )}
                <div className="person-info">
                  <div className="person-name">{dest.label}</div>
                  <div className="person-handle">{dest.kind === "dm" ? "Direct message" : "Channel"}</div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  data-testid={`forward-dest-${dest.kind}-${dest.id}`}
                  disabled={sending === dest.id}
                  onClick={() => forward(dest)}
                >
                  {sending === dest.id ? "Forwarding…" : "Forward"}
                </button>
              </div>
            ))
          )}
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </Modal>
  );
}
