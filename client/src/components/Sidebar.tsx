import { useState } from "react";
import { ChevronDownIcon, CompassIcon, LockKeyholeIcon, SquarePenIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import { relativeTime } from "../lib/time.js";

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

// Plain-text preview of a (markdown) message body for the DM list.
function preview(body) {
  if (!body) return "No messages yet";
  return body.replace(/\s+/g, " ").trim().slice(0, 40);
}

// An avatar with a presence dot in the corner (green = online, grey = offline).
function PresenceAvatar({ name, src, size, online }) {
  return (
    <span className="avatar-wrap">
      <Avatar name={name} src={src} size={size} />
      <span className={`presence-dot ${online ? "online" : "offline"}`} title={online ? "Online" : "Offline"} />
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
}) {
  const dmsOnly = mode === "dms";
  const [filter, setFilter] = useState("");
  const [chCollapsed, setChCollapsed] = useState(false); // Channels section collapsed?
  const [starredCollapsed, setStarredCollapsed] = useState(false); // Starred section collapsed?
  const [dmCollapsed, setDmCollapsed] = useState(false); // DMs section collapsed?
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

  // Compact DM row used by both the Starred and Direct Messages sections.
  const renderDmRow = (conv) => {
    const active = activeChannel?.type === "dm" && activeChannel?.dmUserId === conv.withUser.id;
    const unread = conv.unread > 0;
    const isStarred = starredIds.has(conv.withUser.id);
    const label = conv.isSelf ? `${conv.withUser.displayName} (you)` : conv.withUser.displayName;
    return (
      <div key={conv.id} className={`channel-item dm-item ${active ? "active" : ""} ${unread ? "unread" : ""}`}>
        <button
          className="dm-open"
          onClick={() => onOpenDm(conv.withUser, conv.isSelf)}
          onMouseEnter={() => onPrefetchDm?.(conv.id)}
          onFocus={() => onPrefetchDm?.(conv.id)}
        >
          <PresenceAvatar
            name={conv.withUser.displayName}
            src={conv.withUser.avatarUrl}
            size={20}
            online={onlineIds.has(conv.withUser.id)}
          />
          <span className="dm-name">{label}</span>
        </button>
        {unread && <span className="unread-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
        <button
          className={`dm-remove ${isStarred ? "reserved" : ""}`}
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

  return (
    <aside className={`sidebar ${dmsOnly ? "dms-view" : ""}`} data-testid="sidebar">
      {dmsOnly && (
        <div className="sidebar-header" data-testid="dms-header">
          <span className="brand-sm">Direct messages</span>
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
                  />
                  <div className="dm-text">
                    <div className="dm-row-top">
                      <span className="dm-name" dir="auto">{conv.withUser.displayName}</span>
                      {unread && <span className="unread-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
                      <span className="dm-time">{relativeTime(conv.lastAt)}</span>
                    </div>
                    <div className="dm-preview" dir="auto">
                      {conv.lastFromMe ? "You: " : ""}
                      {preview(conv.lastBody)}
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
          <div className="section-label section-toggle">
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
            shownChannels.map((c) => (
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
          {starredDms.length > 0 && (
            <>
              <div className="section-label section-toggle">
                <button
                  type="button"
                  className="sl-collapse"
                  data-testid="starred-toggle"
                  onClick={() => setStarredCollapsed((v) => !v)}
                  aria-expanded={!starredCollapsed}
                >
                  <Chevron collapsed={starredCollapsed && !f} />
                  <span className="starred-label">★ Starred</span>
                </button>
              </div>
              {showStarred && starredDms.map(renderDmRow)}
            </>
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
