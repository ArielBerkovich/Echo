import { useMemo, useState } from "react";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";
import Modal, { ModalActions } from "./Modal.js";

export default function LeaveChannelDialog({ open, channel, users, currentUserId, onLeave, onDelete, onClose }) {
  const [managerId, setManagerId] = useState("");
  const [query, setQuery] = useState("");

  const remainingMemberIds = useMemo(
    () => (channel.members || []).filter((memberId) => memberId !== currentUserId),
    [channel.members, currentUserId]
  );
  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users
      .filter((user) => remainingMemberIds.includes(user.id))
      .filter((user) => !normalizedQuery || (
        user.displayName.toLowerCase().includes(normalizedQuery) ||
        user.username.toLowerCase().includes(normalizedQuery)
      ))
      .sort((first, second) => first.displayName.localeCompare(second.displayName));
  }, [query, remainingMemberIds, users]);

  if (!open) return null;

  const isCreator = channel.createdBy === currentUserId;
  const hasRemainingManager = (channel.managers || []).some(
    (id) => id !== currentUserId && remainingMemberIds.includes(id)
  );
  const needsTransfer = isCreator && remainingMemberIds.length > 0 && !hasRemainingManager;

  if (needsTransfer) {
    return (
      <Modal title="Choose a manager before leaving" className="manager-modal" onClose={onClose}>
        <p className="settings-hint manager-modal-hint">
          Choose someone to manage members after you leave #{channel.name}.
        </p>
        {channel.type === "private" ? (
          <p className="settings-hint leave-saved-warning">
            All messages you saved from this private channel will be removed from Saved.
          </p>
        ) : null}
        <label className="manager-select-field">
          <span>New manager</span>
          <input
            className="people-filter"
            data-testid="leave-manager-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            autoFocus
          />
        </label>
        <div className="people-list manager-picker-list">
          {candidates.length ? candidates.map((candidate) => (
            <ManagerCandidate
              key={candidate.id}
              user={candidate}
              selected={managerId === candidate.id}
              onSelect={() => setManagerId(candidate.id)}
            />
          )) : <div className="people-empty">No matching members.</div>}
        </div>
        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-danger"
            disabled={!managerId}
            onClick={() => {
              onClose();
              onLeave(channel, managerId);
            }}
          >
            Transfer & leave
          </button>
        </ModalActions>
      </Modal>
    );
  }

  const deletesChannel = isCreator && remainingMemberIds.length === 0;
  const privateChannel = channel.type === "private";
  const message = deletesChannel
    ? `This channel has no other members. Deleting it will archive its history${privateChannel ? " and remove all messages you saved from it" : ""}.`
    : `You'll stop receiving messages from this channel. ${privateChannel
      ? "All messages you saved from it will be removed from Saved."
      : "You can rejoin later if it's public."}`;

  return (
    <ConfirmDialog
      title={`${deletesChannel ? "Delete" : "Leave"} #${channel.name}?`}
      message={message}
      confirmLabel={deletesChannel ? "Delete channel" : "Leave"}
      danger
      onConfirm={() => {
        onClose();
        deletesChannel ? onDelete?.(channel) : onLeave(channel);
      }}
      onCancel={onClose}
    />
  );
}

function ManagerCandidate({ user, selected, onSelect }) {
  return (
    <div
      className={`person-row manager-candidate ${selected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
      <div className="person-info">
        <div className="person-name">{user.displayName}</div>
        <div className="person-handle">@{user.username}</div>
      </div>
      {selected ? <span className="manager-selected-check" aria-label="Selected manager">✓</span> : null}
    </div>
  );
}
