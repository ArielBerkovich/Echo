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

const EMPTY_FORM = { name: "", description: "", memberIds: [] };
const PEOPLE_RESULT_LIMIT = 50;
const GROUP_NAME_PATTERN = /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/;
const GROUP_NAME_ERROR = "Group names may contain English letters, numbers, spaces, and hyphens only.";

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
  const text = query.trim().toLowerCase();
  const visibleGroups = sortGroups(
    text
      ? groups.filter((group) => matchesQuery(`${group.name} ${group.handle} ${group.description}`, text))
      : groups
  );

  return (
    <aside className="groups-panel-list" aria-label="Group directory">
      <div className="groups-panel-list-head">
        <div className="groups-panel-search">
          <SearchIcon size={16} aria-hidden="true" />
          <input className="groups-panel-filter" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search groups" aria-label="Search groups" />
          {query ? <button type="button" aria-label="Clear group search" onClick={() => onQueryChange("")}><XIcon size={14} aria-hidden="true" /></button> : null}
        </div>
      </div>
      <div className="groups-panel-list-body">
        {loading ? <div className="groups-empty-state"><p>Loading groups…</p></div> : null}
        {!loading && visibleGroups.length ? visibleGroups.map((group) => (
          <button type="button" key={group.id} className={`groups-panel-group${selected?.id === group.id ? " active" : ""}`} aria-current={selected?.id === group.id ? "true" : undefined} onClick={() => onSelect(group)}>
            <span className="groups-panel-group-icon"><ContactRoundIcon size={18} aria-hidden="true" /></span>
            <span className="groups-panel-group-copy">
              <strong>{group.name}{group.isMember ? <span className="groups-membership-badge">Joined</span> : null}</strong>
              <small>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</small>
            </span>
            <ChevronRightIcon className="groups-panel-group-arrow" size={16} aria-hidden="true" />
          </button>
        )) : null}
        {!loading && !visibleGroups.length ? <div className="groups-empty-state"><span className="groups-empty-state-icon"><ContactRoundIcon size={24} aria-hidden="true" /></span><strong>{query ? "No matching groups" : "No groups yet"}</strong><p>{query ? `No group matches “${query.trim()}”.` : "Create a group to bring people together."}</p></div> : null}
      </div>
    </aside>
  );
}

function GroupMember({ member, removable, onOpenProfile, onRemove }) {
  return (
    <div className="groups-panel-member">
      <button type="button" className="groups-member-profile" onClick={() => onOpenProfile(member)}>
        <Avatar name={member.displayName} src={member.avatarUrl} size={36} />
        <span className="person-info"><span className="person-name">{member.displayName}{member.role === "owner" ? <span className="groups-owner-badge">Owner</span> : null}</span><span className="person-handle">@{member.username}</span></span>
      </button>
      {removable ? <button type="button" className="groups-member-remove" onClick={() => onRemove(member.id)} aria-label={`Remove ${member.displayName}`} title="Remove member"><UserMinusIcon size={15} strokeWidth={1.9} aria-hidden="true" /></button> : null}
    </div>
  );
}

function GroupDetails({ group, onOpenProfile, onLeave, onAddPeople, onRemoveMember }) {
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
    <section className="groups-detail-section" aria-label="Group members">
      <header className="groups-detail-section-head">
        <div className="groups-members-search">
          <SearchIcon size={15} aria-hidden="true" />
          <label className="sr-only" htmlFor="group-member-search">Search members</label>
          <input id="group-member-search" type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members" />
        </div>
        {group.isMember ? <div className="groups-detail-section-actions"><Button variant="subtle" onClick={onLeave}><LogOutIcon size={15} aria-hidden="true" />Leave group</Button><Button variant="subtle" onClick={onAddPeople}><UserPlusIcon size={15} aria-hidden="true" />Add people</Button></div> : null}
      </header>
      <div className="groups-detail-list">
        {visibleMembers.length ? visibleMembers.map((member) => <GroupMember key={member.id} member={member} removable={group.isMember && member.id !== group.currentUserId} onOpenProfile={onOpenProfile} onRemove={onRemoveMember} />) : <div className="groups-members-empty">No members match “{memberQuery.trim()}”.</div>}
      </div>
    </section>
  );
}

function CreateGroupDialog({ form, users, memberQuery, error, creating, loadingDirectory, onFormChange, onMemberQueryChange, onAddMember, onRemoveMember, onSubmit, onClose, groupNameRef }) {
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
    <Modal title="Create group" className="groups-create-modal" closeDisabled={creating} onClose={onClose} onOpenAutoFocus={(event) => { event.preventDefault(); groupNameRef.current?.focus(); }}>
      <form className="groups-create-form" onSubmit={onSubmit}>
        <label><span className="groups-field-label">Group name</span><input ref={groupNameRef} required maxLength={40} pattern="[A-Za-z0-9]+([ -][A-Za-z0-9]+)*" title="Use English letters, numbers, spaces, and hyphens only" placeholder="For example, Product Design" value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value.replace(/[^A-Za-z0-9 -]/g, "") })} /></label>
        <label><span className="groups-field-label">Description <em>Optional</em></span><textarea maxLength={160} placeholder="What is this group for?" value={form.description} onChange={(event) => onFormChange({ ...form, description: event.target.value })} /></label>
        <label htmlFor="create-group-member-search"><span className="groups-field-label">Add people <em>Optional</em></span></label>
        <div className="groups-member-picker">
          {selectedMembers.length ? <div className="forward-selected-chips" aria-label="Selected group members">{selectedMembers.map((user) => <span className="forward-chip" data-testid="group-creation-member" key={user.id}><span>{user.displayName}</span><button type="button" className="chip-remove" aria-label={`Remove ${user.displayName}`} onClick={() => onRemoveMember(user.id)}><XIcon size={13} aria-hidden="true" /></button></span>)}</div> : null}
          <input id="create-group-member-search" className="people-filter forward-destination-search" type="search" value={memberQuery} onChange={(event) => { onMemberQueryChange(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder={loadingDirectory ? "Loading people…" : "Search people"} disabled={loadingDirectory} role="combobox" aria-autocomplete="list" aria-controls={memberQuery.trim() ? "create-group-member-results" : undefined} aria-expanded={Boolean(memberQuery.trim())} aria-activedescendant={activeItem ? `create-group-member-${activeItem.id}` : undefined} />
          {memberQuery.trim() ? <div id="create-group-member-results" className="forward-destination-list groups-member-results" role="listbox" aria-label="People to add">{matches.length ? matches.map((user, index) => <button type="button" id={`create-group-member-${user.id}`} key={user.id} className={`forward-destination-row${activeIndex === index ? " keyboard-active" : ""}`} role="option" aria-selected="false" ref={(element) => { if (element && activeIndex === index) activeOptionRef.current = element; }} onMouseEnter={() => setActiveIndex(index)} onClick={() => onAddMember(user)}><Avatar name={user.displayName} src={user.avatarUrl} size={34} /><span className="forward-destination-copy"><strong>{user.displayName}</strong><small>@{user.username}</small></span><span className="forward-selection-indicator" aria-hidden="true"><PlusIcon size={14} /></span></button>) : <div className="people-empty" role="status">No people match “{memberQuery.trim()}”.</div>}</div> : null}
        </div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        <ModalActions><Button variant="secondary" onClick={onClose} disabled={creating}>Cancel</Button><Button variant="primary" type="submit" disabled={creating || !form.name.trim()}>{creating ? "Creating…" : "Create group"}</Button></ModalActions>
      </form>
    </Modal>
  );
}

function AddPeopleDialog({ groupName, users, memberIds, query, loading, addingId, onQueryChange, onAdd, onClose }) {
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return users.filter((user) => !memberIds.has(user.id) && (!text || matchesQuery(`${user.displayName} ${user.username}`, text))).slice(0, PEOPLE_RESULT_LIMIT);
  }, [memberIds, query, users]);

  return (
    <Modal title={`Add people to ${groupName}`} className="groups-picker-modal" onClose={onClose}>
      <p className="groups-dialog-intro">Members can mention this group and manage its membership.</p>
      <input className="people-filter" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search people" aria-label="Search people to add" autoFocus />
      <div className="people-list groups-picker-list">
        {loading ? <div className="people-empty">Loading people…</div> : null}
        {!loading && matches.length ? matches.map((user) => <div className="person-row groups-picker-row" key={user.id}><Avatar name={user.displayName} src={user.avatarUrl} size={34} /><div className="person-info"><div className="person-name">{user.displayName}</div><div className="person-handle">@{user.username}</div></div><Button variant="secondary" disabled={addingId === user.id} onClick={() => onAdd(user.id)}>{addingId === user.id ? "Adding…" : "Add"}</Button></div>) : null}
        {!loading && !matches.length ? <div className="people-empty">{query ? `No people match “${query.trim()}”.` : "Everyone in the workspace is already in this group."}</div> : null}
      </div>
    </Modal>
  );
}

export default function GroupsPanel({ onOpenProfile, openGroup = null }) {
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

  const refresh = useCallback(async (selectId = null) => {
    try {
      const result = await api.listGroups();
      const nextGroups = result.groups || [];
      setGroups(nextGroups);
      setSelected((current) => nextGroups.find((group) => group.id === (selectId || current?.id)) || nextGroups[0] || null);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not load groups.");
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    refresh(openGroup?.id);
    api.listUsers().then((result) => setUsers(result.users || [])).catch(() => setError("Could not load people.")).finally(() => setLoadingDirectory(false));
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
      setCreateError(GROUP_NAME_ERROR);
      return;
    }
    setCreatingGroup(true);
    setCreateError("");
    try {
      const result = await api.createGroup({ ...form, name });
      resetCreateDialog();
      await refresh(result.group.id);
    } catch (requestError) {
      setCreateError(requestError.message || "Could not create group.");
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
      setError(requestError.message || "Group update could not be completed.");
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

  async function confirmLeaveGroup() {
    if (!selected) return;
    setLeaveConfirmOpen(false);
    await mutate(() => api.leaveGroup(selected.id), null);
  }

  return (
    <main className="groups-panel" data-testid="groups-panel" aria-label="Groups">
      <header className="channel-header groups-panel-header">
        <div className="groups-panel-title">
          <ContactRoundIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          <span className="ch-name">Groups</span>
          <span className="groups-panel-count">{groups.length} {groups.length === 1 ? "group" : "groups"}</span>
        </div>
        <Button variant="primary" className="groups-create-button" onClick={() => setCreating(true)}><PlusIcon size={16} aria-hidden="true" />Create group</Button>
      </header>
      <div className="groups-panel-body">
        {error ? <div className="error groups-panel-error" role="alert">{error}</div> : null}
        <div className="groups-panel-layout">
          <GroupDirectory groups={groups} selected={selected} query={query} loading={loadingGroups} onQueryChange={setQuery} onSelect={setSelected} />
          <section className="groups-panel-detail" aria-live="polite">
            {!selected ? <div className="groups-detail-empty"><span className="groups-empty-state-icon"><ContactRoundIcon size={26} aria-hidden="true" /></span><strong>Select a group</strong><p>Choose a group to view its members.</p></div> : <>
              <header className="groups-detail-hero"><span className="groups-panel-detail-icon"><ContactRoundIcon size={22} aria-hidden="true" /></span><div className="groups-detail-heading"><div className="groups-detail-title-row"><h2>{selected.name}</h2><span className="groups-role-badge">{selected.currentUserRole || "Workspace group"}</span></div><p className="groups-panel-handle">@{selected.handle}</p>{selected.description ? <p className="groups-panel-description">{selected.description}</p> : null}<div className="groups-detail-stats"><span><UsersRoundIcon size={14} aria-hidden="true" />{selected.memberCount} {selected.memberCount === 1 ? "member" : "members"}</span></div></div></header>
              <div className="groups-detail-grid"><GroupDetails group={selected} onOpenProfile={onOpenProfile} onLeave={leaveGroup} onAddPeople={() => setShowAddPeople(true)} onRemoveMember={removeMember} /></div>
            </>}
          </section>
        </div>
      </div>
      {removeTarget ? <ConfirmDialog title={`Remove ${removeTarget.displayName}?`} message="They will no longer be able to mention or manage this group. You can add them again later." confirmLabel="Remove member" danger onConfirm={confirmRemoveMember} onCancel={() => setRemoveTarget(null)} /> : null}
      {leaveConfirmOpen && selected ? <ConfirmDialog title={selected.memberCount === 1 ? "Delete this group?" : "Leave this group?"} message={selected.memberCount === 1 ? "You are the last member. Leaving will permanently delete this group." : "You will no longer receive group mentions. Another member will own the group."} confirmLabel={selected.memberCount === 1 ? "Leave and delete group" : "Leave group"} danger onConfirm={confirmLeaveGroup} onCancel={() => setLeaveConfirmOpen(false)} /> : null}
      {creating ? <CreateGroupDialog form={form} users={users} memberQuery={memberQuery} error={createError} creating={creatingGroup} loadingDirectory={loadingDirectory} onFormChange={setForm} onMemberQueryChange={setMemberQuery} onAddMember={addCreationMember} onRemoveMember={removeCreationMember} onSubmit={createGroup} onClose={resetCreateDialog} groupNameRef={groupNameRef} /> : null}
      {showAddPeople && selected ? <AddPeopleDialog groupName={selected.name} users={users} memberIds={selectedMemberIds} query={peopleQuery} loading={loadingDirectory} addingId={addingMemberId} onQueryChange={setPeopleQuery} onAdd={addMember} onClose={() => { setShowAddPeople(false); setPeopleQuery(""); }} /> : null}
    </main>
  );
}
