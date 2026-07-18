import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.js";
import Modal from "./Modal.js";
import { ShareIcon, XIcon } from "lucide-react";
import { formatDateTime } from "../lib/time.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";

const MAX_DESTINATIONS = 10;
const MAX_NOTE_LENGTH = 2000;
const MAX_VISIBLE_SEARCH_RESULTS = 20;

function destinationKey(destination) {
  return `${destination.kind}:${destination.id}`;
}

function fuzzyMatch(destination, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;
  const label = destination.label.toLowerCase();
  const handle = destination.handle.toLowerCase();
  return label.includes(normalizedQuery) || handle.includes(normalizedQuery);
}

function matchRank(destination, query) {
  const normalizedQuery = query.trim().toLowerCase();
  const label = destination.label.toLowerCase();
  const handle = destination.handle.toLowerCase();
  if (label === normalizedQuery) return 0;
  if (label.startsWith(normalizedQuery)) return 1;
  if (label.includes(normalizedQuery)) return 2;
  return handle.startsWith(normalizedQuery) ? 3 : 4;
}

function labelFor(destination) {
  return destination.kind === "channel" ? `#${destination.label}` : destination.label;
}

function DestinationIcon({ destination }) {
  if (destination.kind === "channel") {
    return <span className="forward-destination-icon" aria-hidden="true">{destination.icon}</span>;
  }
  return <Avatar name={destination.label} src={destination.avatarUrl} size={34} />;
}

function PreviewAttachment({ attachment }) {
  const src = useAuthUrl(attachment?.url);
  if (!src || !attachment?.isImage) return null;
  return <img className="forward-attachment-thumb" src={src} alt={attachment.name || "Attachment"} />;
}

// Multi-destination forward flow. It keeps the source conversation mounted and
// performs one guarded forward request per selected destination.
export default function ForwardModal({ message, channels = [], dms = [], users = [], onForward, onSuccess, onClose }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const searchRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

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
    return {
      recent: [...dmItems, ...channelItems],
      channels: channelItems,
      dms: [...dmItems, ...people],
      all: [...channelItems, ...dmItems, ...people],
    };
  }, [channels, dms, users]);

  const resultGroups = useMemo(() => {
    const source = debouncedQuery
      ? destinationGroups.all
          .filter((destination) => fuzzyMatch(destination, debouncedQuery))
          .sort((left, right) => matchRank(left, debouncedQuery) - matchRank(right, debouncedQuery))
          .slice(0, MAX_VISIBLE_SEARCH_RESULTS)
      : [];
    if (debouncedQuery) {
      return [
        { label: "Channels", kind: "channel", items: source.filter((item) => item.kind === "channel") },
        { label: "Direct messages", kind: "dm", items: source.filter((item) => item.kind !== "channel") },
      ].filter((group) => group.items.length);
    }
    return [{ label: "Recent conversations", kind: "recent", items: source }].filter((group) => group.items.length);
  }, [debouncedQuery, destinationGroups]);

  const flatResults = useMemo(() => resultGroups.flatMap((group) => group.items), [resultGroups]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, flatResults.length - 1)));
  }, [flatResults.length]);

  function addDestination(destination) {
    if (selected.some((item) => destinationKey(item) === destinationKey(destination))) return;
    if (selected.length >= MAX_DESTINATIONS) return;
    setSelected((previous) => [...previous, destination]);
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function removeDestination(destination) {
    setSelected((previous) => previous.filter((item) => destinationKey(item) !== destinationKey(destination)));
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function handleSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => flatResults.length ? (index + 1) % flatResults.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => flatResults.length ? (index - 1 + flatResults.length) % flatResults.length : 0);
    } else if (event.key === "Enter" && flatResults[activeIndex]) {
      event.preventDefault();
      addDestination(flatResults[activeIndex]);
    }
  }

  async function submit() {
    if (!selected.length || status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      for (const destination of selected) {
        await onForward(destination, { note: note.trim() });
      }
      setStatus("success");
      onSuccess?.(selected);
      onClose();
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Could not forward message");
    }
  }

  const authorName = message?.author?.displayName || "Unknown person";
  const preview = String(message?.body || "").trim();
  const disabled = !selected.length || status === "submitting";

  return (
    <Modal title="Forward message" className="forward-modal" onClose={onClose}>
      <div className="forward-dialog" data-testid="forward-modal">
        <section className="forward-source-card" aria-label="Message to forward">
          <div className="forward-source-header">
            <Avatar name={authorName} src={message?.author?.avatarUrl} size={36} />
            <div className="forward-source-author">
              <strong>{authorName}</strong>
              <span>Original message{message?.createdAt ? ` · ${formatDateTime(message.createdAt)}` : ""}</span>
            </div>
            <ShareIcon aria-hidden="true" />
          </div>
          <p title={preview}>{preview || "(No text in this message)"}</p>
          {message?.attachments?.some((attachment) => attachment.isImage) && (
            <div className="forward-attachment-strip">
              {message.attachments.filter((attachment) => attachment.isImage).slice(0, 3).map((attachment) => (
                <PreviewAttachment key={attachment.key} attachment={attachment} />
              ))}
            </div>
          )}
        </section>

        <section className="forward-destination-section" aria-label="Forward destination">
          <div className="forward-destination-heading">
            <div>
              <strong>To</strong>
              <span>{debouncedQuery ? "Search everyone" : selected.length ? `${selected.length} selected` : "Choose one or more destinations"}</span>
            </div>
            <small>{selected.length}/{MAX_DESTINATIONS}</small>
          </div>

          {selected.length > 0 && (
            <div className="forward-selected-chips" aria-label="Selected destinations">
              {selected.map((destination) => (
                <span className="forward-chip" key={destinationKey(destination)} title={labelFor(destination)}>
                  <span>{labelFor(destination)}</span>
                  <button type="button" aria-label={`Remove ${labelFor(destination)}`} onClick={() => removeDestination(destination)} disabled={status === "submitting"}>
                    <XIcon size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            ref={searchRef}
            className="people-filter forward-destination-search"
            data-testid="forward-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search channels and people"
            autoFocus
            disabled={!destinationGroups.all.length || status === "submitting"}
            aria-controls={debouncedQuery ? "forward-results" : undefined}
            aria-activedescendant={debouncedQuery && flatResults[activeIndex] ? `forward-result-${destinationKey(flatResults[activeIndex])}` : undefined}
          />

          {debouncedQuery && (
            <div className="forward-destination-list" id="forward-results" role="listbox" aria-label="Forward destinations">
              {!resultGroups.length ? (
                <div className="people-empty">No matches for “{debouncedQuery}”</div>
              ) : resultGroups.map((group) => (
                <div className="forward-result-group" key={group.label}>
                  <div className="forward-result-group-label">{group.label}</div>
                  {group.items.map((destination) => {
                    const index = flatResults.indexOf(destination);
                    const isSelected = selected.some((item) => destinationKey(item) === destinationKey(destination));
                    return (
                      <button
                        type="button"
                        className={`forward-destination-row ${isSelected ? "selected" : ""} ${activeIndex === index ? "keyboard-active" : ""}`}
                        key={destinationKey(destination)}
                        id={`forward-result-${destinationKey(destination)}`}
                        role="option"
                        aria-selected={isSelected}
                        disabled={status === "submitting" || (selected.length >= MAX_DESTINATIONS && !isSelected)}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => isSelected ? removeDestination(destination) : addDestination(destination)}
                      >
                        <DestinationIcon destination={destination} />
                        <span className="forward-destination-copy">
                          <strong>{labelFor(destination)}</strong>
                          <small>{destination.handle}</small>
                        </span>
                        <span className="forward-selection-indicator" aria-hidden="true">{isSelected ? "✓" : "＋"}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        <label className="forward-note-field">
          <span className="forward-field-heading">
            <span>Note <em>Optional</em></span>
            <small>{note.length}/{MAX_NOTE_LENGTH}</small>
          </span>
          <textarea
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            placeholder="Add context for the recipient…"
            onChange={(event) => setNote(event.target.value)}
            disabled={status === "submitting"}
            data-testid="forward-note"
          />
        </label>

        <div className="forward-live-region" aria-live="polite">
          {error && <div className="error forward-error" role="alert">{error}</div>}
        </div>
        <div className="forward-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={status === "submitting"}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            data-testid="forward-send-selected"
            disabled={disabled}
            aria-disabled={disabled}
            onClick={submit}
          >
            {status === "submitting" ? "Forwarding…" : `Forward${selected.length ? ` to ${selected.length}` : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
