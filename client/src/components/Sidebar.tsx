import { useMemo, useState } from "react";
import { ChevronDownIcon, CompassIcon, LockKeyholeIcon, SquarePenIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import { relativeTime } from "../lib/time.js";
import { useAuthUrls } from "../lib/useAuthUrl.js";
import { tokenizeEmojiShortcodes } from "../markdown.js";

function StartConversationButton({ onClick }) {
  return (
    <button
      type="button"
      className="add-channel start-conversation"
      data-testid="start-dm"
      onClick={onClick}
      title="New message"
      aria-label="New message"
    >
      <SquarePenIcon size={15} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

// Keep previews compact while allowing each emoji image to occupy one slot.
function Preview({ body, customEmojis }) {
  if (!body) return "No messages yet";
  const normalized = body.replace(/\s+/g, " ").trim();
  const tokens = tokenizeEmojiShortcodes(normalized, customEmojis);
  const output = [];
  let length = 0;
  for (const token of tokens) {
    if (length >= 40) break;
    if (token.type === "custom") {
      output.push(<img key={`custom-${output.length}`} className="custom-emoji" src={token.value} alt={token.alt} title={token.alt} />);
      length += 1;
      continue;
    }
    const value = token.value.slice(0, 40 - length);
    output.push(value);
    length += value.length;
  }
  return output;
}

// An avatar with a presence dot in the corner (green = online, grey = offline).
function PresenceAvatar({ name, src, size, online, showPresence = true }) {
  return (
    <span className="avatar-wrap">
      <Avatar name={name} src={src} size={size} />
      {showPresence && <span className={`presence-dot ${online ? "online" : "offline"}`} title={online ? "Online" : "Offline"} />}
    </span>
  );
}

function slug(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function Sidebar({
  user,
  channels,
  dms = [],
  hidden,
  starredIds = new Set(),
  starredChannelIds = new Set(),
  onlineIds = new Set(),
  activeChannel,
  mode = "home",
  onSelect,
  onPrefetchChannel,
  onNewChannel,
  onBrowseChannels,
  browsingChannels = false,
  publicChannelCount = null,
  onStartConversation,
  onOpenDm,
  onPrefetchDm,
  onHideDm,
  onHideChannel,
  onToggleChannelStarred,
  customEmojis = [],
}) {
  const dmsOnly = mode === "dms";
  const [filter, setFilter] = useState("");
  const [chCollapsed, setChCollapsed] = useState(false); // Channels section collapsed?
  const [starredCollapsed, setStarredCollapsed] = useState(false); // Starred section collapsed?
  const [dmCollapsed, setDmCollapsed] = useState(false); // DMs section collapsed?
  const emojiUrls = useMemo(() => customEmojis.map((emoji) => emoji.url), [customEmojis]);
  const authUrls = useAuthUrls(emojiUrls);
  const previewEmojis = customEmojis
    .map((emoji) => ({ ...emoji, url: authUrls.get(emoji.url) }))
    .filter((emoji) => emoji.url);
  const hiddenSet = hidden || new Set();
  const f = filter.trim().toLowerCase();
  // A filter overrides a collapsed section so matches are always visible.
  const showChannels = !chCollapsed || !!f;
  const showStarred = !starredCollapsed || !!f;
  const showDms = !dmCollapsed || !!f;
  const shownChannels = channels
    .filter((c) => !hiddenSet.has(c.id))
    .filter((c) => !f || c.name.toLowerCase().includes(f));
  const shownDms = dms.filter((c) => !f || (c.withUser.displayName || "").toLowerCase().includes(f));
  // Starred DMs get their own section; the rest stay under "Direct Messages".
  const starredDms = shownDms.filter((c) => starredIds.has(c.withUser.id));
  const regularDms = shownDms.filter((c) => !starredIds.has(c.withUser.id));
  const starredChannels = shownChannels.filter((c) => starredChannelIds.has(c.id));
  const regularChannels = shownChannels.filter((c) => !starredChannelIds.has(c.id));

  // Compact DM row used by both the Starred and Direct Messages sections.
  const renderDmRow = (conv) => {
    const active = activeChannel?.type === "dm" && activeChannel?.dmUserId === conv.withUser.id;
    const unread = conv.unread > 0;
    const isStarred = starredIds.has(conv.withUser.id);
    const label = conv.isSelf ? `${conv.withUser.displayName} (you)` : conv.withUser.displayName;
    return (
      <div key={conv.id} className={`channel-item dm-item ${active ? "active" : ""} ${unread ? "unread" : ""}`} data-testid={`dm-row-${slug(conv.withUser.displayName)}`}>
        <button
          className="dm-open"
          data-testid={`dm-open-${slug(conv.withUser.displayName)}`}
          onClick={() => onOpenDm(conv.withUser, conv.isSelf)}
          onMouseEnter={() => onPrefetchDm?.(conv.id)}
          onFocus={() => onPrefetchDm?.(conv.id)}
        >
          <PresenceAvatar
            name={conv.withUser.displayName}
            src={conv.withUser.avatarUrl}
            size={20}
            online={onlineIds.has(conv.withUser.id)}
            showPresence={!(["azure", "system"].includes(conv.withUser.username))}
          />
          <span className="dm-name">{label}</span>
        </button>
        {unread && <span className="unread-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
        <button
          className={`dm-remove ${isStarred ? "reserved" : ""}`}
          data-testid={`dm-remove-${slug(conv.withUser.displayName)}`}
          title={isStarred ? undefined : "Remove conversation"}
          onClick={() => onHideDm(conv)}
          disabled={isStarred}
          aria-hidden={isStarred}
          tabIndex={isStarred ? -1 : 0}
        >
          {dmsOnly ? "Remove" : "✕"}
        </button>
      </div>
    );
  };

  const starredSection = (starredDms.length > 0 || starredChannels.length > 0) ? (
    <>
      <div className="section-label section-toggle starred-section-label">
        <button
          type="button"
          className="sl-collapse"
          data-testid="starred-toggle"
          onClick={() => setStarredCollapsed((v) => !v)}
          aria-expanded={!starredCollapsed}
        >
          <Chevron collapsed={starredCollapsed && !f} />
          <span className="starred-label">Starred ★</span>
        </button>
      </div>
      {showStarred && starredChannels.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`channel-item channel-row starred-channel-row ${!browsingChannels && activeChannel?.id === c.id ? "active" : ""} ${c.unread ? "unread" : ""}`}
          data-testid={`starred-channel-row-${slug(c.name)}`}
          aria-current={!browsingChannels && activeChannel?.id === c.id ? "page" : undefined}
          onClick={() => onSelect(c)}
          onMouseEnter={() => onPrefetchChannel?.(c.id)}
          onFocus={() => onPrefetchChannel?.(c.id)}
        >
          <span className="ch-mark">{c.type === "private" ? <LockKeyholeIcon className="ch-lock" size={11} strokeWidth={1.6} /> : "#"}</span>
          <span className="ci-name">{c.name}</span>
          {c.unread > 0 && <span className="unread-badge">{c.unread > 99 ? "99+" : c.unread}</span>}
        </button>
      ))}
      {showStarred && starredDms.map(renderDmRow)}
    </>
  ) : null;

  return (
    <aside className={`sidebar ${dmsOnly ? "dms-view" : ""}`} data-testid="sidebar">
      {dmsOnly && (
        <div className="sidebar-header" data-testid="dms-header">
          <span className="brand-sm">Direct Messages</span>
        </div>
      )}
      <div className="dm-find">
        <input
          data-testid="sidebar-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={dmsOnly ? "Find a DM" : "Filter channels & DMs"}
        />
        {dmsOnly && <StartConversationButton onClick={onStartConversation} />}
      </div>

      {dmsOnly ? (
        <div className="channel-list">
          {/* Message yourself — always pinned at the top */}
          <div className={`dm-rich dm-self ${activeChannel?.type === "dm" && activeChannel?.dmUserId === user.id ? "active" : ""}`} data-testid="dm-self-row">
            <button className="dm-open" data-testid="dm-self-open" onClick={() => onOpenDm(user, true)}>
              <PresenceAvatar name={user.displayName} src={user.avatarUrl} size={38} online />
              <div className="dm-text">
                <div className="dm-row-top">
                  <span className="dm-name" dir="auto">{user.displayName} <span className="dm-self-tag">you</span></span>
                </div>
                <div className="dm-preview">Notes to self</div>
              </div>
            </button>
          </div>
          {shownDms.filter((c) => !c.isSelf).map((conv) => {
            const active = activeChannel?.type === "dm" && activeChannel?.dmUserId === conv.withUser.id;
            const unread = conv.unread > 0;
            const isStarred = starredIds.has(conv.withUser.id);
            return (
              <div key={conv.id} className={`dm-rich ${active ? "active" : ""} ${unread ? "unread" : ""}`} data-testid={`dm-row-${slug(conv.withUser.displayName)}`}>
                <button className="dm-open" data-testid={`dm-open-${slug(conv.withUser.displayName)}`} onClick={() => onOpenDm(conv.withUser)}>
                  <PresenceAvatar
                    name={conv.withUser.displayName}
                    src={conv.withUser.avatarUrl}
                    size={38}
                    online={onlineIds.has(conv.withUser.id)}
                    showPresence={!(["azure", "system"].includes(conv.withUser.username))}
                  />
                  <div className="dm-text">
                    <div className="dm-row-top">
                      <span className="dm-name" dir="auto">{conv.withUser.displayName}</span>
                      {unread && <span className="unread-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
                      <span className="dm-time">{relativeTime(conv.lastAt)}</span>
                    </div>
                    <div className="dm-preview" dir="auto">
                      {conv.lastFromMe ? "You: " : ""}
                      <Preview body={conv.lastBody} customEmojis={previewEmojis} />
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
          {shownDms.filter((c) => !c.isSelf).length === 0 && (
            <div className="dm-empty">{filter ? "No matches." : "No conversations yet. Compose a new message."}</div>
          )}
        </div>
      ) : (
        // One scrolling list; the Channels and Direct Messages sections each
        // collapse from their header so you can shrink one to see the other.
        <div className="channel-list">
          {starredSection}
          <div className="section-label section-toggle channels-section-label">
            <button
              type="button"
              className="sl-collapse"
              data-testid="channels-toggle"
              onClick={() => setChCollapsed((v) => !v)}
              aria-expanded={!chCollapsed}
            >
              <Chevron collapsed={chCollapsed && !f} />
              <span>Channels</span>
            </button>
            <span className="channel-header-actions" role="group" aria-label="Channel actions">
              <button
                type="button"
                className={`add-channel browse-channels-button ${browsingChannels ? "active" : ""}`}
                data-testid="browse-channels"
                aria-label="Browse all channels"
                aria-pressed={browsingChannels}
                aria-controls="channel-browser-pane"
                title={
                  Number.isFinite(publicChannelCount)
                    ? `Browse ${publicChannelCount} public ${publicChannelCount === 1 ? "channel" : "channels"}`
                    : "Browse public channels"
                }
                onClick={onBrowseChannels}
              >
                <CompassIcon size={14} strokeWidth={1.9} aria-hidden="true" />
              </button>
              <button type="button" className="add-channel" data-testid="create-channel" onClick={onNewChannel} title="Create channel" aria-label="Create channel">
                <span className="add-channel-mark" aria-hidden="true">
                  <span />
                  <span />
                </span>
              </button>
            </span>
          </div>
          {showChannels &&
            regularChannels.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`channel-item channel-row ${!browsingChannels && activeChannel?.id === c.id ? "active" : ""} ${c.unread ? "unread" : ""}`}
                data-testid={`channel-row-${slug(c.name)}`}
                aria-current={!browsingChannels && activeChannel?.id === c.id ? "page" : undefined}
                onClick={() => onSelect(c)}
                onMouseEnter={() => onPrefetchChannel?.(c.id)}
                onFocus={() => onPrefetchChannel?.(c.id)}
              >
                <span className="ch-mark">{c.type === "private" ? <LockKeyholeIcon className="ch-lock" size={11} strokeWidth={1.6} /> : "#"}</span>
                <span className="ci-name">{c.name}</span>
                {c.unread > 0 && <span className="unread-badge">{c.unread > 99 ? "99+" : c.unread}</span>}
              </button>
            ))}
          {showChannels && shownChannels.length === 0 && (
            <div className="dm-empty">{filter ? "No matching channels." : "No channels yet."}</div>
          )}
          <div className="section-label dm-label section-toggle" data-testid="home-dm-section">
            <button
              type="button"
              className="sl-collapse"
              data-testid="dms-toggle"
              onClick={() => setDmCollapsed((v) => !v)}
              aria-expanded={!dmCollapsed}
            >
              <Chevron collapsed={dmCollapsed && !f} />
              <span>Direct Messages</span>
            </button>
            <StartConversationButton onClick={onStartConversation} />
          </div>
          {showDms && regularDms.map(renderDmRow)}
          {showDms && regularDms.length === 0 && (
            <div className="dm-empty">{filter ? "No matching DMs." : "Compose a new message to start a conversation."}</div>
          )}
        </div>
      )}
    </aside>
  );
}

// Section collapse chevron — points down when expanded, right when collapsed.
function Chevron({ collapsed }) {
  return <ChevronDownIcon className={`sl-chevron ${collapsed ? "collapsed" : ""}`} size={11} strokeWidth={2.4} />;
}
