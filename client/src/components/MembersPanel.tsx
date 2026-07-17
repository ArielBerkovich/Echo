import { useEffect, useMemo, useState } from "react";
import { SearchIcon, UsersRoundIcon, XIcon } from "lucide-react";
import Avatar from "./Avatar.js";

export default function MembersPanel({ channel, users = [], onOpenProfile, onAddPeople, onClose }) {
  const [query, setQuery] = useState("");

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

        {onAddPeople && isMember && (
          <button type="button" className="members-panel-add" onClick={onAddPeople}>
            + Add people
          </button>
        )}

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
                  </button>
                  <span className="channel-details-person-handle">@{member.username}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
