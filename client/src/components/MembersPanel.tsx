import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { SearchIcon, UsersRoundIcon } from "lucide-react";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { CloseButton } from "./Button.js";
import { Button } from "./Button.js";
import { Input, InputShell } from "./Input.js";

export default function MembersPanel({ channel, users = [], onOpenProfile, onAddPeople, onRemoveMember, onPromoteManager, onUpdated, onClose }) {
  const [query, setQuery] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [memberError, setMemberError] = useState(null);
  const [managementError, setManagementError] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [promotingId, setPromotingId] = useState(null);
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(channel.name?.startsWith("dm-") ? "" : channel.name || "");
  const [savingName, setSavingName] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const addPeopleRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const memberIds = channel.members?.length
    ? channel.members
    : (channel.participants || []).map((member) => member.id);
  const members = useMemo(() => {
    const byId = new Map(users.map((user) => [user.id, user]));
    const participantById = new Map((channel.participants || []).map((user) => [user.id, user]));
    return memberIds
      .map((id) => byId.get(id) || participantById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [channel.participants, memberIds, users]);
  const normalizedQuery = query.trim().toLowerCase();
  const shownMembers = normalizedQuery
    ? members.filter(
        (member) =>
          member.displayName.toLowerCase().includes(normalizedQuery) ||
          member.username.toLowerCase().includes(normalizedQuery)
      )
    : members;
  const isMember = memberIds.includes(channel.currentUserId);
  const isManager = (channel.managers || []).includes(channel.currentUserId);
  const isGroupDm = channel.type === "dm" && memberIds.length > 2;
  const canManageGroupDm = isGroupDm && channel.createdBy === channel.currentUserId;
  const canRemoveMembers =
    !!onRemoveMember &&
    (channel.createdBy === channel.currentUserId || isManager) &&
    channel.type !== "dm" &&
    channel.name?.toLowerCase() !== "general";
  const canAddPeople =
    !!onAddPeople &&
    isMember &&
    channel.name?.toLowerCase() !== "general" &&
    (!isGroupDm || memberIds.length < 10);

  async function renameGroupDm() {
    setSavingName(true);
    setManagementError(null);
    try {
      const { channel: updated } = await api.renameGroupDm(channel.id, name);
      onUpdated?.(updated);
      setEditName(false);
    } catch (error) {
      setManagementError(error.message || "Could not rename group DM");
    } finally {
      setSavingName(false);
    }
  }

  async function convertGroupDm() {
    setConverting(true);
    setManagementError(null);
    try {
      const { channel: updated } = await api.convertGroupDm(channel.id, { name });
      onUpdated?.(updated);
      setConvertOpen(false);
    } catch (error) {
      setManagementError(error.message || "Could not convert group DM");
    } finally {
      setConverting(false);
    }
  }

  useEffect(() => {
    (addPeopleRef.current || searchRef.current)?.focus();
  }, [canAddPeople]);

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setMemberError(null);
    try {
      await onRemoveMember(removeTarget.id);
      setRemoveTarget(null);
    } catch (error) {
      setMemberError(error.message || "Could not remove member");
    } finally {
      setRemoving(false);
    }
  }

  async function promoteManager(member) {
    if (!onPromoteManager) return;
    setMemberError(null);
    setPromotingId(member.id);
    try {
      await onPromoteManager(member.id);
    } catch (error) {
      setMemberError(error.message || "Could not make member a manager");
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <aside id="members-panel" className="details-panel members-panel" data-testid="members-panel" role="dialog" aria-labelledby="members-panel-title">
      <header className="members-panel-header">
        <div className="members-panel-title">
          <span className="members-panel-icon" aria-hidden="true">
            <UsersRoundIcon size={20} strokeWidth={1.9} />
          </span>
          <div>
            <h2 id="members-panel-title">Members</h2>
            <span>{channel.memberCount ?? members.length} people in {isGroupDm ? "this group DM" : `#${channel.name}`}</span>
          </div>
        </div>
        <CloseButton size="sm" onClick={onClose} label="Close members" />
      </header>

      <div className="members-panel-body">
        {isGroupDm && canManageGroupDm && (
          <section className="group-dm-management" aria-label="Group DM actions">
            {editName ? (
              <div className="group-dm-name-editor">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Group DM name"
                  aria-label="Group DM name"
                  autoFocus
                />
                <Button variant="primary" onClick={renameGroupDm} disabled={savingName || !name.trim()}>{savingName ? "Saving…" : "Save"}</Button>
                <Button variant="secondary" onClick={() => setEditName(false)} disabled={savingName}>Cancel</Button>
                {managementError && <div className="error members-panel-error group-dm-error" role="alert">{managementError}</div>}
              </div>
            ) : (
              <Button variant="subtle" className="members-panel-action" onClick={() => { setName(channel.name?.startsWith("dm-") ? "" : channel.name || ""); setEditName(true); }}>
                Rename group DM
              </Button>
            )}
            {convertOpen ? (
              <div className="group-dm-convert-editor">
                <p>All current members and messages will stay, and this conversation will become a private channel.</p>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="New private channel name"
                  aria-label="New private channel name"
                />
                <Button variant="primary" onClick={convertGroupDm} disabled={converting || !name.trim()}>{converting ? "Converting…" : "Convert"}</Button>
                <Button variant="secondary" onClick={() => setConvertOpen(false)} disabled={converting}>Cancel</Button>
                {managementError && <div className="error members-panel-error group-dm-error" role="alert">{managementError}</div>}
              </div>
            ) : (
              <Button variant="subtle" className="members-panel-action" onClick={() => { setName(""); setConvertOpen(true); }}>
                Convert to private channel
              </Button>
            )}
          </section>
        )}
        {canAddPeople && (
          <Button ref={addPeopleRef} variant="subtle" className="channel-add-people members-panel-add" onClick={onAddPeople}>
            + Add people
          </Button>
        )}

        <InputShell className="channel-details-search members-panel-search">
          <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
            aria-label="Search members"
          />
        </InputShell>

        {memberError && <div className="error members-panel-error" role="alert">{memberError}</div>}

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
