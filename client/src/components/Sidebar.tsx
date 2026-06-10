import { useState } from "react";
import Logo from "./Logo.js";
import Avatar from "./Avatar.js";
import { relativeTime } from "../lib/time.js";
import { LeaveIcon } from "./Icons.js";

// Small lock glyph for private channels (inherits the navy sidebar text color).
function LockIcon() {
  return (
    <svg className="ch-lock" width="11" height="11" viewBox="0 0 20 20" fill="none">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M6.5 10h7" />
      <path d="M10 6.5v7" />
    </svg>
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

export default function Sidebar({
  user,
  channels,
  dms = [],
  hidden,
  vipIds = new Set(),
  onlineIds = new Set(),
  activeChannel,
  mode = "home",
  onSelect,
  onNewChannel,
  onNewMessage,
  onOpenDm,
  onHideDm,
  onHideChannel,
  onLogout,
  onOpenSettings,
  onOpenApiDocs,
  themeMode = "light",
  onToggleTheme,
}) {
  const dmsOnly = mode === "dms";
  const [filter, setFilter] = useState("");
  const [chCollapsed, setChCollapsed] = useState(false); // Channels section collapsed?
  const [vipCollapsed, setVipCollapsed] = useState(false); // VIP section collapsed?
  const [dmCollapsed, setDmCollapsed] = useState(false); // DMs section collapsed?
  const hiddenSet = hidden || new Set();
  const f = filter.trim().toLowerCase();
  // A filter overrides a collapsed section so matches are always visible.
  const showChannels = !chCollapsed || !!f;
  const showVip = !vipCollapsed || !!f;
  const showDms = !dmCollapsed || !!f;
  const shownChannels = channels
    .filter((c) => !hiddenSet.has(c.id))
    .filter((c) => !f || c.name.toLowerCase().includes(f));
  const shownDms = dms.filter((c) => !f || (c.withUser.displayName || "").toLowerCase().includes(f));
  // VIP DMs get their own section; the rest stay under "Direct Messages".
  const vipDms = shownDms.filter((c) => vipIds.has(c.withUser.id));
  const regularDms = shownDms.filter((c) => !vipIds.has(c.withUser.id));

  // Compact DM row used by both the VIP and Direct Messages sections.
  const renderDmRow = (conv) => {
    const active = activeChannel?.type === "dm" && activeChannel?.dmUserId === conv.withUser.id;
    const unread = conv.unread > 0;
    const label = conv.isSelf ? `${conv.withUser.displayName} (you)` : conv.withUser.displayName;
    return (
      <div key={conv.id} className={`channel-item dm-item ${active ? "active" : ""} ${unread ? "unread" : ""}`}>
        <button className="dm-open" onClick={() => onOpenDm(conv.withUser, conv.isSelf)}>
          <PresenceAvatar
            name={conv.withUser.displayName}
            src={conv.withUser.avatarUrl}
            size={20}
            online={onlineIds.has(conv.withUser.id)}
          />
          <span className="dm-name">{label}</span>
        </button>
        {unread && <span className="unread-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
        <button className="dm-remove" title="Remove conversation" onClick={() => onHideDm(conv)}>
          ✕
        </button>
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Logo size={40} />
        <span className="brand-sm">{dmsOnly ? "Direct messages" : "Echo"}</span>
      </div>

      <div className="dm-find">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={dmsOnly ? "Find a DM" : "Filter channels & DMs"}
        />
        {dmsOnly && (
          <button className="add-channel" onClick={onNewMessage} title="New message" aria-label="New message">
            +
          </button>
        )}
      </div>

      {dmsOnly ? (
        <div className="channel-list">
          {/* Message yourself — always pinned at the top */}
          <div className={`dm-rich dm-self ${activeChannel?.type === "dm" && activeChannel?.dmUserId === user.id ? "active" : ""}`}>
            <button className="dm-open" onClick={() => onOpenDm(user, true)}>
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
            return (
              <div key={conv.id} className={`dm-rich ${active ? "active" : ""} ${unread ? "unread" : ""}`}>
                <button className="dm-open" onClick={() => onOpenDm(conv.withUser)}>
                  <PresenceAvatar
                    name={conv.withUser.displayName}
                    src={conv.withUser.avatarUrl}
                    size={38}
                    online={onlineIds.has(conv.withUser.id)}
                  />
                  <div className="dm-text">
                    <div className="dm-row-top">
                      <span className="dm-name" dir="auto">{conv.withUser.displayName}</span>
                      <span className="dm-time">{relativeTime(conv.lastAt)}</span>
                    </div>
                    <div className="dm-preview" dir="auto">
                      {conv.lastFromMe ? "You: " : ""}
                      {preview(conv.lastBody)}
                    </div>
                  </div>
                </button>
                {unread && <span className="unread-badge">{conv.unread > 99 ? "99+" : conv.unread}</span>}
                <button className="dm-remove" title="Remove conversation" onClick={() => onHideDm(conv)}>
                  ✕
                </button>
              </div>
            );
          })}
          {shownDms.filter((c) => !c.isSelf).length === 0 && (
            <div className="dm-empty">{filter ? "No matches." : "No conversations. Start one with +."}</div>
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
              onClick={() => setChCollapsed((v) => !v)}
              aria-expanded={!chCollapsed}
            >
              <Chevron collapsed={chCollapsed && !f} />
              <span>Channels</span>
            </button>
            <button className="add-channel" onClick={onNewChannel} title="Create channel" aria-label="Create channel">
              +
            </button>
          </div>
          {showChannels &&
            shownChannels.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`channel-item channel-row ${activeChannel?.id === c.id ? "active" : ""} ${c.unread ? "unread" : ""}`}
                onClick={() => onSelect(c)}
              >
                <span className="ch-mark">{c.type === "private" ? <LockIcon /> : "#"}</span>
                <span className="ci-name">{c.name}</span>
                {c.unread > 0 && <span className="unread-badge">{c.unread > 99 ? "99+" : c.unread}</span>}
              </button>
            ))}
          {showChannels && shownChannels.length === 0 && (
            <div className="dm-empty">{filter ? "No matching channels." : "No channels yet."}</div>
          )}

          {vipDms.length > 0 && (
            <>
              <div className="section-label section-toggle">
                <button
                  type="button"
                  className="sl-collapse"
                  onClick={() => setVipCollapsed((v) => !v)}
                  aria-expanded={!vipCollapsed}
                >
                  <Chevron collapsed={vipCollapsed && !f} />
                  <span className="vip-label">★ VIP</span>
                </button>
              </div>
              {showVip && vipDms.map(renderDmRow)}
            </>
          )}

          <div className="section-label dm-label section-toggle">
            <button
              type="button"
              className="sl-collapse"
              onClick={() => setDmCollapsed((v) => !v)}
              aria-expanded={!dmCollapsed}
            >
              <Chevron collapsed={dmCollapsed && !f} />
              <span>Direct Messages</span>
            </button>
          </div>
          {showDms && regularDms.map(renderDmRow)}
          {showDms && regularDms.length === 0 && (
            <div className="dm-empty">{filter ? "No matching DMs." : "Use search to start a conversation."}</div>
          )}
        </div>
      )}

      <div className="sidebar-footer">
        <button className="me-button" onClick={onOpenSettings} title="Settings">
          <Avatar name={user.displayName} src={user.avatarUrl} size={36} />
          <div className="who">
            <div className="me" dir="auto">{user.displayName}</div>
            <div className="status">active</div>
          </div>
        </button>
        <div className="footer-actions">
          <button
            className="link"
            onClick={onToggleTheme}
            title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle dark mode"
          >
            {themeMode === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="link" onClick={onOpenApiDocs} title="API reference" aria-label="API reference">
            <ApiIcon />
          </button>
          <button className="link" onClick={onOpenSettings} title="Settings">
            <GearIcon />
          </button>
          <button className="link footer-signout" onClick={onLogout} title="Sign out" aria-label="Sign out">
            <LeaveIcon />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

// Section collapse chevron — points down when expanded, right when collapsed.
function Chevron({ collapsed }) {
  return (
    <svg
      className={`sl-chevron ${collapsed ? "collapsed" : ""}`}
      width="11" height="11" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 11.5A6.5 6.5 0 018.5 3.5a6.5 6.5 0 108 8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M13.9 13.9l1.6 1.6M15.5 4.5l-1.4 1.4M6.1 13.9l-1.6 1.6" />
    </svg>
  );
}

function ApiIcon() {
  return <span className="api-mini-icon" aria-hidden="true">API</span>;
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
