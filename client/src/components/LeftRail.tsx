import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIcon, BookmarkIcon, HomeIcon, MessageSquareTextIcon, SettingsIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import { LeaveIcon } from "./Icons.js";
import Logo from "./Logo.js";
import ProfilePictureDialog from "./ProfilePictureDialog.js";
import DisplayNameDialog from "./DisplayNameDialog.js";
import { api } from "../api.js";
import { uploadSizeError } from "../lib/uploads.js";

const icon = (Icon) => () => <Icon size={22} strokeWidth={2} />;
const ITEMS = [
  { key: "home", label: "Home", Icon: icon(HomeIcon) },
  { key: "dms", label: "DMs", Icon: icon(MessageSquareTextIcon) },
  { key: "activity", label: "Activity", Icon: icon(ActivityIcon) },
  { key: "saved", label: "Saved", Icon: icon(BookmarkIcon) },
];

function railNameFontSize(name) {
  const longestWord = Math.max(...String(name || "").split(/\s+/).map((word) => Array.from(word).length), 1);
  return Math.max(6, Math.min(12, 68 / (longestWord * 0.66)));
}

export default function LeftRail({ view, onSelect, badges = {}, user, onLogout, onUpdated }) {
  const [clicked, setClicked] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [displayNameDialogOpen, setDisplayNameDialogOpen] = useState(false);
  const [indicatorOffset, setIndicatorOffset] = useState(null);
  const clickTimerRef = useRef(null);
  const railTopRef = useRef(null);
  const itemRefs = useRef(new Map());

  const activeIndex = ITEMS.findIndex((item) => item.key === view);

  useLayoutEffect(() => {
    const railTop = railTopRef.current;
    const activeItem = itemRefs.current.get(view);
    if (!railTop || !activeItem) return undefined;

    const updateIndicatorPosition = () => {
      const railTopRect = railTop.getBoundingClientRect();
      const activeItemRect = activeItem.getBoundingClientRect();
      setIndicatorOffset(
        activeItemRect.top + activeItemRect.height / 2 - railTopRect.top - railTop.clientTop
      );
    };

    updateIndicatorPosition();
    const observer = new ResizeObserver(updateIndicatorPosition);
    observer.observe(railTop);
    observer.observe(activeItem);
    return () => observer.disconnect();
  }, [view]);
  useEffect(() => () => clearTimeout(clickTimerRef.current), []);

  function pulse(key) {
    clearTimeout(clickTimerRef.current);
    setClicked(key);
    clickTimerRef.current = setTimeout(() => setClicked(null), 650);
  }

  function onAvatarFileSelected(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (uploadSizeError([file], undefined, "Profile pictures")) return;
    setAvatarFile(file);
  }

  async function saveAvatar(file) {
    try {
      const { attachments } = await api.uploadFiles([file]);
      const { user: updated } = await api.updateProfile({ avatarKey: attachments[0].key });
      onUpdated?.(updated);
      setAvatarFile(null);
      setAvatarDialogOpen(false);
      setAvatarDialogOpen(false);
    } catch (error) {
      throw error;
    }
  }

  async function saveDisplayName(displayName) {
    const { user: updated } = await api.updateProfile({ displayName });
    onUpdated?.(updated);
    setDisplayNameDialogOpen(false);
  }

  return (
    <nav className="rail" aria-label="Primary navigation">
      <div className="rail-brand" aria-label="Echo" data-testid="rail-brand">
        <Logo size={54} />
      </div>
      <div
        ref={railTopRef}
        className="rail-top"
        style={{ "--rail-indicator-offset": indicatorOffset == null ? "0px" : `${indicatorOffset}px` }}
      >
        {activeIndex >= 0 && indicatorOffset != null && <span className="rail-active-indicator" data-testid="rail-active-indicator" aria-hidden="true" />}
        {ITEMS.map(({ key, label, Icon }) => {
          const count = badges[key] || 0;
          return (
            <button
              key={key}
              type="button"
              className={`rail-item rail-item-${key} ${view === key ? "active" : ""} ${clicked === key ? "clicked" : ""}`}
              data-testid={`rail-${key}`}
              aria-label={label}
              title={label}
              aria-current={view === key ? "page" : undefined}
              ref={(node) => {
                if (node) itemRefs.current.set(key, node);
                else itemRefs.current.delete(key);
              }}
              onClick={() => {
                pulse(key);
                onSelect(key);
              }}
            >
              <span className="rail-icon" data-testid="rail-icon">
                <Icon />
                {count > 0 && (
                  <span className={`rail-badge ${key === "home" ? "dot" : ""}`} data-testid={`rail-badge-${key}`} aria-hidden="true">
                    {key === "home" ? null : count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {user && (
        <div className="rail-account">
          <button
            type="button"
            className="rail-account-button"
            data-testid="rail-account"
            onClick={() => setAvatarDialogOpen(true)}
            title="Update profile picture"
            aria-label="Update profile picture"
          >
            <span className="avatar-wrap rail-account-avatar">
              <Avatar name={user.displayName} src={user.avatarUrl} size={48} />
              <span className="presence-dot online" title="Active" aria-label="Active" />
            </span>
          </button>
          <button
            type="button"
            className="rail-account-name-button"
            onClick={() => setDisplayNameDialogOpen(true)}
            title="Update display name"
            aria-label="Update display name"
          >
            <span className="rail-account-name" data-testid="rail-account-name" dir="auto" style={{ fontSize: `${railNameFontSize(user.displayName)}px` }}>{user.displayName}</span>
          </button>
          <div className="rail-account-actions">
            <button
              type="button"
              className={`rail-account-action rail-settings-action${view === "settings" ? " active" : ""}${clicked === "settings" ? " clicked" : ""}`}
              data-testid="rail-settings"
              onClick={() => {
                pulse("settings");
                onSelect("settings");
              }}
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="rail-account-action rail-signout"
              data-testid="rail-logout"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LeaveIcon />
            </button>
          </div>
        </div>
      )}
      {avatarDialogOpen && <ProfilePictureDialog file={avatarFile} currentSrc={user?.avatarUrl} onFileSelected={onAvatarFileSelected} onSave={saveAvatar} onClose={() => { setAvatarFile(null); setAvatarDialogOpen(false); }} />}
      {displayNameDialogOpen && <DisplayNameDialog value={user.displayName} onSave={saveDisplayName} onClose={() => setDisplayNameDialogOpen(false)} />}
    </nav>
  );
}
