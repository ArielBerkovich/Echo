import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { SearchIcon, UsersRoundIcon } from "lucide-react";
import { useI18n } from "../lib/i18n.js";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { CloseButton } from "./Button.js";
import { Button } from "./Button.js";
import { Input, InputShell } from "./Input.js";

const MEMBER_ROW_HEIGHT = 58;
const MEMBER_LIST_HEIGHT = 340;

export default function MembersPanel({ channel, users = [], onOpenProfile, onAddPeople, onRemoveMember, onPromoteManager, onUpdated, onClose }) {
  const { t } = useI18n();
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
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listHeight, setListHeight] = useState(MEMBER_LIST_HEIGHT);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef(null);
  const listRef = useRef(null);

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
  const memberIdSet = useMemo(() => new Set(memberIds), [memberIds]);
  const managerIdSet = useMemo(() => new Set(channel.managers || []), [channel.managers]);
  const members = useMemo(() => {
    const byId = new Map(users.map((user) => [user.id, user]));
    const participantById = new Map((channel.participants || []).map((user) => [user.id, user]));
    return memberIds
      .map((id) => byId.get(id) || participantById.get(id))
      .filter(Boolean)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [channel.participants, memberIds, users]);
  const normalizedQuery = query.trim().toLowerCase();
  const shownMembers = useMemo(() => normalizedQuery
    ? members.filter(
      (member) =>
        member.displayName.toLowerCase().includes(normalizedQuery) ||
        member.username.toLowerCase().includes(normalizedQuery)
    )
    : members, [members, normalizedQuery]);
  const firstVisible = Math.max(0, Math.floor(listScrollTop / MEMBER_ROW_HEIGHT) - 2);
  const lastVisible = Math.min(
    shownMembers.length,
    firstVisible + Math.ceil(listHeight / MEMBER_ROW_HEIGHT) + 4,
  );
  const visibleMembers = shownMembers.slice(firstVisible, lastVisible);
  const isMember = memberIdSet.has(channel.currentUserId);
  const isManager = managerIdSet.has(channel.currentUserId);
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

  function onSearchKeyDown(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!shownMembers.length) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (activeIndex + delta + shownMembers.length) % shownMembers.length;
    setActiveIndex(nextIndex);
    const list = listRef.current;
    if (!list) return;
    const nextTop = nextIndex * MEMBER_ROW_HEIGHT;
    const nextBottom = nextTop + MEMBER_ROW_HEIGHT;
    if (nextTop < list.scrollTop) {
      list.scrollTo({ top: nextTop });
    } else if (nextBottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: nextBottom - list.clientHeight });
    }
  }

  async function renameGroupDm() {
    setSavingName(true);
    setManagementError(null);
    try {
      const { channel: updated } = await api.renameGroupDm(channel.id, name);
      onUpdated?.(updated);
      setEditName(false);
    } catch (error) {
      setManagementError(error.message || t("couldNotRenameGroupDm"));
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
      setManagementError(error.message || t("couldNotConvertGroupDm"));
    } finally {
      setConverting(false);
    }
  }

  useEffect(() => {
    searchRef.current?.focus();
  }, [canAddPeople]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const updateHeight = () => setListHeight(list.clientHeight || MEMBER_LIST_HEIGHT);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setMemberError(null);
    try {
      await onRemoveMember(removeTarget.id);
      setRemoveTarget(null);
    } catch (error) {
      setMemberError(error.message || t("couldNotRemoveMember"));
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
      setMemberError(error.message || t("couldNotMakeManager"));
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
            <h2 id="members-panel-title">{t("members")}</h2>
            <span>{isGroupDm ? `${channel.memberCount ?? members.length} ${t("groupMembers")}` : `${channel.memberCount ?? members.length} ${t("peopleIn")} #${channel.name}`}</span>
          </div>
        </div>
        <CloseButton size="sm" onClick={onClose} label={t("closeMembers")} />
      </header>

      <div className="members-panel-body">
        {isGroupDm && canManageGroupDm && (
          <section className="group-dm-management" aria-label="Group DM actions">
            {editName ? (
              <div className="group-dm-name-editor">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("groupDmName")}
                  aria-label={t("groupDmName")}
                  autoFocus
                />
                <Button variant="primary" onClick={renameGroupDm} disabled={savingName || !name.trim()}>{savingName ? t("saving") : t("save")}</Button>
                <Button variant="secondary" onClick={() => setEditName(false)} disabled={savingName}>{t("cancel")}</Button>
                {managementError && <div className="error members-panel-error group-dm-error" role="alert">{managementError}</div>}
              </div>
            ) : (
              <Button variant="subtle" className="members-panel-action" onClick={() => { setName(channel.name?.startsWith("dm-") ? "" : channel.name || ""); setEditName(true); }}>
                {t("renameGroupDm")}
              </Button>
            )}
            {convertOpen ? (
              <div className="group-dm-convert-editor">
                <p>{t("convertGroupDmHint")}</p>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("privateChannelName")}
                  aria-label={t("privateChannelName")}
                />
                <Button variant="primary" onClick={convertGroupDm} disabled={converting || !name.trim()}>{converting ? t("converting") : t("convert")}</Button>
                <Button variant="secondary" onClick={() => setConvertOpen(false)} disabled={converting}>{t("cancel")}</Button>
                {managementError && <div className="error members-panel-error group-dm-error" role="alert">{managementError}</div>}
              </div>
            ) : (
              <Button variant="subtle" className="members-panel-action" onClick={() => { setName(""); setConvertOpen(true); }}>
                {t("convertPrivateChannel")}
              </Button>
            )}
          </section>
        )}
        {canAddPeople && (
          <Button variant="subtle" className="channel-add-people members-panel-add" onClick={onAddPeople}>
            + {t("addPeople")}
          </Button>
        )}

        <InputShell className="channel-details-search members-panel-search">
          <SearchIcon size={16} strokeWidth={1.8} aria-hidden="true" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setListScrollTop(0);
              listRef.current?.scrollTo({ top: 0 });
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={t("searchMembers")}
            aria-label={t("searchMembers")}
          />
        </InputShell>

        {memberError && <div className="error members-panel-error" role="alert">{memberError}</div>}

        <div
          className="members-panel-list"
          ref={listRef}
          onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}
        >
          {members.length === 0 ? (
            <div className="channel-details-empty">{t("noMembersYet")}</div>
          ) : shownMembers.length === 0 ? (
            <div className="channel-details-empty">No members match “{query.trim()}”.</div>
          ) : (
            <div className="members-panel-virtual-content" style={{ height: shownMembers.length * MEMBER_ROW_HEIGHT }}>
              {visibleMembers.map((member, index) => (
                <div
                  className={`members-panel-person${firstVisible + index === activeIndex ? " active" : ""}`}
                  key={member.id}
                  style={{ transform: `translateY(${(firstVisible + index) * MEMBER_ROW_HEIGHT}px)` }}
                >
                  <Avatar name={member.displayName} src={member.avatarUrl} size={38} />
                  <div className="members-panel-person-copy">
                    <button
                      type="button"
                      className="channel-details-person-name channel-details-profile-link interactive-name"
                      onClick={() => onOpenProfile?.(member.id)}
                    >
                      {member.displayName}
                      {member.id === channel.createdBy && <span className="channel-details-creator">Creator</span>}
                      {member.id !== channel.createdBy && managerIdSet.has(member.id) && (
                        <span className="channel-details-creator">{t("manager")}</span>
                      )}
                    </button>
                    <span className="channel-details-person-handle">@{member.username}</span>
                  </div>
                  {canRemoveMembers && member.id !== channel.currentUserId && (
                    <div className="members-panel-actions">
                      {onPromoteManager &&
                        member.id !== channel.createdBy &&
                        !managerIdSet.has(member.id) && (
                          <button
                            type="button"
                            className="members-panel-promote"
                            onClick={() => promoteManager(member)}
                            disabled={promotingId === member.id}
                          >
                            {promotingId === member.id ? t("saving") : t("makeManager")}
                          </button>
                        )}
                      <button
                        type="button"
                        className="members-panel-remove"
                        onClick={() => setRemoveTarget(member)}
                        aria-label={`${t("removeFromChannel")}: ${member.displayName}`}
                      >
                        {t("removeFromChannel")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {removeTarget && (
        <ConfirmDialog
          title={t("removeMemberQuestion").replace("{name}", removeTarget.displayName)}
          message={t("removeMemberMessage").replace("{channel}", `#${channel.name}`)}
          confirmLabel={t("removeFromChannel")}
          danger
          closeDisabled={removing}
          onConfirm={confirmRemove}
          onCancel={() => !removing && setRemoveTarget(null)}
        />
      )}
    </aside>
  );
}
