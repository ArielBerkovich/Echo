import Avatar from "./Avatar.js";
import Modal from "./Modal.js";
import { StarIcon, ContactRoundIcon, ChevronRightIcon } from "lucide-react";
import { useI18n } from "../lib/i18n.js";
import { useEffect, useState } from "react";
import { api } from "../api.js";

// A small profile card shown when you click someone's name, avatar, or @mention.
// Offers a quick "Message" action that opens a DM with them.
export default function UserProfileModal({ user, currentUserId, online, isStarred, onToggleStarred, onMessage, onOpenGroup, onClose }) {
  const { t } = useI18n();
  const [groups, setGroups] = useState([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setGroups([]);
    setGroupsLoaded(false);
    api.listGroups().then(({ groups: items = [] }) => {
      if (!cancelled) setGroups(items.filter((group) => group.members?.some((member) => String(member.id) === String(user?.id))));
    }).catch(() => {}).finally(() => { if (!cancelled) setGroupsLoaded(true); });
    return () => { cancelled = true; };
  }, [user?.id]);
  if (!user) return null;
  const isSelf = user.id === currentUserId;
  const isDirectoryOnly = user.directoryOnly === true;

  return (
    <Modal
      title={`${user.displayName}'s profile`}
      className="profile-modal"
      closeClassName="profile-close"
      closeTestId="profile-close"
      showHeader={false}
      testId="profile-modal"
      onClose={onClose}
    >
      <div className="profile-head">
        <Avatar name={user.displayName} src={user.avatarUrl} size={96} />
        <div className="profile-name" dir="auto">{user.displayName}</div>
        <div className="profile-handle">@{user.username}</div>
        {isDirectoryOnly ? <div className="profile-directory-source">{t("managedInRhssO")}</div> : !(["azure", "system"].includes(user.username)) && (
          <div className={`profile-presence ${online ? "online" : ""}`} data-testid="profile-presence">
            <span className="profile-dot" />
            {online ? t("online") : t("offline")}
          </div>
        )}
      </div>
      <section className="profile-groups" aria-labelledby="profile-groups-title">
        <h3 id="profile-groups-title">{t("groupsTitle")}</h3>
        {!groupsLoaded ? <div className="profile-groups-status" role="status">{t("loadingGroups")}</div> : groups.length ? (
          <div className="profile-groups-list">
            {groups.map((group) => <button type="button" className="profile-group-link" key={group.id} onClick={() => onOpenGroup?.(group)}>
              <span className="profile-group-icon"><ContactRoundIcon size={17} aria-hidden="true" /></span>
              <span className="profile-group-name">{group.name}</span>
              <ChevronRightIcon className="profile-group-arrow" size={16} aria-hidden="true" />
            </button>)}
          </div>
        ) : <div className="profile-groups-status">{t("noGroupsForUser")}</div>}
      </section>
      {!isSelf && !isDirectoryOnly && (
        <div className="profile-actions">
          <button
            type="button"
            className={`profile-starred ${isStarred ? "active" : ""}`}
            data-testid="profile-starred"
            onClick={onToggleStarred}
            aria-label={isStarred ? t("removeFromStarred") : t("markAsStarred")}
            title={isStarred ? t("removeFromStarred") : t("markAsStarred")}
          >
            <StarIcon className="profile-star-icon" size={23} strokeWidth={1.8} fill={isStarred ? "currentColor" : "none"} />
          </button>
          <button type="button" className="btn-primary profile-message" data-testid="profile-message" onClick={() => onMessage(user)}>
            {t("message")}
          </button>
        </div>
      )}
    </Modal>
  );
}
