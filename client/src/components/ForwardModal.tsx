import { useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.js";
import Composer from "./Composer.js";
import Message from "./Message.js";
import Modal from "./Modal.js";
import { XIcon } from "lucide-react";
import useRecipientPickerKeyboard from "./useRecipientPickerKeyboard.js";

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

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Recipient-first forwarding flow. Search and selection stay synchronous so
// keyboard input always acts on exactly what is visible.
export default function ForwardModal({ message, channels = [], dms = [], users = [], customEmojis = [], channelId = "", channelType = "public", currentUserId = "", usersById = new Map(), renderMarkdown, emojiMap = {}, onAddCustomEmoji, onForward, onSuccess, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [searchFocused, setSearchFocused] = useState(true);
  const searchRef = useRef(null);
  const noteComposerRef = useRef(null);

  const destinationGroups = useMemo(() => {
    const channelItems = channels
      .filter((channel) => channel?.id && channel?.name && !channel.isArchived)
      .map((channel) => ({
      id: channel.id,
      kind: "channel",
      label: channel.name,
      handle: channel.type === "private" ? "Private channel" : "Public channel",
      icon: channel.type === "private" ? "🔒" : "#",
      }));
    const dmItems = uniqueById(dms)
      .filter((dm) => dm?.id && dm.withUser?.id)
      .map((dm) => {
      const participants = (dm.participants || [dm.withUser]).filter((person) => person?.id && person.id !== currentUserId);
      const isGroup = dm.isGroup || participants.length > 1;
      return {
      id: dm.id,
      kind: "dm",
      userId: isGroup ? undefined : dm.withUser.id,
      label: participants.map((person) => person.displayName || person.username).join(", ") || "Direct message",
      handle: isGroup ? "Group direct message" : "Direct message",
      avatarUrl: !isGroup ? dm.withUser?.avatarUrl || null : null,
      username: !isGroup ? dm.withUser?.username || "" : "",
      isGroup,
      };
      });
    const knownDmUserIds = new Set(dmItems.filter((dm) => !dm.isGroup).map((dm) => dm.userId));
    const people = uniqueById(users)
      .filter((user) => user?.id && user?.username && !knownDmUserIds.has(user.id))
      .map((user) => ({
        id: user.id,
        kind: "user",
        label: user.displayName || user.username || "Person",
        handle: `@${user.username}`,
        avatarUrl: user.avatarUrl || null,
        username: user.username,
      }));
    return {
      all: [...channelItems, ...dmItems, ...people],
    };
  }, [channels, currentUserId, dms, users]);

  const hasQuery = Boolean(query.trim());
  const resultGroups = useMemo(() => {
    const matches = hasQuery
      ? destinationGroups.all
          .filter((destination) => fuzzyMatch(destination, query))
          .sort((left, right) => matchRank(left, query) - matchRank(right, query))
          .slice(0, MAX_VISIBLE_SEARCH_RESULTS)
      : [];

    if (!hasQuery) return [];

    return [
      { label: "Channels", items: matches.filter((item) => item.kind === "channel") },
      { label: "People and direct messages", items: matches.filter((item) => item.kind !== "channel") },
    ].filter((group) => group.items.length);
  }, [destinationGroups, hasQuery, query]);

  const flatResults = useMemo(() => resultGroups.flatMap((group) => group.items), [resultGroups]);
  const selectedKeys = useMemo(() => new Set(selected.map(destinationKey)), [selected]);
  const showResultList = searchFocused && hasQuery;
  const isSubmitting = status === "submitting";
  const disabled = !selected.length || isSubmitting;
  const noteChannel = useMemo(() => ({
    id: `forward-note-${message?.id || "message"}`,
    type: "dm",
    dmName: "the recipient",
  }), [message?.id]);

  const {
    activeIndex,
    activeOptionRef,
    handleKeyDown,
    setActiveIndex,
  } = useRecipientPickerKeyboard({
    items: flatResults,
    hasQuery,
    onSelect: (destination) => selectedKeys.has(destinationKey(destination))
      ? removeDestination(destination)
      : addDestination(destination),
    onTab: () => noteComposerRef.current?.focus(),
  });

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
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
      setActiveIndex(0);
      return;
    }
    handleKeyDown(event);
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
                  <span className="forward-chip" key={destinationKey(destination)}>
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
              aria-expanded={showResultList && flatResults.length > 0}
              aria-activedescendant={flatResults[activeIndex] ? resultId(flatResults[activeIndex]) : undefined}
            />

            {showResultList && (flatResults.length > 0 || hasQuery || selected.length > 0) && (
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
                          ref={(element) => {
                            if (element && activeIndex === index) activeOptionRef.current = element;
                          }}
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
                          <span className="forward-selection-indicator" aria-hidden="true">{isSelected ? "✓" : "+"}</span>
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
              onSend={submit}
              sendDisabled={disabled}
              allowEmptySend
              sendAriaLabel="Forward message"
              sendTitle="Forward message"
              sendTestId="forward-send-selected"
              placeholder="Add context for the recipient…"
              showSchedule={false}
              showSend
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

      </div>
    </Modal>
  );
}
