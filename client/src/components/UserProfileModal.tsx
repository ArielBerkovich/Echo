import Avatar from "./Avatar.js";
import Modal from "./Modal.js";

// A small profile card shown when you click someone's name, avatar, or @mention.
// Offers a quick "Message" action that opens a DM with them.
export default function UserProfileModal({ user, currentUserId, online, isVip, onToggleVip, onMessage, onClose }) {
  if (!user) return null;
  const isSelf = user.id === currentUserId;

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
        <div className={`profile-presence ${online ? "online" : ""}`}>
          <span className="profile-dot" />
          {online ? "Active" : "Away"}
        </div>
      </div>
      {!isSelf && (
        <div className="profile-actions">
          <button type="button" className="btn-primary profile-message" data-testid="profile-message" onClick={() => onMessage(user)}>
            Message
          </button>
          <button
            type="button"
            className={`profile-vip ${isVip ? "active" : ""}`}
            data-testid="profile-vip"
            onClick={onToggleVip}
            title={isVip ? "Remove from VIP" : "Mark as VIP"}
          >
            <span className="vip-star">{isVip ? "★" : "☆"}</span>
            {isVip ? "VIP" : "Mark as VIP"}
          </button>
        </div>
      )}
    </Modal>
  );
}
