import { useEffect, useMemo, useState } from "react";
import { SearchIcon, UsersRoundIcon, XIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";

export default function MembersPanel({ channel, users = [], onOpenProfile, onAddPeople, onRemoveMember, onPromoteManager, onClose }) {
  const [query, setQuery] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeError, setRemoveError] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [promotingId, setPromotingId] = useState(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const members = useMemo(() => {
    const byId = new Map(users.map((user) => [user.id, user]));
    return (channel.members || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [channel.members, users]);
  const normalizedQuery = query.trim().toLowerCase();
  const shownMembers = normalizedQuery
    ? members.filter(
        (member) =>
          member.displayName.toLowerCase().includes(normalizedQuery) ||
          member.username.toLowerCase().includes(normalizedQuery)
      )
    : members;
  const isMember = (channel.members || []).includes(channel.currentUserId);
  const isManager = (channel.managers || []).includes(channel.currentUserId);
  const canRemoveMembers =
    !!onRemoveMember &&
    (channel.createdBy === channel.currentUserId || isManager) &&
    channel.type !== "dm" &&
    channel.name?.toLowerCase() !== "general";
  const canAddPeople =
    !!onAddPeople &&
    isMember &&
    channel.type !== "dm" &&
    channel.name?.toLowerCase() !== "general";

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemoveMember(removeTarget.id);
      setRemoveTarget(null);
    } catch (error) {
      setRemoveError(error.message || "Could not remove member");
    } finally {
      setRemoving(false);
    }
  }

  async function promoteManager(member) {
    if (!onPromoteManager) return;
    setRemoveError(null);
    setPromotingId(member.id);
    try {
      await onPromoteManager(member.id);
    } catch (error) {
      setRemoveError(error.message || "Could not make member a manager");
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <aside className="details-panel members-panel" role="dialog" aria-labelledby="members-panel-title">
      <header className="members-panel-header">
        <div className="members-panel-title">
          <span className="members-panel-icon" aria-hidden="true">
            <UsersRoundIcon size={20} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="members-panel-title">Members</h2>
            <span>{channel.memberCount ?? members.length} people in #{channel.name}</span>
          </div>
        </div>
        <button type="button" className="channel-details-close" onClick={onClose} aria-label="Close members">
          <XIcon size={19} strokeWidth={1.8} />
        </button>
      </header>

      <div className="members-panel-body">
        <div className="channel-details-search members-panel-search">
          <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
            aria-label="Search members"
          />
        </div>

        {canAddPeople && (
          <button type="button" className="members-panel-add" onClick={onAddPeople}>
            + Add people
          </button>
        )}

        {removeError && <div className="error members-panel-error">{removeError}</div>}

        <div className="members-panel-list">
          {members.length === 0 ? (
            <div className="channel-details-empty">No members yet.</div>
          ) : shownMembers.length === 0 ? (
            <div className="channel-details-empty">No members match “{query.trim()}”.</div>
          ) : (
            shownMembers.map((member) => (
              <div className="members-panel-person" key={member.id}>
                <Avatar name={member.displayName} src={member.avatarUrl} size={38} />
                <div className="members-panel-person-copy">
                  <button
                    type="button"
                    className="channel-details-person-name channel-details-profile-link"
                    onClick={() => onOpenProfile?.(member.id)}
                  >
                    {member.displayName}
                    {member.id === channel.createdBy && <span className="channel-details-creator">Creator</span>}
                    {member.id !== channel.createdBy && (channel.managers || []).includes(member.id) && (
                      <span className="channel-details-creator">Manager</span>
                    )}
                  </button>
                  <span className="channel-details-person-handle">@{member.username}</span>
                </div>
                {canRemoveMembers && member.id !== channel.currentUserId && (
                  <div className="members-panel-actions">
                    {onPromoteManager &&
                      member.id !== channel.createdBy &&
                      !(channel.managers || []).includes(member.id) && (
                        <button
                          type="button"
                          className="members-panel-promote"
                          onClick={() => promoteManager(member)}
                          disabled={promotingId === member.id}
                        >
                          {promotingId === member.id ? "Saving…" : "Make manager"}
                        </button>
                      )}
                    <button
                      type="button"
                      className="members-panel-remove"
                      onClick={() => setRemoveTarget(member)}
                      aria-label={`Remove ${member.displayName}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.displayName}?`}
          message={`They will lose access to #${channel.name}.`}
          confirmLabel="Remove"
          danger
          closeDisabled={removing}
          onConfirm={confirmRemove}
          onCancel={() => !removing && setRemoveTarget(null)}
        />
      )}
    </aside>
  );
}
