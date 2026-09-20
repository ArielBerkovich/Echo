import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon, ContactRoundIcon, HashIcon, PlusIcon, SearchIcon, Settings2Icon, UserPlusIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { Button } from "./Button.js";
import Modal, { ModalActions } from "./Modal.js";
import useRecipientPickerKeyboard from "./useRecipientPickerKeyboard.js";

const EMPTY_FORM = { name: "", description: "", memberIds: [] };

export default function GroupsPanel({ onOpenProfile, openGroup = null }) {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [users, setUsers] = useState([]);
  const [channels, setChannels] = useState([]);
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
  const [showAssignChannels, setShowAssignChannels] = useState(false);
  const [showManageGroup, setShowManageGroup] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [addingMemberId, setAddingMemberId] = useState("");
  const [assigningChannelId, setAssigningChannelId] = useState("");
  const [transferOwnerId, setTransferOwnerId] = useState("");
  const [leaveOwnerId, setLeaveOwnerId] = useState("");
  const groupNameRef = useRef(null);
  const memberSearchRef = useRef(null);

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
    Promise.all([api.listUsers(), api.listAllChannels()]).then(([userResult, channelResult]) => {
      setUsers(userResult.users || []);
      setChannels((channelResult.channels || []).filter((channel) => channel.type !== "dm"));
    }).catch(() => setError("Could not load people and channels.")).finally(() => setLoadingDirectory(false));
  }, [openGroup?.id, refresh]);

  const filteredGroups = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? groups.filter((group) => `${group.name} ${group.handle} ${group.description}`.toLowerCase().includes(text)) : groups;
  }, [groups, query]);
  const selectedMemberIds = useMemo(() => new Set((selected?.members || []).map((member) => member.id)), [selected?.members]);
  const selectedChannelIds = useMemo(() => new Set((selected?.channels || []).map((channel) => channel.id)), [selected?.channels]);
  const availableUsers = useMemo(() => users.filter((user) => !selectedMemberIds.has(user.id)), [selectedMemberIds, users]);
  const availableChannels = useMemo(() => channels.filter((channel) => !selectedChannelIds.has(channel.id) && (channel.type === "public" || channel.joined !== false)), [channels, selectedChannelIds]);
  const selectedCreationMembers = useMemo(() => {
    const usersById = new Map(users.map((user) => [user.id, user]));
    return form.memberIds.map((id) => usersById.get(id)).filter(Boolean);
  }, [form.memberIds, users]);
  const creationMemberMatches = useMemo(() => {
    const text = memberQuery.trim().toLowerCase();
    return users.filter((user) => !form.memberIds.includes(user.id) && (!text || `${user.displayName} ${user.username}`.toLowerCase().includes(text))).slice(0, 20);
  }, [form.memberIds, memberQuery, users]);
  const peopleMatches = useMemo(() => {
    const text = peopleQuery.trim().toLowerCase();
    return availableUsers.filter((user) => !text || `${user.displayName} ${user.username}`.toLowerCase().includes(text));
  }, [availableUsers, peopleQuery]);
  const channelMatches = useMemo(() => {
    const text = channelQuery.trim().toLowerCase();
    return availableChannels.filter((channel) => !text || channel.name.toLowerCase().includes(text));
  }, [availableChannels, channelQuery]);

  const { activeIndex, activeItem, activeOptionRef, handleKeyDown, setActiveIndex } = useRecipientPickerKeyboard({
    items: creationMemberMatches,
    hasQuery: Boolean(memberQuery.trim()),
    onSelect: addCreationMember,
  });

  function addCreationMember(user) {
    setForm((current) => current.memberIds.includes(user.id) ? current : { ...current, memberIds: [...current.memberIds, user.id] });
    setMemberQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => memberSearchRef.current?.focus());
  }

  function removeCreationMember(userId) {
    setForm((current) => ({ ...current, memberIds: current.memberIds.filter((id) => id !== userId) }));
    requestAnimationFrame(() => memberSearchRef.current?.focus());
  }

  function closeCreateDialog() {
    if (creatingGroup) return;
    setCreating(false);
    setCreateError("");
    setMemberQuery("");
    setForm(EMPTY_FORM);
  }

  async function createGroup(event) {
    event.preventDefault();
    setCreatingGroup(true);
    setCreateError("");
    try {
      const result = await api.createGroup(form);
      setForm(EMPTY_FORM);
      setMemberQuery("");
      setCreating(false);
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
    try { await mutate(() => api.addGroupMember(selected.id, userId)); }
    finally { setAddingMemberId(""); }
  }

  async function assignChannel(channelId) {
    if (!selected || !channelId) return;
    setAssigningChannelId(channelId);
    try { await mutate(() => api.addGroupChannel(selected.id, channelId)); }
    finally { setAssigningChannelId(""); }
  }

  async function removeMember(userId) {
    if (!selected || !window.confirm("Remove this member from the group?")) return;
    await mutate(() => api.removeGroupMember(selected.id, userId));
  }

  async function transferOwner(event) {
    event.preventDefault();
    if (!selected || !transferOwnerId) return;
    await mutate(() => api.transferGroup(selected.id, transferOwnerId));
    setTransferOwnerId("");
  }

  async function leaveGroup() {
    if (!selected || !window.confirm("Leave this group? If you are the last member, it will be archived.")) return;
    await mutate(() => api.leaveGroup(selected.id, selected.currentUserRole === "owner" ? leaveOwnerId : ""), null);
    setLeaveOwnerId("");
    setShowManageGroup(false);
  }

  async function deleteGroup() {
    if (!selected || !window.confirm("Delete this group? Historical mentions will remain readable.")) return;
    await mutate(() => api.deleteGroup(selected.id), null);
    setShowManageGroup(false);
  }

  return <main className="groups-panel" data-testid="groups-panel" aria-label="Groups">
    <header className="channel-header groups-panel-header">
      <span className="groups-panel-title"><ContactRoundIcon size={20} strokeWidth={1.8} aria-hidden="true" /><span className="ch-name">Groups</span></span>
      <div className="groups-panel-header-actions"><span className="groups-panel-count">{groups.length} {groups.length === 1 ? "group" : "groups"}</span><Button variant="primary" className="groups-create-button" onClick={() => setCreating(true)}><PlusIcon size={16} aria-hidden="true" />Create group</Button></div>
    </header>

    <div className="groups-panel-body">
      {error ? <div className="error groups-panel-error" role="alert">{error}</div> : null}
      <div className="groups-panel-layout">
        <aside className="groups-panel-list" aria-label="Group directory">
          <div className="groups-panel-list-head"><div className="groups-panel-search"><SearchIcon size={16} aria-hidden="true" /><input className="groups-panel-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search groups" aria-label="Search groups" />{query ? <button type="button" aria-label="Clear group search" onClick={() => setQuery("")}><XIcon size={14} aria-hidden="true" /></button> : null}</div></div>
          <div className="groups-panel-list-body">
            {loadingGroups ? <div className="groups-empty-state"><p>Loading groups…</p></div> : filteredGroups.length ? filteredGroups.map((group) => <button type="button" key={group.id} className={`groups-panel-group${selected?.id === group.id ? " active" : ""}`} aria-current={selected?.id === group.id ? "true" : undefined} onClick={() => setSelected(group)}><span className="groups-panel-group-icon"><ContactRoundIcon size={18} aria-hidden="true" /></span><span className="groups-panel-group-copy"><strong>{group.name}</strong><small>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {group.channelCount} {group.channelCount === 1 ? "channel" : "channels"}</small></span><ChevronRightIcon className="groups-panel-group-arrow" size={16} aria-hidden="true" /></button>) : <div className="groups-empty-state"><span className="groups-empty-state-icon"><ContactRoundIcon size={24} aria-hidden="true" /></span><strong>{query ? "No matching groups" : "No groups yet"}</strong><p>{query ? `No group matches “${query.trim()}”.` : "Create a group to organize people and channels."}</p></div>}
          </div>
        </aside>

        <section className="groups-panel-detail" aria-live="polite">
          {!selected ? <div className="groups-detail-empty"><span className="groups-empty-state-icon"><ContactRoundIcon size={26} aria-hidden="true" /></span><strong>Select a group</strong><p>Choose a group to view its people and channels.</p></div> : <>
            <header className="groups-detail-hero"><span className="groups-panel-detail-icon"><ContactRoundIcon size={22} aria-hidden="true" /></span><div className="groups-detail-heading"><div className="groups-detail-title-row"><h2>{selected.name}</h2><span className="groups-role-badge">{selected.currentUserRole || "Workspace group"}</span></div><p className="groups-panel-handle">@{selected.handle}</p>{selected.description ? <p className="groups-panel-description">{selected.description}</p> : null}<div className="groups-detail-stats"><span><UsersRoundIcon size={14} aria-hidden="true" />{selected.memberCount} {selected.memberCount === 1 ? "member" : "members"}</span><span><HashIcon size={14} aria-hidden="true" />{selected.channelCount} {selected.channelCount === 1 ? "channel" : "channels"}</span></div></div>{(selected.isMember || selected.canDelete) ? <Button variant="subtle" className="groups-manage-button" onClick={() => setShowManageGroup(true)}><Settings2Icon size={15} aria-hidden="true" />Manage</Button> : null}</header>

            <div className="groups-detail-grid">
              <section className="groups-detail-section" aria-labelledby="groups-members-heading"><header className="groups-detail-section-head"><div><h3 id="groups-members-heading">Members</h3><p>People notified when this group is mentioned.</p></div>{selected.isMember ? <Button variant="subtle" onClick={() => setShowAddPeople(true)}><UserPlusIcon size={15} aria-hidden="true" />Add people</Button> : null}</header><div className="groups-detail-list">{selected.members.map((member) => <div className="groups-panel-member" key={member.id}><button type="button" className="groups-member-profile" onClick={() => onOpenProfile(member)}><Avatar name={member.displayName} src={member.avatarUrl} size={36} /><span className="person-info"><span className="person-name">{member.displayName}{member.role === "owner" ? <span className="groups-owner-badge">Owner</span> : null}</span><span className="person-handle">@{member.username}</span></span></button>{selected.isMember && (selected.currentUserRole !== "owner" || member.role !== "owner") ? <button type="button" className="icon-button" onClick={() => removeMember(member.id)} aria-label={`Remove ${member.displayName}`}><XIcon size={15} aria-hidden="true" /></button> : null}</div>)}</div></section>

              <section className="groups-detail-section" aria-labelledby="groups-channels-heading"><header className="groups-detail-section-head"><div><h3 id="groups-channels-heading">Channels</h3><p>Channels associated with this group.</p></div>{selected.currentUserRole === "owner" ? <Button variant="subtle" onClick={() => setShowAssignChannels(true)}><PlusIcon size={15} aria-hidden="true" />Assign</Button> : null}</header><div className="groups-channel-list">{selected.channels.length ? selected.channels.map((channel) => <div className="groups-channel-row" key={channel.id}><span className="groups-channel-icon"><HashIcon size={16} aria-hidden="true" /></span><span className="groups-channel-copy"><strong>{channel.name}</strong><small>{channel.type === "private" ? "Private channel" : "Public channel"}</small></span>{selected.currentUserRole === "owner" ? <button type="button" className="icon-button" onClick={() => mutate(() => api.removeGroupChannel(selected.id, channel.id))} aria-label={`Remove #${channel.name} from group`}><XIcon size={15} aria-hidden="true" /></button> : null}</div>) : <div className="groups-section-empty">No channels assigned.</div>}</div></section>
            </div>

          </>}
        </section>
      </div>
    </div>

    {creating ? <Modal title="Create group" className="groups-create-modal" closeDisabled={creatingGroup} onClose={closeCreateDialog} onOpenAutoFocus={(event) => { event.preventDefault(); groupNameRef.current?.focus(); }}><form className="groups-create-form" onSubmit={createGroup}><label><span className="groups-field-label">Group name</span><input ref={groupNameRef} required maxLength={80} placeholder="For example, Product Design" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label><span className="groups-field-label">Description <em>Optional</em></span><textarea maxLength={160} placeholder="What is this group for?" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label htmlFor="create-group-member-search"><span className="groups-field-label">Add people <em>Optional</em></span></label><div className="groups-member-picker">{selectedCreationMembers.length ? <div className="forward-selected-chips" aria-label="Selected group members">{selectedCreationMembers.map((user) => <span className="forward-chip" data-testid="group-creation-member" key={user.id}><span>{user.displayName}</span><button type="button" className="chip-remove" aria-label={`Remove ${user.displayName}`} onClick={() => removeCreationMember(user.id)}><XIcon size={13} aria-hidden="true" /></button></span>)}</div> : null}<input id="create-group-member-search" ref={memberSearchRef} className="people-filter forward-destination-search" type="search" value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder={loadingDirectory ? "Loading people…" : "Search people"} disabled={loadingDirectory} role="combobox" aria-autocomplete="list" aria-controls={memberQuery.trim() ? "create-group-member-results" : undefined} aria-expanded={Boolean(memberQuery.trim())} aria-activedescendant={activeItem ? `create-group-member-${activeItem.id}` : undefined} />{memberQuery.trim() ? <div id="create-group-member-results" className="forward-destination-list groups-member-results" role="listbox" aria-label="People to add">{creationMemberMatches.length ? creationMemberMatches.map((user, index) => <button type="button" id={`create-group-member-${user.id}`} key={user.id} className={`forward-destination-row${activeIndex === index ? " keyboard-active" : ""}`} role="option" aria-selected="false" ref={(element) => { if (element && activeIndex === index) activeOptionRef.current = element; }} onMouseEnter={() => setActiveIndex(index)} onClick={() => addCreationMember(user)}><Avatar name={user.displayName} src={user.avatarUrl} size={34} /><span className="forward-destination-copy"><strong>{user.displayName}</strong><small>@{user.username}</small></span><span className="forward-selection-indicator" aria-hidden="true"><PlusIcon size={14} /></span></button>) : <div className="people-empty" role="status">No people match “{memberQuery.trim()}”.</div>}</div> : null}</div>{createError ? <div className="error" role="alert">{createError}</div> : null}<ModalActions><Button variant="secondary" onClick={closeCreateDialog} disabled={creatingGroup}>Cancel</Button><Button variant="primary" type="submit" disabled={creatingGroup || !form.name.trim()}>{creatingGroup ? "Creating…" : "Create group"}</Button></ModalActions></form></Modal> : null}

    {showManageGroup && selected ? <Modal title={`Manage ${selected.name}`} className="groups-manage-modal" onClose={() => { setShowManageGroup(false); setTransferOwnerId(""); setLeaveOwnerId(""); }}><p className="groups-dialog-intro">Manage ownership and your membership. Changes apply immediately.</p>{selected.currentUserRole === "owner" && selected.memberCount > 1 ? <div className="groups-manage-block"><form className="groups-action-form" onSubmit={transferOwner}><label htmlFor="group-owner-select">Transfer ownership</label><p>Make another member the group owner.</p><div><select id="group-owner-select" aria-label="Transfer group ownership" value={transferOwnerId} onChange={(event) => setTransferOwnerId(event.target.value)}><option value="">Choose a member</option>{selected.members.filter((member) => member.role !== "owner").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select><Button type="submit" disabled={!transferOwnerId}>Transfer</Button></div></form></div> : null}<div className="groups-manage-danger"><div><strong>Leave group</strong><p>{selected.currentUserRole === "owner" && selected.memberCount > 1 ? "Choose a replacement owner before leaving." : "You can be added again by any member."}</p></div>{selected.currentUserRole === "owner" && selected.memberCount > 1 ? <select aria-label="Replacement owner before leaving group" value={leaveOwnerId} onChange={(event) => setLeaveOwnerId(event.target.value)}><option value="">Choose a replacement owner</option>{selected.members.filter((member) => member.role !== "owner").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select> : null}{selected.isMember ? <Button variant="secondary" onClick={leaveGroup} disabled={selected.currentUserRole === "owner" && selected.memberCount > 1 && !leaveOwnerId}>Leave group</Button> : null}{selected.canDelete ? <><div className="groups-manage-divider" /><div><strong>Delete group</strong><p>Permanently removes the group. Historical mentions remain readable.</p></div><Button variant="danger-outline" onClick={deleteGroup}>Delete group</Button></> : null}</div></Modal> : null}

    {showAddPeople && selected ? <Modal title={`Add people to ${selected.name}`} className="groups-picker-modal" onClose={() => { setShowAddPeople(false); setPeopleQuery(""); }}><p className="groups-dialog-intro">Members can mention this group and manage its membership.</p><input className="people-filter" type="search" value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Search people" aria-label="Search people to add" autoFocus /><div className="people-list groups-picker-list">{loadingDirectory ? <div className="people-empty">Loading people…</div> : peopleMatches.length ? peopleMatches.map((user) => <div className="person-row groups-picker-row" key={user.id}><Avatar name={user.displayName} src={user.avatarUrl} size={34} /><div className="person-info"><div className="person-name">{user.displayName}</div><div className="person-handle">@{user.username}</div></div><Button variant="secondary" disabled={addingMemberId === user.id} onClick={() => addMember(user.id)}>{addingMemberId === user.id ? "Adding…" : "Add"}</Button></div>) : <div className="people-empty">{peopleQuery ? `No people match “${peopleQuery.trim()}”.` : "Everyone in the workspace is already in this group."}</div>}</div><ModalActions><Button variant="primary" onClick={() => { setShowAddPeople(false); setPeopleQuery(""); }}>Done</Button></ModalActions></Modal> : null}

    {showAssignChannels && selected ? <Modal title={`Assign channels to ${selected.name}`} className="groups-picker-modal" onClose={() => { setShowAssignChannels(false); setChannelQuery(""); }}><p className="groups-dialog-intro">Associating a channel helps organize the group. It does not grant channel access.</p><input className="people-filter" type="search" value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="Search channels" aria-label="Search channels to assign" autoFocus /><div className="groups-channel-picker-list">{loadingDirectory ? <div className="people-empty">Loading channels…</div> : channelMatches.length ? channelMatches.map((channel) => <div className="groups-channel-picker-row" key={channel.id}><span className="groups-channel-icon"><HashIcon size={17} aria-hidden="true" /></span><span className="groups-channel-copy"><strong>{channel.name}</strong><small>{channel.type === "private" ? "Private channel" : "Public channel"}</small></span><Button variant="secondary" disabled={assigningChannelId === channel.id} onClick={() => assignChannel(channel.id)}>{assigningChannelId === channel.id ? "Assigning…" : "Assign"}</Button></div>) : <div className="people-empty">{channelQuery ? `No channels match “${channelQuery.trim()}”.` : "Every available channel is already assigned."}</div>}</div><ModalActions><Button variant="primary" onClick={() => { setShowAssignChannels(false); setChannelQuery(""); }}>Done</Button></ModalActions></Modal> : null}
  </main>;
}
