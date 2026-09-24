import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { formatDate } from "../lib/time.js";
import Avatar from "./Avatar.js";
import { Button, CloseButton } from "./Button.js";
import { Input, InputShell } from "./Input.js";
import Modal from "./Modal.js";
import { useI18n } from "../lib/i18n.js";
import {
  FileTextIcon,
  HashIcon,
  LockKeyholeIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  LogOutIcon,
  Globe2Icon,
  PencilIcon,
} from "lucide-react";

const MEMBER_ROW_HEIGHT = 58;
const MEMBER_LIST_HEIGHT = 340;

// Centered channel information dialog. Members can edit the channel metadata,
// add people, and manage existing members without leaving the conversation.
export default function ChannelDetailsPanel({ channel, users = [], user, onUpdated, onOpenProfile, onAddPeople, onPromoteManager, onChangeVisibility, onLeave, onClose }) {
  const { t } = useI18n();
  const [error, setError] = useState(null);
  const [errorField, setErrorField] = useState(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [promotingId, setPromotingId] = useState(null);
  const [activeTab, setActiveTab] = useState("details");
  const [activeMemberIndex, setActiveMemberIndex] = useState(0);
  const memberSearchRef = useRef(null);
  const memberListRef = useRef(null);
  const [memberListScrollTop, setMemberListScrollTop] = useState(0);
  const [memberListHeight, setMemberListHeight] = useState(MEMBER_LIST_HEIGHT);

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
  const isGeneralChannel = channel.name?.toLowerCase() === "general";
  const canAddPeople = isMember && channel.type !== "dm" && !isGeneralChannel;
  const checkNameAvailability = useCallback(
    (name) => api.checkChannelNameAvailability(channel.id, name),
    [channel.id],
  );
  const tabs = [
    ["details", t("details")],
    ["members", t("members")],
    ...(!isGeneralChannel ? [["actions", t("actions")]] : []),
  ];
  const q = memberQuery.trim().toLowerCase();
  const shownMembers = useMemo(() => q
    ? members.filter(
        (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
      )
    : members, [members, q]);
  const firstVisibleMember = Math.max(0, Math.floor(memberListScrollTop / MEMBER_ROW_HEIGHT) - 2);
  const lastVisibleMember = Math.min(
    shownMembers.length,
    firstVisibleMember + Math.ceil(memberListHeight / MEMBER_ROW_HEIGHT) + 4,
  );
  const visibleMembers = shownMembers.slice(firstVisibleMember, lastVisibleMember);

  useEffect(() => {
    const list = memberListRef.current;
    if (!list) return;
    const top = activeMemberIndex * MEMBER_ROW_HEIGHT;
    const bottom = top + MEMBER_ROW_HEIGHT;
    if (top < list.scrollTop) list.scrollTo({ top });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight });
  }, [activeMemberIndex]);

  useEffect(() => {
    const list = memberListRef.current;
    if (!list || activeTab !== "members") return undefined;
    const updateHeight = () => setMemberListHeight(list.clientHeight || MEMBER_LIST_HEIGHT);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "members") return;
    const focusFrame = window.requestAnimationFrame(() => {
      memberSearchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeTab]);

  function onMemberSearchKeyDown(event) {
    if (event.key === "Enter") {
      const selected = shownMembers[activeMemberIndex];
      if (!selected) return;
      event.preventDefault();
      onOpenProfile?.(selected.id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!shownMembers.length) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    setActiveMemberIndex((index) => (index + delta + shownMembers.length) % shownMembers.length);
  }

  async function removeMember(member) {
    setError(null);
    setErrorField(null);
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
    setErrorField(null);
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
    setErrorField(patch.name !== undefined ? "name" : null);
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
      title={t("channelDetails")}
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
              <span className="channel-details-eyebrow">{t("channelDetails")}</span>
              <Dialog.Title id="channel-details-title">{channel.name}</Dialog.Title>
              <span className="channel-details-meta">
                {channel.type === "private" ? t("privateChannel") : t("publicChannel")} · {channel.memberCount ?? members.length} {t("groupMembers")}
              </span>
            </div>
          </div>
          <Dialog.Close asChild>
            <CloseButton size="sm" label="Close channel details" />
          </Dialog.Close>
        </header>

        <nav className="channel-details-tabs" role="tablist" aria-label="Channel details sections">
          {tabs.map(([tab, label]) => (
            <button
              type="button"
              role="tab"
              key={tab}
              id={`channel-details-tab-${tab}`}
              aria-selected={activeTab === tab}
              className={`channel-details-tab${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
              {tab === "members" && <span className="channel-details-tab-count">{channel.memberCount ?? members.length}</span>}
            </button>
          ))}
        </nav>

        <div className={`channel-details-content channel-details-content-${activeTab}`}>
          {activeTab === "details" && <div className="channel-details-tabpanel" role="tabpanel" id="channel-details-panel-details" aria-labelledby="channel-details-tab-details">
            <div className="channel-details-overview-title">{t("aboutChannel")}</div>
            <div className="channel-details-fields">
              {canManageMembers && !isGeneralChannel && (
                <EditableName
                  value={channel.name}
                  error={errorField === "name" ? error : null}
                  onCheckAvailability={checkNameAvailability}
                  onSave={(value) => save({ name: value })}
                />
              )}
              <EditableField
                label={t("topic")}
                icon={<FileTextIcon size={15} strokeWidth={1.9} />}
                value={channel.topic}
                placeholder={t("addTopicHint")}
                editable={isMember}
                onSave={(value) => save({ topic: value })}
              />
              <EditableField
                label={t("description")}
                icon={<FileTextIcon size={15} strokeWidth={1.9} />}
                value={channel.description}
                placeholder={t("addDescriptionHint")}
                editable={isMember}
                multiline
                onSave={(value) => save({ description: value })}
              />
            </div>

            <section className="channel-details-section channel-details-created-section">
              <div className="channel-details-section-title">{t("createdBy")}</div>
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
          </div>}

          {activeTab === "actions" && <div className="channel-details-tabpanel" role="tabpanel" id="channel-details-panel-actions" aria-labelledby="channel-details-tab-actions">
            {canManagePosting && (
              <section className="channel-details-section channel-details-posting-section cd-section">
                <div className="channel-details-section-head">
                  <div>
                    <div className="channel-details-section-title">{t("postingPermissions")}</div>
                    <p className="channel-details-section-hint">
                      {channel.readOnly
                        ? t("postingManagersHint") : t("postingEveryoneHint")}
                    </p>
                  </div>
                  <label className={`channel-readonly-toggle${channel.readOnly ? " is-enabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={!!channel.readOnly}
                      data-testid="channel-readonly-toggle"
                      aria-label={t("managersOnly")}
                      onChange={(event) => {
                        void save({ readOnly: event.target.checked }).catch(() => {});
                      }}
                    />
                    <span className="channel-readonly-switch" aria-hidden="true">
                      <span className="channel-readonly-switch-thumb" />
                    </span>
                    <span className="channel-readonly-toggle-copy">
                      <span>{t("managersOnly")}</span>
                      <span className="channel-readonly-toggle-state">{channel.readOnly ? t("on") : t("off")}</span>
                    </span>
                  </label>
                </div>
              </section>
            )}

          {(channel.createdBy === user.id && channel.type === "private" || isMember && channel.name?.toLowerCase() !== "general") && (
            <section className="channel-details-section channel-details-actions-section">
              <div className="channel-details-section-title">{t("channelActions")}</div>
              <p className="channel-details-section-hint">{t("channelActionsHint")}</p>
              <div className="channel-details-actions-list">
                {channel.createdBy === user.id && channel.type === "private" && (
                  <button type="button" className="channel-details-action channel-details-action-visibility" data-testid="channel-visibility" onClick={onChangeVisibility}>
                    <Globe2Icon size={16} strokeWidth={1.9} />
                    <span>
                      <strong>{t("makePublic")}</strong>
                      <small>{t("makePublicHint")}</small>
                    </span>
                  </button>
                )}
                {isMember && channel.name?.toLowerCase() !== "general" && (
                  <button type="button" className="channel-details-action channel-details-action-danger" data-testid="channel-leave" onClick={onLeave}>
                    <LogOutIcon size={16} strokeWidth={1.9} />
                    <span>
                      <strong>{t("leaveChannel")}</strong>
                      <small>{t("leaveChannelHint")}</small>
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}
          </div>}

          {activeTab === "members" && <section className="channel-details-section channel-details-members-section cd-section" role="tabpanel" id="channel-details-panel-members" aria-labelledby="channel-details-tab-members">
            {canAddPeople && (
              <Button variant="subtle" className="channel-add-people channel-details-add-primary" onClick={onAddPeople}>
                <PlusIcon size={17} strokeWidth={2.2} />
                <span>{t("addPeople")}</span>
              </Button>
            )}

            <InputShell className="channel-details-search channel-details-member-filter">
              <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              <Input
                ref={memberSearchRef}
                value={memberQuery}
                onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setActiveMemberIndex(0);
                  setMemberListScrollTop(0);
                  memberListRef.current?.scrollTo({ top: 0 });
                }}
                onKeyDown={onMemberSearchKeyDown}
                placeholder={t("searchMembers")}
                aria-label={t("searchMembers")}
              />
            </InputShell>

            <div className="channel-details-managers" data-testid="channel-details-managers" aria-label="Channel managers">
              <span className="channel-details-managers-label">{t("managers")}</span>
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
                <span className="channel-details-no-managers">{t("noManagers")}</span>
              )}
            </div>

            <div
              className="channel-details-member-list channel-details-member-list--virtual"
              ref={memberListRef}
              onScroll={(event) => setMemberListScrollTop(event.currentTarget.scrollTop)}
            >
              {members.length === 0 ? (
                <div className="channel-details-empty">{t("noMembersYet")}</div>
              ) : shownMembers.length === 0 ? (
                <div className="channel-details-empty">{t("noMembersMatchQuery").replace("{query}", memberQuery.trim())}</div>
              ) : (
                <div className="channel-details-member-virtual-content" style={{ height: shownMembers.length * MEMBER_ROW_HEIGHT }}>
                {visibleMembers.map((member, index) => (
                  <div
                    className={`channel-details-person${firstVisibleMember + index === activeMemberIndex ? " active" : ""}`}
                    data-testid={`channel-details-person-${member.id}`}
                    key={member.id}
                    style={{ transform: `translateY(${(firstVisibleMember + index) * MEMBER_ROW_HEIGHT}px)` }}
                  >
                    <Avatar name={member.displayName} src={member.avatarUrl} size={34} />
                    <div className="channel-details-person-copy">
                      <button
                        type="button"
                        className="channel-details-person-name channel-details-profile-link interactive-name"
                        onClick={() => onOpenProfile?.(member.id)}
                      >
                        {member.displayName}
                        {member.id === channel.createdBy && <span className="channel-details-creator">{t("creator")}</span>}
                        {member.id !== channel.createdBy && (channel.managers || []).includes(member.id) && (
                          <span className="channel-details-creator">{t("manager")}</span>
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
                            title={t("makeManager")}
                          >
                            {promotingId === member.id ? t("saving") : t("makeManager")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="channel-details-person-remove"
                          data-testid={`channel-remove-${member.id}`}
                          onClick={() => removeMember(member)}
                          title={t("removeFromChannel")}
                          aria-label={`${t("removeFromChannel")}: ${member.displayName}`}
                        >
                          <Trash2Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}
            </div>
          </section>}

          {error && errorField !== "name" && <div className="error">{error}</div>}
        </div>
    </Modal>
  );
}

function EditableName({ value, error, onCheckAvailability, onSave }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const [availability, setAvailability] = useState("idle");
  const normalized = draft.trim().toLowerCase();
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) && normalized.length <= 64 && normalized !== "general";
  const unchanged = normalized === String(value || "").toLowerCase();
  const canSave = valid && (unchanged || availability === "available") && !saving;
  const showFormatError = changed && !valid;
  const showTakenError = changed && valid && availability === "taken";
  const validationError = normalized.length === 0
    ? "Channel name is required."
    : normalized === "general"
    ? "“general” is reserved for the default channel."
    : "Use lowercase letters, numbers, and single dashes only.";

  function start() {
    setDraft(value || "");
    setChanged(false);
    setAvailability("idle");
    setEditing(true);
  }

  useEffect(() => {
    if (!editing || !changed || !valid || unchanged) {
      setAvailability("idle");
      return undefined;
    }
    setAvailability("checking");
    let active = true;
    const timer = window.setTimeout(() => {
      onCheckAvailability(normalized)
        .then(({ available }) => {
          if (active) setAvailability(available ? "available" : "taken");
        })
        .catch(() => {
          if (active) setAvailability("error");
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [changed, editing, normalized, onCheckAvailability, unchanged, valid]);

  async function commit() {
    if (!valid || (!unchanged && availability !== "available")) return;
    if (unchanged) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      setEditing(false);
    } catch {
      /* Error is surfaced by the dialog. */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="channel-details-section channel-details-field cd-section" data-testid="channel-rename-section">
      <div className="channel-details-section-head compact">
        <div className="channel-details-section-title">
          <PencilIcon size={15} strokeWidth={1.9} />
          <span>{t("channelName")}</span>
        </div>
        {!editing && (
          <Button variant="subtle" className="channel-details-edit" onClick={start} data-testid="channel-rename-edit">
            {t("edit")}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="channel-details-edit-box">
          <Input
            className="settings-input"
            value={draft}
            autoFocus
            maxLength={64}
            aria-label={t("channelName")}
            aria-invalid={showFormatError || showTakenError}
            aria-describedby={showFormatError || showTakenError ? "channel-rename-hint channel-rename-validation" : "channel-rename-hint"}
            onChange={(event) => {
              setChanged(true);
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commit();
              }
            }}
          />
          <div className="channel-details-section-hint" id="channel-rename-hint">
            {t("channelNameHint")}
          </div>
          {showFormatError && <div className="error" id="channel-rename-validation" role="alert">{validationError}</div>}
          {changed && valid && availability === "checking" && <div className="channel-details-section-hint" role="status">{t("checkingName")}</div>}
          {showTakenError && <div className="error" id="channel-rename-validation" role="alert">This channel name is already in use.</div>}
          {changed && valid && availability === "error" && <div className="error" id="channel-rename-validation" role="alert">Couldn’t check this name. Try again.</div>}
          {error && <div className="error" role="alert">{error}</div>}
          <div className="channel-details-edit-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t("cancel")}</button>
            <button type="button" className="btn-primary" disabled={!canSave} onClick={() => void commit()}>
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <div className="channel-details-value" dir="ltr">#{value}</div>
      )}
    </section>
  );
}

function EditableField({ label, value, placeholder, editable, multiline, onSave, icon }) {
  const { t } = useI18n();
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
            {value ? t("edit") : t("add")}
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
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t("cancel")}</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={commit}>
              {saving ? t("saving") : t("save")}
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
