import { useEffect, useRef, useState } from "react";
import { ActivityIcon, BookmarkIcon, CompassIcon, ContactRoundIcon, HomeIcon, MessageSquareTextIcon, SettingsIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import { LeaveIcon } from "./Icons.js";
import Logo from "./Logo.js";
import ProfilePictureDialog from "./ProfilePictureDialog.js";
import DisplayNameDialog from "./DisplayNameDialog.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { api } from "../api.js";
import { uploadSizeError } from "../lib/uploads.js";
import { useAuthUrl, useAuthUrls } from "../lib/useAuthUrl.js";
import { shortcutTitle } from "../lib/keyboardShortcuts.js";
import { MoreIcon } from "./Icons.js";

const icon = (Icon) => () => <Icon size={22} strokeWidth={2} />;
const ITEMS = [
  { key: "home", label: "Home", shortcutId: "go-home", Icon: icon(HomeIcon) },
  { key: "dms", label: "DMs", shortcutId: "go-dms", Icon: icon(MessageSquareTextIcon) },
  { key: "activity", label: "Activity", shortcutId: "go-activity", Icon: icon(ActivityIcon) },
  { key: "saved", label: "Saved", shortcutId: "go-saved", Icon: icon(BookmarkIcon) },
];

function railNameFontSize(name) {
  const longestWord = Math.max(...String(name || "").split(/\s+/).map((word) => Array.from(word).length), 1);
  return Math.max(6, Math.min(12, 68 / (longestWord * 0.66)));
}

export default function LeftRail({ view, onSelect, onBrowseChannels, onOpenGroups, badges = {}, user, workspace, workspaceLoading = false, onLogout, onUpdated, customEmojis = [], latestActivity }) {
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [displayNameDialogOpen, setDisplayNameDialogOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const workspaceLogoSrc = useAuthUrl(workspace?.logoUrl);
  const customEmojiUrls = useAuthUrls(customEmojis.map((emoji) => emoji.url));
  const brandReady = !workspaceLoading && (!workspace?.logoUrl || !!workspaceLogoSrc);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!moreRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

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
      <div className={`rail-brand${brandReady ? " ready" : ""}`} aria-label={workspace?.name || "Echo"} data-testid="rail-brand">
        {workspaceLoading || (workspace?.logoUrl && !workspaceLogoSrc)
          ? <span className={`rail-brand-slot${workspace?.logoUrl ? " is-workspace-logo" : ""}`} aria-hidden="true" />
          : workspaceLogoSrc
          ? <img src={workspaceLogoSrc} width={54} height={54} className="echo-logo workspace-logo-mark" alt="" />
          : <Logo size={54} />}
        {!workspaceLoading && workspace?.name && workspace.name !== "Echo" && <span className="rail-brand-name">{workspace.name}</span>}
      </div>
      <div className="rail-top">
        {ITEMS.map(({ key, label, shortcutId, Icon }) => {
          const count = badges[key] || 0;
          const isLatestReaction = key === "activity" && latestActivity?.kind === "reaction" && latestActivity.unread && latestActivity.emoji;
          const reactionEmoji = isLatestReaction
            ? customEmojis.find((emoji) => `:${emoji.name}:`.toLowerCase() === latestActivity.emoji.toLowerCase())
            : null;
          const reactionImage = reactionEmoji ? customEmojiUrls.get(reactionEmoji.url) : null;
          const activityStateLabel = isLatestReaction
            ? `${label}${count > 1 ? ` · ${count} unread items` : ""} · latest reaction ${latestActivity.emoji}`
            : label;
          return (
            <button
              key={key}
              type="button"
              className={`rail-item rail-item-${key} ${view === key ? "active" : ""}`}
              data-testid={`rail-${key}`}
              aria-label={activityStateLabel}
              title={shortcutTitle(label, shortcutId)}
              aria-current={view === key ? "page" : undefined}
              onClick={() => onSelect(key)}
            >
                <span className="rail-icon" data-testid="rail-icon">
                  <Icon />
                  {(count > 0 || isLatestReaction) && (
                    isLatestReaction ? null : (
                      <span
                        className={`rail-badge ${key === "home" ? "dot" : ""}`}
                        data-testid={`rail-badge-${key}`}
                        aria-hidden="true"
                      >
                        {key === "home" ? null : count > 99 ? "99+" : count}
                      </span>
                    )
                  )}
                </span>
                {isLatestReaction && (
                  <span
                    className="rail-badge rail-badge-emoji"
                    data-testid={`rail-badge-${key}`}
                    aria-hidden="true"
                  >
                    {reactionImage ? <img className="custom-emoji" src={reactionImage} alt="" /> : latestActivity.emoji}
                  </span>
                )}
              </button>
          );
        })}
        {onOpenGroups ? (
          <div className="rail-more-wrap" ref={moreRef}>
            <button type="button" className={`rail-item rail-more-trigger ${moreOpen ? "active" : ""}`} data-testid="sidebar-more" onClick={() => setMoreOpen((open) => !open)} title={moreOpen ? undefined : "More workspace options"} aria-label="More workspace options" aria-expanded={moreOpen} aria-haspopup="menu">
              <span className="rail-icon"><MoreIcon /></span>
            </button>
            {moreOpen ? <>
              <div className="menu-overlay" onMouseDown={() => setMoreOpen(false)} />
              <div className="rail-more-menu" role="menu" aria-label="More workspace options">
                {onBrowseChannels ? <button type="button" role="menuitem" data-testid="more-browse-channels" onClick={() => { setMoreOpen(false); onBrowseChannels(); }} aria-pressed={view === "browse"}><CompassIcon size={16} aria-hidden="true" /><span><strong>Browse channels</strong><small>Find public channels</small></span></button> : null}
                <button type="button" role="menuitem" data-testid="open-groups" onClick={() => { setMoreOpen(false); onOpenGroups(); }}><ContactRoundIcon size={16} aria-hidden="true" /><span><strong>User groups</strong><small>Browse directory teams</small></span></button>
              </div>
            </> : null}
          </div>
        ) : null}
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
              className={`rail-account-action rail-settings-action${view === "settings" ? " active" : ""}`}
              data-testid="rail-settings"
              onClick={() => onSelect("settings")}
              aria-current={view === "settings" ? "page" : undefined}
              title={shortcutTitle("Settings", "open-settings")}
              aria-label="Settings"
            >
              <SettingsIcon size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="rail-account-action rail-signout"
              data-testid="rail-logout"
              onClick={() => setLogoutConfirmOpen(true)}
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
      {logoutConfirmOpen && (
        <ConfirmDialog
          title="Sign out?"
          message="Are you sure you want to sign out of Echo?"
          confirmLabel="Sign out"
          danger
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={() => {
            setLogoutConfirmOpen(false);
            onLogout?.();
          }}
        />
      )}
    </nav>
  );
}
