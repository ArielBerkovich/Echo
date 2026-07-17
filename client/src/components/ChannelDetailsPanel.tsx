import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatDate } from "../lib/time.js";
import Avatar from "./Avatar.js";
import {
  FileTextIcon,
  HashIcon,
  LockKeyholeIcon,
  PlusIcon,
  SearchIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";

// Centered channel information dialog. Members can edit the channel metadata,
// add people, and manage existing members without leaving the conversation.
export default function ChannelDetailsPanel({ channel, users = [], user, onUpdated, onOpenProfile, onAddPeople, onClose }) {
  const [error, setError] = useState(null);
  const [memberQuery, setMemberQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const byId = new Map(users.map((u) => [u.id, u]));
  const creator = byId.get(channel.createdBy);
  const memberIds = new Set(channel.members || []);
  const members = (channel.members || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const isMember = memberIds.has(user.id);
  const isCreator = channel.createdBy === user.id;
  const isManager = (channel.managers || []).includes(user.id);
  const canManageMembers = isCreator || isManager;
  const canAddPeople = isMember && channel.type !== "dm" && channel.name?.toLowerCase() !== "general";
  const q = memberQuery.trim().toLowerCase();
  const shownMembers = q
    ? members.filter(
        (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
      )
    : members;

  async function removeMember(member) {
    setError(null);
    try {
      const { channel: updated } = await api.removeChannelMember(channel.id, member.id);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(patch) {
    setError(null);
    try {
      const { channel: updated } = await api.setChannelInfo(channel.id, patch);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  const ChannelIcon = channel.type === "private" ? LockKeyholeIcon : HashIcon;

  return (
    <div
      className="channel-details-backdrop modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="details-panel channel-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-details-title"
        data-testid="channel-details-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="channel-details-header">
          <div className="channel-details-heading">
            <span className="channel-details-icon" aria-hidden="true">
              <ChannelIcon size={21} strokeWidth={2} />
            </span>
            <div className="channel-details-heading-copy">
              <span className="channel-details-eyebrow">Channel details</span>
              <h2 id="channel-details-title">{channel.name}</h2>
              <span className="channel-details-meta">
                {channel.type === "private" ? "Private channel" : "Public channel"} · {channel.memberCount ?? members.length} members
              </span>
            </div>
          </div>
          <button type="button" className="channel-details-close" onClick={onClose} aria-label="Close channel details">
            <XIcon size={19} strokeWidth={1.8} />
          </button>
        </header>

        <div className="channel-details-content">
          <div className="channel-details-fields">
            <EditableField
              label="Topic"
              icon={<FileTextIcon size={15} strokeWidth={1.9} />}
              value={channel.topic}
              placeholder="Add a topic to help people know what this channel is for."
              editable={isMember}
              onSave={(value) => save({ topic: value })}
            />
            <EditableField
              label="Description"
              icon={<FileTextIcon size={15} strokeWidth={1.9} />}
              value={channel.description}
              placeholder="Add a description for this channel."
              editable={isMember}
              multiline
              onSave={(value) => save({ description: value })}
            />
          </div>

          <section className="channel-details-section channel-details-members-section cd-section">
            <div className="channel-details-section-head">
              <div>
                <div className="channel-details-section-title">
                  <UsersRoundIcon size={16} strokeWidth={1.9} aria-hidden="true" />
                  <span>Members ·</span>
                  <span className="channel-details-count">{channel.memberCount ?? members.length}</span>
                </div>
                <p className="channel-details-section-hint">People who can see and participate in this channel.</p>
              </div>
              <div className="channel-details-section-actions">
                {canAddPeople && (
                  <button type="button" className="channel-details-add" onClick={onAddPeople}>
                    <PlusIcon size={15} strokeWidth={2} />
                    Add people
                  </button>
                )}
              </div>
            </div>

            <div className="channel-details-search channel-details-member-filter">
              <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              <input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Search members"
                aria-label="Search members"
              />
            </div>

            <div className="channel-details-member-list">
              {members.length === 0 ? (
                <div className="channel-details-empty">No members yet.</div>
              ) : shownMembers.length === 0 ? (
                <div className="channel-details-empty">No members match “{memberQuery.trim()}”.</div>
              ) : (
                shownMembers.map((member) => (
                  <div className="channel-details-person" key={member.id}>
                    <Avatar name={member.displayName} src={member.avatarUrl} size={34} />
                    <div className="channel-details-person-copy">
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
                    {canManageMembers && member.id !== channel.createdBy && (
                      <button
                        type="button"
                        className="channel-details-person-remove"
                        onClick={() => removeMember(member)}
                        title={`Remove ${member.displayName} from the channel`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="channel-details-section channel-details-created-section">
            <div className="channel-details-section-title">Created by</div>
            <div className="channel-details-created">
              <Avatar name={creator?.displayName || "Echo"} src={creator?.avatarUrl} size={32} />
              {creator ? (
                <button type="button" className="channel-details-created-name channel-details-profile-link" onClick={() => onOpenProfile?.(creator.id)}>
                  {creator.displayName}
                </button>
              ) : (
                <span className="channel-details-created-name">Echo</span>
              )}
              {channel.createdAt && <span className="channel-details-created-date">{formatDate(channel.createdAt)}</span>}
            </div>
          </section>

          {error && <div className="error">{error}</div>}
        </div>
      </section>
    </div>
  );
}

function EditableField({ label, value, placeholder, editable, multiline, onSave, icon }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(value || "");
    setEditing(true);
  }

  async function commit() {
    if (draft.trim() === (value || "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch {
      /* Error is surfaced by the dialog. */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="channel-details-section channel-details-field cd-section">
      <div className="channel-details-section-head compact">
        <div className="channel-details-section-title">
          {icon}
          <span>{label}</span>
        </div>
        {editable && !editing && (
          <button type="button" className="channel-details-edit" onClick={start}>
            {value ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="channel-details-edit-box">
          {multiline ? (
            <textarea
              className="settings-input"
              rows={3}
              value={draft}
              autoFocus
              dir="auto"
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <input
              className="settings-input"
              value={draft}
              autoFocus
              dir="auto"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && commit()}
            />
          )}
          <div className="channel-details-edit-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={commit}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : value ? (
        <div className="channel-details-value" dir="auto">{value}</div>
      ) : (
        <div className="channel-details-value empty" dir="auto">{placeholder}</div>
      )}
    </section>
  );
}
