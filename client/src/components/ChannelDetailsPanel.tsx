import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { api } from "../api.js";
import { formatDate } from "../lib/time.js";
import Avatar from "./Avatar.js";
import { Button, CloseButton } from "./Button.js";
import { Input, InputShell } from "./Input.js";
import Modal from "./Modal.js";
import {
  FileTextIcon,
  HashIcon,
  LockKeyholeIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersRoundIcon,
  LogOutIcon,
  Globe2Icon,
} from "lucide-react";

// Centered channel information dialog. Members can edit the channel metadata,
// add people, and manage existing members without leaving the conversation.
export default function ChannelDetailsPanel({ channel, users = [], user, onUpdated, onOpenProfile, onAddPeople, onPromoteManager, onChangeVisibility, onLeave, onClose }) {
  const [error, setError] = useState(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [promotingId, setPromotingId] = useState(null);

  const byId = new Map(users.map((u) => [u.id, u]));
  const creator = byId.get(channel.createdBy);
  const memberIds = new Set(channel.members || []);
  const members = (channel.members || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const managerIds = new Set(channel.managers || []);
  const managerMembers = members.filter((member) => managerIds.has(member.id));
  const isMember = memberIds.has(user.id);
  const isCreator = channel.createdBy === user.id;
  const isManager = (channel.managers || []).includes(user.id);
  const canManagePosting = channel.type !== "dm" && (isCreator || isManager);
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

  async function promoteManager(member) {
    if (!onPromoteManager) return;
    setError(null);
    setPromotingId(member.id);
    try {
      await onPromoteManager(member.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setPromotingId(null);
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
    <Modal
      title="Channel details"
      className="details-panel channel-details-dialog"
      backdropClassName="channel-details-backdrop"
      testId="channel-details-dialog"
      showHeader={false}
      showClose={false}
      onClose={onClose}
    >
        <header className="channel-details-header">
          <div className="channel-details-heading">
            <span className="channel-details-icon" aria-hidden="true">
              <ChannelIcon size={21} strokeWidth={2} />
            </span>
            <div className="channel-details-heading-copy">
              <span className="channel-details-eyebrow">Channel details</span>
              <Dialog.Title id="channel-details-title">{channel.name}</Dialog.Title>
              <span className="channel-details-meta">
                {channel.type === "private" ? "Private channel" : "Public channel"} · {channel.memberCount ?? members.length} members
              </span>
            </div>
          </div>
          <Dialog.Close asChild>
            <CloseButton size="sm" label="Close channel details" />
          </Dialog.Close>
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

          {canManagePosting && (
            <section className="channel-details-section channel-details-posting-section cd-section">
              <div className="channel-details-section-head">
                <div>
                  <div className="channel-details-section-title">Posting permissions</div>
                  <p className="channel-details-section-hint">
                    {channel.readOnly
                      ? "Only the channel creator and managers can post messages and replies."
                      : "Everyone in this channel can post messages and replies."}
                  </p>
                </div>
                <label className={`channel-readonly-toggle${channel.readOnly ? " is-enabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!channel.readOnly}
                    data-testid="channel-readonly-toggle"
                    aria-label="Managers only"
                    onChange={(event) => {
                      void save({ readOnly: event.target.checked }).catch(() => {});
                    }}
                  />
                  <span className="channel-readonly-switch" aria-hidden="true">
                    <span className="channel-readonly-switch-thumb" />
                  </span>
                  <span className="channel-readonly-toggle-copy">
                    <span>Managers only</span>
                    <span className="channel-readonly-toggle-state">{channel.readOnly ? "On" : "Off"}</span>
                  </span>
                </label>
              </div>
            </section>
          )}

          <section className="channel-details-section channel-details-members-section cd-section">
            <div className="channel-details-section-head">
              <div>
                <div className="channel-details-section-title">
                  <UsersRoundIcon size={16} strokeWidth={1.9} aria-hidden="true" />
                  <span>Members</span>
                  <span className="channel-details-count">{channel.memberCount ?? members.length}</span>
                </div>
                <p className="channel-details-section-hint">People who can see and participate in this channel.</p>
              </div>
            </div>

            {canAddPeople && (
              <Button variant="subtle" className="channel-add-people channel-details-add-primary" onClick={onAddPeople}>
                <PlusIcon size={17} strokeWidth={2.2} />
                <span>Add people to this channel</span>
              </Button>
            )}

            <InputShell className="channel-details-search channel-details-member-filter">
              <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              <Input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Search members"
                aria-label="Search members"
              />
            </InputShell>

            <div className="channel-details-managers" data-testid="channel-details-managers" aria-label="Channel managers">
              <span className="channel-details-managers-label">Managers</span>
              {managerMembers.length > 0 ? (
                managerMembers.map((manager) => (
                  <button
                    type="button"
                    className="channel-details-manager-chip"
                    key={manager.id}
                    onClick={() => onOpenProfile?.(manager.id)}
                  >
                    {manager.displayName}
                  </button>
                ))
              ) : (
                <span className="channel-details-no-managers">None assigned</span>
              )}
            </div>

            <div className="channel-details-member-list">
              {members.length === 0 ? (
                <div className="channel-details-empty">No members yet.</div>
              ) : shownMembers.length === 0 ? (
                <div className="channel-details-empty">No members match “{memberQuery.trim()}”.</div>
              ) : (
                shownMembers.map((member) => (
                  <div className="channel-details-person" data-testid={`channel-details-person-${member.id}`} key={member.id}>
                    <Avatar name={member.displayName} src={member.avatarUrl} size={34} />
                    <div className="channel-details-person-copy">
                      <button
                        type="button"
                        className="channel-details-person-name channel-details-profile-link interactive-name"
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
                      <div className="channel-details-person-actions">
                        {!managerIds.has(member.id) && onPromoteManager && (
                          <button
                            type="button"
                            className="channel-details-person-promote"
                            data-testid={`channel-promote-${member.id}`}
                            onClick={() => promoteManager(member)}
                            disabled={promotingId === member.id}
                            title="Make manager"
                          >
                            {promotingId === member.id ? "Saving…" : "Make manager"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="channel-details-person-remove"
                          data-testid={`channel-remove-${member.id}`}
                          onClick={() => removeMember(member)}
                          title="Remove from channel"
                          aria-label={`Remove ${member.displayName} from the channel`}
                        >
                          <Trash2Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                          <span className="channel-details-remove-label">Remove</span>
                        </button>
                      </div>
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
                <button type="button" className="channel-details-created-name channel-details-profile-link interactive-name" onClick={() => onOpenProfile?.(creator.id)}>
                  {creator.displayName}
                </button>
              ) : (
                <span className="channel-details-created-name">Echo</span>
              )}
              {channel.createdAt && <span className="channel-details-created-date">{formatDate(channel.createdAt)}</span>}
            </div>
          </section>

          {(channel.createdBy === user.id && channel.type === "private" || isMember && channel.name?.toLowerCase() !== "general") && (
            <section className="channel-details-section channel-details-actions-section">
              <div className="channel-details-section-title">Channel actions</div>
              <p className="channel-details-section-hint">Less frequent changes live here so the conversation stays focused.</p>
              <div className="channel-details-actions-list">
                {channel.createdBy === user.id && channel.type === "private" && (
                  <button type="button" className="channel-details-action channel-details-action-visibility" data-testid="channel-visibility" onClick={onChangeVisibility}>
                    <Globe2Icon size={16} strokeWidth={1.9} />
                    <span>
                      <strong>Make public</strong>
                      <small>Let anyone in the workspace discover and join this channel.</small>
                    </span>
                  </button>
                )}
                {isMember && channel.name?.toLowerCase() !== "general" && (
                  <button type="button" className="channel-details-action channel-details-action-danger" data-testid="channel-leave" onClick={onLeave}>
                    <LogOutIcon size={16} strokeWidth={1.9} />
                    <span>
                      <strong>Leave channel</strong>
                      <small>Stop receiving updates from this conversation.</small>
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}

          {error && <div className="error">{error}</div>}
        </div>
    </Modal>
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
          <Button
            variant="subtle"
            className="channel-details-edit"
            onClick={start}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                start();
              }
            }}
          >
            {value ? "Edit" : "Add"}
          </Button>
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
