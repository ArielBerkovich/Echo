import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon,
  ContactRoundIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { Button } from "./Button.js";
import ConfirmDialog from "./ConfirmDialog.js";
import Modal, { ModalActions } from "./Modal.js";
import useRecipientPickerKeyboard from "./useRecipientPickerKeyboard.js";
import { useI18n } from "../lib/i18n.js";

const EMPTY_FORM = { name: "", description: "", memberIds: [] };
const PEOPLE_RESULT_LIMIT = 50;
const GROUP_NAME_PATTERN = /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/;

function sortGroups(groups) {
  return [...groups].sort((left, right) => {
    if (left.isMember !== right.isMember) return left.isMember ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function matchesQuery(value, query) {
  return String(value || "").toLowerCase().includes(query);
}

function GroupDirectory({ groups, selected, query, loading, onQueryChange, onSelect }) {
  const { t } = useI18n();
  const text = query.trim().toLowerCase();
  const visibleGroups = sortGroups(
    text
      ? groups.filter((group) => matchesQuery(`${group.name} ${group.handle} ${group.description}`, text))
      : groups
  );

  return (
    <aside className="groups-panel-list" aria-label={t("groupDirectory")}>
      <div className="groups-panel-list-head">
        <div className="groups-panel-search">
          <SearchIcon size={16} aria-hidden="true" />
          <input className="groups-panel-filter" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("searchGroups")} aria-label={t("searchGroups")} />
          {query ? <button type="button" aria-label={t("clearGroupSearch")} onClick={() => onQueryChange("")}><XIcon size={14} aria-hidden="true" /></button> : null}
        </div>
      </div>
      <div className="groups-panel-list-body">
        {loading ? <div className="groups-empty-state"><p>{t("loadingGroups")}</p></div> : null}
        {!loading && visibleGroups.length ? visibleGroups.map((group) => (
          <button type="button" key={group.id} className={`groups-panel-group${selected?.id === group.id ? " active" : ""}`} aria-current={selected?.id === group.id ? "true" : undefined} onClick={() => onSelect(group)}>
            <span className="groups-panel-group-icon"><ContactRoundIcon size={18} aria-hidden="true" /></span>
            <span className="groups-panel-group-copy">
              <strong>{group.name}{group.isMember ? <span className="groups-membership-badge">{t("joined")}</span> : null}</strong>
              <small>{group.memberCount} {group.memberCount === 1 ? t("member") : t("groupMembers")}</small>
            </span>
            <ChevronRightIcon className="groups-panel-group-arrow" size={16} aria-hidden="true" />
          </button>
        )) : null}
        {!loading && !visibleGroups.length ? <div className="groups-empty-state"><span className="groups-empty-state-icon"><ContactRoundIcon size={24} aria-hidden="true" /></span><strong>{query ? t("noMatchingGroups") : t("noGroupsYet")}</strong><p>{query ? `${t("noMatchingGroups")} “${query.trim()}”.` : t("groupEmptyHint")}</p></div> : null}
      </div>
    </aside>
  );
}

function GroupMember({ member, removable, onOpenProfile, onRemove }) {
  const { t } = useI18n();
  return (
    <div className="groups-panel-member">
      <button type="button" className="groups-member-profile" onClick={() => onOpenProfile(member)}>
        <Avatar name={member.displayName} src={member.avatarUrl} size={36} />
        <span className="person-info"><span className="person-name">{member.displayName}{member.role === "owner" ? <span className="groups-owner-badge">{t("owner")}</span> : null}</span><span className="person-handle">@{member.username}</span></span>
      </button>
      {removable ? <button type="button" className="groups-member-remove" onClick={() => onRemove(member.id)} aria-label={`${t("removeMember")}: ${member.displayName}`} title={t("removeMember")}><UserMinusIcon size={15} strokeWidth={1.9} aria-hidden="true" /></button> : null}
    </div>
  );
}

function GroupDetails({ group, onOpenProfile, onLeave, onAddPeople, onRemoveMember }) {
  const { t } = useI18n();
  const [memberQuery, setMemberQuery] = useState("");
  const visibleMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return group.members;
    return group.members.filter((member) => matchesQuery(`${member.displayName} ${member.username}`, query));
  }, [group.members, memberQuery]);

  useEffect(() => {
    setMemberQuery("");
  }, [group.id]);

  return (
    <section className="groups-detail-section" aria-label={t("groupMembersLabel")}>
      <header className="groups-detail-section-head">
        <div className="groups-members-search">
          <SearchIcon size={15} aria-hidden="true" />
          <label className="sr-only" htmlFor="group-member-search">{t("searchMembers")}</label>
          <input id="group-member-search" type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder={t("searchMembers")} />
        </div>
        {group.isMember ? <div className="groups-detail-section-actions"><Button variant="subtle" onClick={onLeave}><LogOutIcon size={15} aria-hidden="true" />{t("leaveGroup")}</Button><Button variant="subtle" onClick={onAddPeople}><UserPlusIcon size={15} aria-hidden="true" />{t("addPeople")}</Button></div> : null}
      </header>
      <div className="groups-detail-list">
        {visibleMembers.length ? visibleMembers.map((member) => <GroupMember key={member.id} member={member} removable={group.isMember && member.id !== group.currentUserId} onOpenProfile={onOpenProfile} onRemove={onRemoveMember} />) : <div className="groups-members-empty">{t("noMembersMatch").replace("{query}", memberQuery.trim())}</div>}
      </div>
    </section>
  );
}

function CreateGroupDialog({ form, users, memberQuery, error, creating, loadingDirectory, onFormChange, onMemberQueryChange, onAddMember, onRemoveMember, onSubmit, onClose, groupNameRef }) {
  const { t } = useI18n();
  const selectedMembers = useMemo(() => {
    const usersById = new Map(users.map((user) => [user.id, user]));
    return form.memberIds.map((id) => usersById.get(id)).filter(Boolean);
  }, [form.memberIds, users]);
  const matches = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return users.filter((user) => !form.memberIds.includes(user.id) && (!query || matchesQuery(`${user.displayName} ${user.username}`, query))).slice(0, 20);
  }, [form.memberIds, memberQuery, users]);
  const { activeIndex, activeItem, activeOptionRef, handleKeyDown, setActiveIndex } = useRecipientPickerKeyboard({ items: matches, hasQuery: Boolean(memberQuery.trim()), onSelect: onAddMember });

  return (
    <Modal title={t("createGroup")} className="groups-create-modal" closeDisabled={creating} onClose={onClose} onOpenAutoFocus={(event) => { event.preventDefault(); groupNameRef.current?.focus(); }}>
      <form className="groups-create-form" onSubmit={onSubmit}>
        <label><span className="groups-field-label">{t("groupName")}</span><input ref={groupNameRef} required maxLength={40} pattern="[A-Za-z0-9]+([ -][A-Za-z0-9]+)*" title={t("groupNameFormatHint")} placeholder={t("groupNameHint")} value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value.replace(/[^A-Za-z0-9 -]/g, "") })} /></label>
        <label><span className="groups-field-label">{t("description")} <em>{t("optional")}</em></span><textarea maxLength={160} placeholder={t("groupDescriptionHint")} value={form.description} onChange={(event) => onFormChange({ ...form, description: event.target.value })} /></label>
        <label htmlFor="create-group-member-search"><span className="groups-field-label">{t("addPeople")} <em>{t("optional")}</em></span></label>
        <div className="groups-member-picker">
          {selectedMembers.length ? <div className="forward-selected-chips" aria-label={t("selectedGroupMembers")}>{selectedMembers.map((user) => <span className="forward-chip" data-testid="group-creation-member" key={user.id}><span>{user.displayName}</span><button type="button" className="chip-remove" aria-label={`${t("remove")}: ${user.displayName}`} onClick={() => onRemoveMember(user.id)}><XIcon size={13} aria-hidden="true" /></button></span>)}</div> : null}
          <input id="create-group-member-search" className="people-filter forward-destination-search" type="search" value={memberQuery} onChange={(event) => { onMemberQueryChange(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder={loadingDirectory ? t("loadingPeople") : t("searchPeople")} disabled={loadingDirectory} role="combobox" aria-autocomplete="list" aria-controls={memberQuery.trim() ? "create-group-member-results" : undefined} aria-expanded={Boolean(memberQuery.trim())} aria-activedescendant={activeItem ? `create-group-member-${activeItem.id}` : undefined} />
          {memberQuery.trim() ? <div id="create-group-member-results" className="forward-destination-list groups-member-results" role="listbox" aria-label={t("peopleToAdd")}>{matches.length ? matches.map((user, index) => <button type="button" id={`create-group-member-${user.id}`} key={user.id} className={`forward-destination-row${activeIndex === index ? " keyboard-active" : ""}`} role="option" aria-selected="false" ref={(element) => { if (element && activeIndex === index) activeOptionRef.current = element; }} onMouseEnter={() => setActiveIndex(index)} onClick={() => onAddMember(user)}><Avatar name={user.displayName} src={user.avatarUrl} size={34} /><span className="forward-destination-copy"><strong>{user.displayName}</strong><small dir="ltr">@{user.username}</small></span><span className="forward-selection-indicator" aria-hidden="true"><PlusIcon size={14} /></span></button>) : <div className="people-empty" role="status">{t("noPeopleMatch")} “{memberQuery.trim()}”.</div>}</div> : null}
        </div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        <ModalActions><Button variant="secondary" onClick={onClose} disabled={creating}>{t("cancel")}</Button><Button variant="primary" type="submit" disabled={creating || !form.name.trim()}>{creating ? t("creating") : t("createGroup")}</Button></ModalActions>
      </form>
    </Modal>
  );
}

function AddPeopleDialog({ users, memberIds, query, loading, addingId, onQueryChange, onAdd, onClose }) {
  const { t } = useI18n();
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return users.filter((user) => !memberIds.has(user.id) && (!text || matchesQuery(`${user.displayName} ${user.username}`, text))).slice(0, PEOPLE_RESULT_LIMIT);
  }, [memberIds, query, users]);

  return (
    <Modal title={t("addPeopleToGroup")} className="groups-picker-modal" onClose={onClose}>
      <p className="groups-dialog-intro">{t("groupMembershipHint")}</p>
      <input className="people-filter" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("searchPeople")} aria-label={t("searchPeopleToAdd")} autoFocus />
      <div className="people-list groups-picker-list">
        {loading ? <div className="people-empty">{t("loadingPeople")}</div> : null}
        {!loading && matches.length ? matches.map((user) => <div className="person-row groups-picker-row" key={user.id}><Avatar name={user.displayName} src={user.avatarUrl} size={34} /><div className="person-info"><div className="person-name">{user.displayName}</div><div className="person-handle">@{user.username}</div></div><Button variant="secondary" disabled={addingId === user.id} onClick={() => onAdd(user.id)}>{addingId === user.id ? t("adding") : t("add")}</Button></div>) : null}
        {!loading && !matches.length ? <div className="people-empty">{query ? t("noPeopleMatch") : t("everyoneAlreadyInGroup")}</div> : null}
      </div>
    </Modal>
  );
}

export default function GroupsPanel({ onOpenProfile, openGroup = null }) {
  const { t, translateError } = useI18n();
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [memberQuery, setMemberQuery] = useState("");
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [addingMemberId, setAddingMemberId] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const groupNameRef = useRef(null);
  const selectedRoleLabel = selected?.currentUserRole === "owner"
    ? t("owner")
    : selected?.currentUserRole === "member"
      ? t("member")
      : selected?.currentUserRole;

  const refresh = useCallback(async (selectId = null) => {
    try {
      const result = await api.listGroups();
      const nextGroups = result.groups || [];
      const requestedGroupExists = !openGroup || nextGroups.some((group) => group.id === openGroup.id);
      setGroups(nextGroups);
      setSelected((current) => nextGroups.find((group) => group.id === (selectId || current?.id)) || nextGroups[0] || null);
      setError(requestedGroupExists ? "" : t("groupUnavailableError"));
    } catch (requestError) {
      setError(requestError.message ? translateError(requestError.message) : t("groupsLoadError"));
    } finally {
      setLoadingGroups(false);
    }
  }, [openGroup, t, translateError]);

  useEffect(() => {
    refresh(openGroup?.id);
    api.listUsers().then((result) => setUsers(result.users || [])).catch(() => setError(t("peopleLoadError"))).finally(() => setLoadingDirectory(false));
  }, [openGroup?.id, refresh]);

  const selectedMemberIds = useMemo(() => new Set((selected?.members || []).map((member) => member.id)), [selected?.members]);

  function resetCreateDialog() {
    setCreating(false);
    setCreateError("");
    setMemberQuery("");
    setForm(EMPTY_FORM);
  }

  function addCreationMember(user) {
    setForm((current) => current.memberIds.includes(user.id) ? current : { ...current, memberIds: [...current.memberIds, user.id] });
    setMemberQuery("");
  }

  function removeCreationMember(userId) {
    setForm((current) => ({ ...current, memberIds: current.memberIds.filter((id) => id !== userId) }));
  }

  async function createGroup(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!GROUP_NAME_PATTERN.test(name)) {
      setCreateError(t("groupNameFormatError"));
      return;
    }
    setCreatingGroup(true);
    setCreateError("");
    try {
      const result = await api.createGroup({ ...form, name });
      resetCreateDialog();
      await refresh(result.group.id);
    } catch (requestError) {
      setCreateError(requestError.message ? translateError(requestError.message) : t("groupCreateError"));
    } finally {
      setCreatingGroup(false);
    }
  }

  async function mutate(action, selectId = selected?.id) {
    try {
      await action();
      setError("");
      await refresh(selectId);
    } catch (requestError) {
      setError(requestError.message ? translateError(requestError.message) : t("groupUpdateError"));
      throw requestError;
    }
  }

  async function addMember(userId) {
    if (!selected || !userId) return;
    setAddingMemberId(userId);
    try { await mutate(() => api.addGroupMember(selected.id, userId)); } finally { setAddingMemberId(""); }
  }

  function removeMember(userId) {
    if (!selected || !userId) return;
    setRemoveTarget(selected.members.find((member) => member.id === userId) || null);
  }

  async function confirmRemoveMember() {
    if (!selected || !removeTarget) return;
    const userId = removeTarget.id;
    setRemoveTarget(null);
    await mutate(() => api.removeGroupMember(selected.id, userId));
  }

  function leaveGroup() {
    if (selected) setLeaveConfirmOpen(true);
  }

  function selectGroup(group) {
    setSelected(group);
    setError("");
  }

  async function confirmLeaveGroup() {
    if (!selected) return;
    setLeaveConfirmOpen(false);
    await mutate(() => api.leaveGroup(selected.id), null);
  }

  return (
    <main className="groups-panel" data-testid="groups-panel" aria-label={t("groupsTitle")}>
      <header className="channel-header groups-panel-header">
        <div className="groups-panel-title">
          <ContactRoundIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="ch-name">{t("groupsTitle")}</span>
          <span className="groups-panel-count">{groups.length} {groups.length === 1 ? t("group") : t("groupsCount")}</span>
        </div>
        <Button variant="primary" className="groups-create-button" onClick={() => setCreating(true)}><PlusIcon size={16} aria-hidden="true" />{t("createGroup")}</Button>
      </header>
      <div className="groups-panel-body">
        {error ? <div className="error groups-panel-error" role="alert">{error}</div> : null}
        <div className="groups-panel-layout">
          <GroupDirectory groups={groups} selected={selected} query={query} loading={loadingGroups} onQueryChange={setQuery} onSelect={selectGroup} />
          <section className="groups-panel-detail" aria-live="polite">
            {!selected ? <div className="groups-detail-empty"><span className="groups-empty-state-icon"><ContactRoundIcon size={26} aria-hidden="true" /></span><strong>{t("selectGroup")}</strong><p>{t("selectGroupHint")}</p></div> : <>
              <header className="groups-detail-hero"><span className="groups-panel-detail-icon"><ContactRoundIcon size={22} aria-hidden="true" /></span><div className="groups-detail-heading"><div className="groups-detail-title-row"><h2>{selected.name}</h2><span className="groups-role-badge">{selectedRoleLabel || t("group")}</span></div><p className="groups-panel-handle">@{selected.handle}</p>{selected.description ? <p className="groups-panel-description">{selected.description}</p> : null}<div className="groups-detail-stats"><span><UsersRoundIcon size={14} aria-hidden="true" />{selected.memberCount} {selected.memberCount === 1 ? t("member") : t("groupMembers")}</span></div></div></header>
              <div className="groups-detail-grid"><GroupDetails group={selected} onOpenProfile={onOpenProfile} onLeave={leaveGroup} onAddPeople={() => setShowAddPeople(true)} onRemoveMember={removeMember} /></div>
            </>}
          </section>
        </div>
      </div>
      {removeTarget ? <ConfirmDialog title={t("removeGroupMemberQuestion").replace("{name}", removeTarget.displayName)} message={t("removeGroupMemberMessage")} confirmLabel={t("removeMember")} danger onConfirm={confirmRemoveMember} onCancel={() => setRemoveTarget(null)} /> : null}
      {leaveConfirmOpen && selected ? <ConfirmDialog title={t(selected.memberCount === 1 ? "deleteGroupQuestion" : "leaveGroupQuestion")} message={t(selected.memberCount === 1 ? "lastGroupMemberMessage" : "leaveGroupMessage")} confirmLabel={t(selected.memberCount === 1 ? "leaveAndDeleteGroup" : "leaveGroup")} danger onConfirm={confirmLeaveGroup} onCancel={() => setLeaveConfirmOpen(false)} /> : null}
      {creating ? <CreateGroupDialog form={form} users={users} memberQuery={memberQuery} error={createError} creating={creatingGroup} loadingDirectory={loadingDirectory} onFormChange={setForm} onMemberQueryChange={setMemberQuery} onAddMember={addCreationMember} onRemoveMember={removeCreationMember} onSubmit={createGroup} onClose={resetCreateDialog} groupNameRef={groupNameRef} /> : null}
      {showAddPeople && selected ? <AddPeopleDialog users={users} memberIds={selectedMemberIds} query={peopleQuery} loading={loadingDirectory} addingId={addingMemberId} onQueryChange={setPeopleQuery} onAdd={addMember} onClose={() => { setShowAddPeople(false); setPeopleQuery(""); }} /> : null}
    </main>
  );
}
