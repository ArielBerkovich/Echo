import { useMemo, useState } from "react";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";
import Modal, { ModalActions } from "./Modal.js";
import { useI18n } from "../lib/i18n.js";

export default function LeaveChannelDialog({ open, channel, users, currentUserId, onLeave, onDelete, onClose }) {
  const { t } = useI18n();
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
      <Modal title={t("chooseManagerBeforeLeaving")} className="manager-modal" onClose={onClose}>
        <p className="settings-hint manager-modal-hint">
          {t("chooseManagerBeforeLeavingHint").replace("{channel}", `#${channel.name}`)}
        </p>
        {channel.type === "private" ? (
          <p className="settings-hint leave-saved-warning">
            {t("leavePrivateChannelSavedWarning")}
          </p>
        ) : null}
        <label className="manager-select-field">
          <span>{t("newManager")}</span>
          <input
            className="people-filter"
            data-testid="leave-manager-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPeople")}
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
          )) : <div className="people-empty">{t("noMatchingMembers")}</div>}
        </div>
        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>{t("cancel")}</button>
          <button
            type="button"
            className="btn-danger"
            disabled={!managerId}
            onClick={() => {
              onClose();
              onLeave(channel, managerId);
            }}
          >
            {t("transferAndLeave")}
          </button>
        </ModalActions>
      </Modal>
    );
  }

  const deletesChannel = isCreator && remainingMemberIds.length === 0;
  const privateChannel = channel.type === "private";
  const message = deletesChannel
    ? t(privateChannel ? "deletePrivateChannelMessage" : "deleteChannelMessage")
    : t(privateChannel ? "leavePrivateChannelMessage" : "leavePublicChannelMessage");

  return (
    <ConfirmDialog
      title={t(deletesChannel ? "deleteChannelQuestion" : "leaveChannelQuestion").replace("{channel}", `#${channel.name}`)}
      message={message}
      confirmLabel={t(deletesChannel ? "deleteChannel" : "leave")}
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
  const { t } = useI18n();
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
      {selected ? <span className="manager-selected-check" aria-label={t("selectedManager")}>✓</span> : null}
    </div>
  );
}
