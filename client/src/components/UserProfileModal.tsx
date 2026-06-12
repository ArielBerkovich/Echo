import Avatar from "./Avatar.js";

// A small profile card shown when you click someone's name, avatar, or @mention.
// Offers a quick "Message" action that opens a DM with them.
export default function UserProfileModal({ user, currentUserId, online, isVip, onToggleVip, onMessage, onClose }) {
  if (!user) return null;
  const isSelf = user.id === currentUserId;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal profile-modal" data-testid="profile-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close profile-close" data-testid="profile-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
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
      </div>
    </div>
  );
}
