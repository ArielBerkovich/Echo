import { useState } from "react";
import { ChevronDownIcon, LockKeyholeIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react";
import Logo from "./Logo.js";
import Avatar from "./Avatar.js";
import { relativeTime } from "../lib/time.js";
import { LeaveIcon } from "./Icons.js";

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
  vipIds = new Set(),
  onlineIds = new Set(),
  activeChannel,
  mode = "home",
  onSelect,
  onPrefetchChannel,
  onNewChannel,
  onOpenDm,
  onPrefetchDm,
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
    const isVip = vipIds.has(conv.withUser.id);
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
          className={`dm-remove ${isVip ? "reserved" : ""}`}
          title={isVip ? undefined : "Remove conversation"}
          onClick={() => onHideDm(conv)}
          disabled={isVip}
          aria-hidden={isVip}
          tabIndex={isVip ? -1 : 0}
        >
          {dmsOnly ? "Remove" : "✕"}
        </button>
      </div>
    );
  };

  return (
    <aside className={`sidebar ${dmsOnly ? "dms-view" : ""}`}>
      <div className="sidebar-header">
        <Logo size={40} />
        <span className="brand-sm">{dmsOnly ? "Direct messages" : "Echo"}</span>
      </div>

      <div className="dm-find">
        <input
          data-testid="sidebar-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={dmsOnly ? "Find a DM" : "Filter channels & DMs"}
        />
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
            const isVip = vipIds.has(conv.withUser.id);
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
              data-testid="channels-toggle"
              onClick={() => setChCollapsed((v) => !v)}
              aria-expanded={!chCollapsed}
            >
              <Chevron collapsed={chCollapsed && !f} />
              <span>Channels</span>
            </button>
            <button className="add-channel" data-testid="create-channel" onClick={onNewChannel} title="Create channel" aria-label="Create channel">
              <span className="add-channel-mark" aria-hidden="true">
                <span />
                <span />
              </span>
            </button>
          </div>
          {showChannels &&
            shownChannels.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`channel-item channel-row ${activeChannel?.id === c.id ? "active" : ""} ${c.unread ? "unread" : ""}`}
                data-testid={`channel-row-${slug(c.name)}`}
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

          {vipDms.length > 0 && (
            <>
              <div className="section-label section-toggle">
                <button
                  type="button"
                  className="sl-collapse"
                  data-testid="vip-toggle"
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
              data-testid="dms-toggle"
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
        <button className="me-button account-card" data-testid="sidebar-settings" onClick={onOpenSettings} title="Open account settings">
          <Avatar name={user.displayName} src={user.avatarUrl} size={42} />
          <div className="who account-copy">
            <div className="me" dir="auto">{user.displayName}</div>
            <div className="status">Active</div>
          </div>
          <span className="account-caret" aria-hidden="true">›</span>
        </button>
        <div className="footer-actions account-actions">
          <button
            className="link"
            onClick={onToggleTheme}
            title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle dark mode"
          >
            {themeMode === "dark" ? <SunIcon size={16} strokeWidth={1.5} /> : <MoonIcon size={16} strokeWidth={1.5} />}
          </button>
          <button className="link" data-testid="sidebar-api-docs" onClick={onOpenApiDocs} title="API reference" aria-label="API reference">
            <ApiIcon />
          </button>
          <button className="link" onClick={onOpenSettings} title="Settings">
            <SettingsIcon size={17} strokeWidth={1.7} />
          </button>
          <button className="link footer-signout" data-testid="sidebar-logout" onClick={onLogout} title="Sign out" aria-label="Sign out">
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
  return <ChevronDownIcon className={`sl-chevron ${collapsed ? "collapsed" : ""}`} size={11} strokeWidth={2.4} />;
}

function ApiIcon() {
  return <span className="api-mini-icon" aria-hidden="true">API</span>;
}
