import { useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.js";
import Composer from "./Composer.js";
import Message from "./Message.js";
import Modal, { ModalActions } from "./Modal.js";
import { PlusIcon, XIcon } from "lucide-react";

const MAX_DESTINATIONS = 10;
const MAX_VISIBLE_SEARCH_RESULTS = 20;

function destinationKey(destination) {
  return `${destination.kind}:${destination.id}`;
}

function fuzzyMatch(destination, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;
  return destination.label.toLowerCase().includes(normalizedQuery)
    || destination.handle.toLowerCase().includes(normalizedQuery);
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

function resultId(destination) {
  return `forward-destination-${destinationKey(destination).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function DestinationIcon({ destination }) {
  if (destination.kind === "channel") {
    return <span className="forward-destination-icon" aria-hidden="true">{destination.icon}</span>;
  }
  return <Avatar name={destination.label} src={destination.avatarUrl} size={34} />;
}

// Recipient-first forwarding flow. Search and selection stay synchronous so
// keyboard input always acts on exactly what is visible.
export default function ForwardModal({ message, channels = [], dms = [], users = [], recents = [], customEmojis = [], channelId = "", channelType = "public", currentUserId = "", usersById = new Map(), renderMarkdown, emojiMap = {}, onAddCustomEmoji, onForward, onSuccess, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [searchFocused, setSearchFocused] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef(null);
  const noteComposerRef = useRef(null);

  const destinationGroups = useMemo(() => {
    const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
    const dmsByUserId = new Map(dms.map((dm) => [dm.withUser?.id, dm]));
    const usersById = new Map(users.map((user) => [user.id, user]));
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
      userId: dm.withUser?.id || "",
      label: dm.withUser?.displayName || "Direct message",
      handle: "Direct message",
      avatarUrl: dm.withUser?.avatarUrl || null,
      username: dm.withUser?.username || "",
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
    const recentItems = recents.map((recent) => {
      if (recent.type === "channel") {
        const channel = channelsById.get(recent.id);
        return channel
          ? channelItems.find((item) => item.id === channel.id)
          : recent.id && (recent.name || recent.label)
            ? {
                id: recent.id,
                kind: "channel",
                label: recent.name || recent.label,
                handle: recent.type === "private" ? "Private channel" : "Public channel",
                icon: recent.type === "private" ? "🔒" : "#",
              }
            : null;
      }
      const user = usersById.get(recent.id) || dmsByUserId.get(recent.id)?.withUser;
      if (!user && !(recent.id && (recent.displayName || recent.username || recent.label))) return null;
      return {
        id: user?.id || recent.id,
        kind: "user",
        label: user?.displayName || user?.username || recent.displayName || recent.label || recent.username || "Person",
        handle: `@${user?.username || recent.username || ""}`,
        avatarUrl: user?.avatarUrl || null,
        username: user?.username || recent.username || "",
      };
    }).filter(Boolean);

    return {
      recent: recentItems,
      all: [...channelItems, ...dmItems, ...people],
    };
  }, [channels, dms, users, recents]);

  const hasQuery = Boolean(query.trim());
  const resultGroups = useMemo(() => {
    const matches = hasQuery
      ? destinationGroups.all
          .filter((destination) => fuzzyMatch(destination, query))
          .sort((left, right) => matchRank(left, query) - matchRank(right, query))
          .slice(0, MAX_VISIBLE_SEARCH_RESULTS)
      : destinationGroups.recent.slice(0, MAX_VISIBLE_SEARCH_RESULTS);

    if (!hasQuery) return [{ label: "Recent destinations", items: matches }].filter((group) => group.items.length);

    return [
      { label: "Channels", items: matches.filter((item) => item.kind === "channel") },
      { label: "People and direct messages", items: matches.filter((item) => item.kind !== "channel") },
    ].filter((group) => group.items.length);
  }, [destinationGroups, hasQuery, query]);

  const flatResults = useMemo(() => resultGroups.flatMap((group) => group.items), [resultGroups]);
  const selectedKeys = useMemo(() => new Set(selected.map(destinationKey)), [selected]);
  const showResultList = searchFocused;
  const isSubmitting = status === "submitting";
  const disabled = !selected.length || isSubmitting;
  const noteChannel = useMemo(() => ({
    id: `forward-note-${message?.id || "message"}`,
    type: "dm",
    dmName: "the recipient",
  }), [message?.id]);

  function addDestination(destination) {
    if (selectedKeys.has(destinationKey(destination)) || selected.length >= MAX_DESTINATIONS) return;
    setSelected((previous) => [...previous, destination]);
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function removeDestination(destination) {
    setSelected((previous) => previous.filter((item) => destinationKey(item) !== destinationKey(destination)));
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function handleSearchBlur() {
    requestAnimationFrame(() => {
      setSearchFocused(Boolean(searchRef.current?.closest(".forward-recipient-picker")?.contains(document.activeElement)));
    });
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      noteComposerRef.current?.focus();
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
      setActiveIndex(0);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => flatResults.length ? (index + 1) % flatResults.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => flatResults.length ? (index - 1 + flatResults.length) % flatResults.length : 0);
    } else if (event.key === "Home" && flatResults.length) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && flatResults.length) {
      event.preventDefault();
      setActiveIndex(flatResults.length - 1);
    } else if (event.key === "Enter" && flatResults[activeIndex]) {
      event.preventDefault();
      const destination = flatResults[activeIndex];
      if (selectedKeys.has(destinationKey(destination))) removeDestination(destination);
      else addDestination(destination);
    }
  }

  async function submit() {
    if (!selected.length || isSubmitting) return;
    setStatus("submitting");
    setError(null);
    try {
      for (const destination of selected) {
        await onForward(destination, { note: note.trim(), destinationCount: selected.length });
      }
      setStatus("success");
      onSuccess?.(selected);
      onClose();
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Could not forward message");
    }
  }

  return (
    <Modal
      title="Forward to"
      className="forward-modal"
      closeClassName="forward-close"
      closeDisabled={isSubmitting}
      onPointerDownOutside={(event) => {
        if (event.target instanceof Element && event.target.closest(".text-viewer-backdrop")) {
          event.preventDefault();
        }
      }}
      onClose={onClose}
    >
      <div className="forward-dialog" data-testid="forward-modal">
        <div className="forward-content">
          <section className="forward-recipient-picker" aria-labelledby="forward-recipient-heading">
            <div className="forward-destination-heading">
              <div>
                <strong id="forward-recipient-heading">Send to</strong>
                {selected.length > 0 && <span>{`${selected.length} recipient${selected.length === 1 ? "" : "s"} selected`}</span>}
              </div>
              <small>{selected.length} of {MAX_DESTINATIONS}</small>
            </div>

            {selected.length > 0 && (
              <div className="forward-selected-chips" aria-label="Selected recipients">
                {selected.map((destination) => (
                  <span className="forward-chip" key={destinationKey(destination)} title={labelFor(destination)}>
                    <span>{labelFor(destination)}</span>
                    <button type="button" className="chip-remove" aria-label={`Remove ${labelFor(destination)}`} onClick={() => removeDestination(destination)} disabled={isSubmitting}>
                      <XIcon size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              ref={searchRef}
              className={`people-filter forward-destination-search${showResultList ? " has-results" : ""}`}
              data-testid="forward-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={handleSearchBlur}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search people and channels"
              autoFocus
              disabled={!destinationGroups.all.length || isSubmitting}
              aria-label="Search people and channels"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="forward-destination-list"
              aria-expanded={showResultList}
              aria-activedescendant={flatResults[activeIndex] ? resultId(flatResults[activeIndex]) : undefined}
            />

            {showResultList && (
              <div id="forward-destination-list" className="forward-destination-list" data-testid="forward-destination-list" role="listbox" aria-label="Recipient search results">
                {!flatResults.length && hasQuery ? (
                  <div className="people-empty">No recipients match “{query.trim()}”</div>
                ) : resultGroups.map((group) => (
                  <section className="forward-result-group" key={group.label} aria-label={group.label}>
                    {hasQuery && <div className="forward-result-group-label">{group.label}</div>}
                    {group.items.map((destination) => {
                      const index = flatResults.indexOf(destination);
                      const isSelected = selectedKeys.has(destinationKey(destination));
                      const atLimit = selected.length >= MAX_DESTINATIONS && !isSelected;
                      return (
                        <button
                          type="button"
                          id={resultId(destination)}
                          className={`forward-destination-row ${isSelected ? "selected" : ""} ${activeIndex === index ? "keyboard-active" : ""}`}
                          key={destinationKey(destination)}
                          role="option"
                          aria-pressed={isSelected}
                          aria-selected={isSelected}
                          tabIndex={-1}
                          disabled={isSubmitting || atLimit}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => isSelected ? removeDestination(destination) : addDestination(destination)}
                        >
                          <DestinationIcon destination={destination} />
                          <span className="forward-destination-copy">
                            <strong>{labelFor(destination)}</strong>
                            <small>{destination.handle}</small>
                          </span>
                          <span className="forward-selection-indicator" aria-hidden="true">
                            {isSelected ? "✓" : <PlusIcon size={14} strokeWidth={2.5} />}
                          </span>
                        </button>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </section>

          <div className="forward-note-field" data-testid="forward-note-field">
            <Composer
              ref={noteComposerRef}
              key={noteChannel.id}
              channel={noteChannel}
              users={users}
              channels={channels}
              customEmojis={customEmojis}
              onAddCustomEmoji={onAddCustomEmoji}
              onDraftChange={(value) => setNote(value.slice(0, 2000))}
              onError={setError}
              placeholder="Add context for the recipient…"
              showSchedule={false}
              showSend={false}
              showAttachments={false}
              disabled={isSubmitting}
            />
          </div>

          <section className="forward-source-card" aria-label="Message being forwarded">
            <Message
              m={message}
              channelId={channelId}
              channelType={channelType}
              grouped={false}
              highlighted={false}
              currentUserId={currentUserId}
              usersById={usersById}
              renderMarkdown={renderMarkdown || ((body) => body)}
              emojiMap={emojiMap}
              canJumpToForward={() => false}
              saved={false}
              onToggleSave={() => {}}
              editing={null}
              menuOpen={false}
              pickerOpen={false}
              onReact={() => {}}
              onToggleReaction={() => {}}
              onOpenThread={() => {}}
              onQuote={() => {}}
              onJump={() => {}}
              onToggleMenu={() => {}}
              onCloseMenu={() => {}}
              onStartEdit={() => {}}
              onDelete={() => {}}
              onEditChange={() => {}}
              onEditSave={() => {}}
              onEditCancel={() => {}}
              showActions={false}
              onTogglePin={() => {}}
              onIssuePasswordHelp={() => {}}
              canPin={false}
              canQuote={false}
            />
          </section>

          <div className="forward-live-region" aria-live="polite">
            {error && <div className="error forward-error" role="alert">{error}</div>}
          </div>
        </div>

        <ModalActions className="forward-actions" data-testid="forward-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            data-testid="forward-send-selected"
            disabled={disabled}
            onClick={submit}
          >
            {isSubmitting ? "Forwarding…" : selected.length ? `Forward to ${selected.length}` : "Forward"}
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}
