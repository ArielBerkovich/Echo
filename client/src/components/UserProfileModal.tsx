import Avatar from "./Avatar.js";
import Modal from "./Modal.js";
import { StarIcon } from "lucide-react";
import { useI18n } from "../lib/i18n.js";

// A small profile card shown when you click someone's name, avatar, or @mention.
// Offers a quick "Message" action that opens a DM with them.
export default function UserProfileModal({ user, currentUserId, online, isStarred, onToggleStarred, onMessage, onClose }) {
  const { t } = useI18n();
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
        {isDirectoryOnly ? <div className="profile-directory-source">Managed in RHSSO</div> : !(["azure", "system"].includes(user.username)) && (
          <div className={`profile-presence ${online ? "online" : ""}`} data-testid="profile-presence">
            <span className="profile-dot" />
            {online ? t("active") : t("away")}
          </div>
        )}
      </div>
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
            Message
          </button>
        </div>
      )}
    </Modal>
  );
}
