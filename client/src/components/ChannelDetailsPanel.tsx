import { useState } from "react";
import { api } from "../api.js";
import { formatDate } from "../lib/time.js";
import Avatar from "./Avatar.js";

// Right-hand channel details panel: topic, description, creator, and members.
// Members can edit the topic & description inline.
export default function ChannelDetailsPanel({ channel, users = [], user, onUpdated, onClose }) {
  const [error, setError] = useState(null);
  const [memberQuery, setMemberQuery] = useState("");

  const byId = new Map(users.map((u) => [u.id, u]));
  const creator = byId.get(channel.createdBy);
  const members = (channel.members || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const isMember = (channel.members || []).includes(user.id);
  const isCreator = channel.createdBy === user.id;

  async function removeMember(m) {
    setError(null);
    try {
      const { channel: updated } = await api.removeChannelMember(channel.id, m.id);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  const mq = memberQuery.trim().toLowerCase();
  const shownMembers = mq
    ? members.filter(
        (m) => m.displayName.toLowerCase().includes(mq) || m.username.toLowerCase().includes(mq)
      )
    : members;

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

  return (
    <aside className="details-panel">
      <header className="thread-header">
        <span className="thread-title">
          {channel.type === "private" ? "🔒" : "#"} {channel.name}
        </span>
        <button className="thread-close" onClick={onClose} aria-label="Close details">✕</button>
      </header>

      <div className="details-body">
        <EditableField
          label="Topic"
          value={channel.topic}
          placeholder="Add a topic"
          editable={isMember}
          onSave={(v) => save({ topic: v })}
        />

        <EditableField
          label="Description"
          value={channel.description}
          placeholder="Add a description"
          editable={isMember}
          multiline
          onSave={(v) => save({ description: v })}
        />

        <div className="cd-section">
          <div className="cd-label">Created by</div>
          <div className="cd-created">
            <Avatar name={creator?.displayName || "Echo"} src={creator?.avatarUrl} size={28} />
            <span className="cd-created-name">{creator?.displayName || "Echo"}</span>
            {channel.createdAt && <span className="cd-created-on">on {formatDate(channel.createdAt)}</span>}
          </div>
        </div>

        <div className="cd-section">
          <div className="cd-label">Members · {channel.memberCount ?? members.length}</div>
          {members.length > 8 && (
            <input
              className="settings-input cd-member-search"
              placeholder="Search members"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
          )}
          <div className="cd-members">
            {members.length === 0 ? (
              <div className="people-empty">No members yet.</div>
            ) : shownMembers.length === 0 ? (
              <div className="people-empty">No members match “{memberQuery.trim()}”.</div>
            ) : (
              shownMembers.map((m) => (
                <div className="cd-member" key={m.id}>
                  <Avatar name={m.displayName} src={m.avatarUrl} size={32} />
                  <div className="cd-member-info">
                    <span className="cd-member-name">
                      {m.displayName}
                      {m.id === channel.createdBy && <span className="cd-creator-badge">creator</span>}
                    </span>
                    <span className="cd-member-handle">@{m.username}</span>
                  </div>
                  {isCreator && m.id !== channel.createdBy && (
                    <button
                      type="button"
                      className="cd-member-remove"
                      title={`Remove ${m.displayName} from the channel`}
                      onClick={() => removeMember(m)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </aside>
  );
}

// A read/edit field. Members see an "Edit" affordance; others see read-only text.
function EditableField({ label, value, placeholder, editable, multiline, onSave }) {
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
      /* error surfaced by parent */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cd-section">
      <div className="cd-label-row">
        <span className="cd-label">{label}</span>
        {editable && !editing && (
          <button type="button" className="cd-edit" onClick={start}>
            {value ? "Edit" : "Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="cd-edit-box">
          {multiline ? (
            <textarea
              className="settings-input"
              rows={3}
              value={draft}
              autoFocus
              dir="auto"
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <input
              className="settings-input"
              value={draft}
              autoFocus
              dir="auto"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commit()}
            />
          )}
          <div className="cd-edit-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={commit}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : value ? (
        <div className="cd-value" dir="auto">{value}</div>
      ) : (
        <div className="cd-value cd-empty">{placeholder}</div>
      )}
    </div>
  );
}
