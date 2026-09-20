import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon, ContactRoundIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import Modal from "./Modal.js";
import useRecipientPickerKeyboard from "./useRecipientPickerKeyboard.js";

export default function GroupsPanel({ onOpenProfile, openGroup = null }) {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [users, setUsers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", memberIds: [] });
  const [memberQuery, setMemberQuery] = useState("");
  const groupNameRef = useRef(null);
  const memberSearchRef = useRef(null);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [channelToAdd, setChannelToAdd] = useState("");
  const [replacementOwner, setReplacementOwner] = useState("");

  const refresh = useCallback(async (selectId = null) => {
    try {
      const result = await api.listGroups();
      setGroups(result.groups || []);
      setSelected((result.groups || []).find((group) => group.id === (selectId || selected?.id)) || (result.groups || [])[0] || null);
    } catch (requestError) { setError(requestError.message || "Could not load groups."); }
  }, [selected?.id]);

  useEffect(() => {
    refresh(openGroup?.id);
    Promise.all([api.listUsers(), api.listAllChannels()]).then(([userResult, channelResult]) => {
      setUsers(userResult.users || []); setChannels((channelResult.channels || []).filter((channel) => channel.type !== "dm"));
    }).catch(() => setError("Could not load people and channels."));
  }, [openGroup?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? groups.filter((group) => `${group.name} ${group.handle} ${group.description}`.toLowerCase().includes(text)) : groups;
  }, [groups, query]);
  const memberIds = new Set((selected?.members || []).map((member) => member.id));
  const channelIds = new Set((selected?.channels || []).map((channel) => channel.id));
  const availableUsers = users.filter((user) => !memberIds.has(user.id));
  const availableChannels = channels.filter((channel) => !channelIds.has(channel.id) && (channel.type === "public" || channel.joined !== false));
  const selectedMembers = useMemo(() => users.filter((user) => form.memberIds.includes(user.id)), [form.memberIds, users]);
  const memberMatches = useMemo(() => {
    const queryText = memberQuery.trim().toLowerCase();
    return users.filter((user) => !form.memberIds.includes(user.id) && (!queryText || `${user.displayName} ${user.username}`.toLowerCase().includes(queryText))).slice(0, 20);
  }, [form.memberIds, memberQuery, users]);
  const { activeIndex, activeItem, activeOptionRef, handleKeyDown, setActiveIndex } = useRecipientPickerKeyboard({
    items: memberMatches,
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

  async function createGroup(event) {
    event.preventDefault();
    try { const result = await api.createGroup(form); setForm({ name: "", description: "", memberIds: [] }); setCreating(false); setError(""); await refresh(result.group.id); }
    catch (requestError) { setError(requestError.message || "Could not create group."); }
  }
  async function mutate(action, success = "") {
    try { await action(); setError(success); await refresh(selected?.id); }
    catch (requestError) { setError(requestError.message || "Group update could not be completed."); }
  }
  async function addMember(event) { event.preventDefault(); if (!selected || !memberToAdd) return; await mutate(() => api.addGroupMember(selected.id, memberToAdd)); setMemberToAdd(""); }
  async function removeMember(userId) { if (!selected || !window.confirm("Remove this member from the group?")) return; await mutate(() => api.removeGroupMember(selected.id, userId)); }
  async function transferOwner(event) { event.preventDefault(); if (!selected || !replacementOwner) return; await mutate(() => api.transferGroup(selected.id, replacementOwner)); setReplacementOwner(""); }
  async function leaveGroup(event) { event.preventDefault(); if (!selected || !window.confirm("Leave this group? If you are the last member, it will be archived.")) return; await mutate(() => api.leaveGroup(selected.id, selected.currentUserRole === "owner" ? replacementOwner : "")); setReplacementOwner(""); }
  async function addChannel(event) { event.preventDefault(); if (!selected || !channelToAdd) return; await mutate(() => api.addGroupChannel(selected.id, channelToAdd)); setChannelToAdd(""); }
  async function deleteGroup() { if (!selected || !window.confirm("Delete this group? Historical mentions will remain readable.")) return; await mutate(() => api.deleteGroup(selected.id)); }

  return <main className="groups-panel" data-testid="groups-panel" aria-label="Groups">
    <header className="channel-header groups-panel-header"><span className="groups-panel-title"><ContactRoundIcon size={20} strokeWidth={1.8} aria-hidden="true" /><span className="ch-name">Groups</span></span><div className="groups-panel-header-actions"><span className="groups-panel-count">{groups.length} {groups.length === 1 ? "group" : "groups"}</span><button type="button" className="header-action" onClick={() => setCreating(true)} aria-label="Create group"><PlusIcon size={17} aria-hidden="true" /></button></div></header>
    <div className="messages groups-panel-body">{error ? <div className="error" role="alert">{error}</div> : null}
      {creating ? <Modal title="Create group" className="groups-create-modal" onClose={() => setCreating(false)} onOpenAutoFocus={(event) => { event.preventDefault(); groupNameRef.current?.focus(); }}><form className="groups-create-form" onSubmit={createGroup}><input ref={groupNameRef} required maxLength={80} aria-label="Group name" placeholder="Group name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><textarea maxLength={160} aria-label="Group description" placeholder="Description (optional)" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><label htmlFor="create-group-member-search">Add members</label><div className={`groups-member-picker${selectedMembers.length ? " has-members" : ""}`}><div className="groups-member-chips" aria-label="Selected group members">{selectedMembers.map((user) => <span className="forward-chip" data-testid="group-creation-member" key={user.id}><span>{user.displayName}</span><button type="button" className="chip-remove" aria-label={`Remove ${user.displayName}`} onMouseDown={(event) => event.stopPropagation()} onClick={() => removeCreationMember(user.id)}><XIcon size={13} aria-hidden="true" /></button></span>)}<input id="create-group-member-search" ref={memberSearchRef} className="groups-member-search-input" type="search" value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeyDown} placeholder={selectedMembers.length ? "Add another person" : "Search people"} role="combobox" aria-autocomplete="list" aria-controls="create-group-member-results" aria-expanded={Boolean(memberQuery.trim() && memberMatches.length)} aria-activedescendant={activeItem ? `create-group-member-${activeItem.id}` : undefined} /></div>{memberQuery.trim() ? <div id="create-group-member-results" className="groups-member-results" role="listbox" aria-label="People to add">{memberMatches.length ? memberMatches.map((user, index) => <button type="button" id={`create-group-member-${user.id}`} key={user.id} className={`new-message-person${activeIndex === index ? " keyboard-active" : ""}`} role="option" aria-selected="false" ref={(element) => { if (element && activeIndex === index) activeOptionRef.current = element; }} onMouseEnter={() => setActiveIndex(index)} onClick={() => addCreationMember(user)}><Avatar name={user.displayName} src={user.avatarUrl} size={30} /><span className="person-info"><span className="person-name">{user.displayName}</span><span className="person-handle">@{user.username}</span></span></button>) : <div className="people-empty">No people found.</div>}</div> : null}</div><small className="groups-form-hint">Optional. Search for people by name or username.</small><div className="modal-actions"><button type="submit" className="btn-primary">Create</button><button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button></div></form></Modal> : null}
      <div className="groups-panel-layout"><div className="groups-panel-list" aria-label="Available groups"><div className="groups-panel-list-head"><label className="sr-only" htmlFor="group-search">Search groups</label><div className="groups-panel-search"><SearchIcon size={15} aria-hidden="true" /><input id="group-search" className="groups-panel-filter" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search groups" /></div></div>{filtered.length ? filtered.map((group) => <button type="button" key={group.id} className={`groups-panel-group${selected?.id === group.id ? " active" : ""}`} onClick={() => setSelected(group)}><span className="groups-panel-group-icon"><ContactRoundIcon size={17} aria-hidden="true" /></span><span className="groups-panel-group-copy"><strong>{group.name}</strong><small>@{group.handle} · {group.memberCount} members · {group.channelCount} channels</small></span><ChevronRightIcon className="groups-panel-group-arrow" size={15} aria-hidden="true" /></button>) : <div className="groups-empty-state"><strong>No groups yet</strong><p>Create a Group to organize people and channels.</p></div>}</div>
        <div className="groups-panel-members" aria-live="polite">{!selected ? <div className="people-empty">Choose a group to view its members and channels.</div> : <>
          <div className="groups-panel-members-head"><div className="groups-panel-detail-title"><span className="groups-panel-detail-icon"><ContactRoundIcon size={20} aria-hidden="true" /></span><div><h3>{selected.name}</h3><p className="groups-panel-handle">@{selected.handle}</p></div></div><span className="groups-panel-provider">{selected.currentUserRole || "discoverable"}</span></div>
          {selected.description ? <p className="groups-panel-description">{selected.description}</p> : null}<p className="groups-panel-detail-meta">{selected.memberCount} {selected.memberCount === 1 ? "member" : "members"} · {selected.channelCount} {selected.channelCount === 1 ? "channel" : "channels"}</p>
          <h4 className="groups-section-title">Members</h4>
          {selected.isMember ? <form className="groups-inline-form" onSubmit={addMember}><label htmlFor="group-member-select">Add member</label><select id="group-member-select" aria-label="Add member to group" value={memberToAdd} onChange={(event) => setMemberToAdd(event.target.value)}><option value="">Choose a person</option>{availableUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} (@{user.username})</option>)}</select><button type="submit" className="btn-secondary" disabled={!memberToAdd}>Add member</button></form> : null}
          <div className="groups-detail-list">{selected.members.map((member) => <div className="person-row groups-panel-member" key={member.id}><button type="button" className="groups-member-profile" onClick={() => onOpenProfile(member)}><Avatar name={member.displayName} src={member.avatarUrl} size={30} /><div className="person-info"><div className="person-name">{member.displayName}{member.role === "owner" ? " · owner" : ""}</div><div className="person-handle">@{member.username}</div></div></button>{selected.isMember && (selected.currentUserRole !== "owner" || member.role !== "owner") ? <button type="button" className="icon-button" onClick={() => removeMember(member.id)} aria-label={`Remove ${member.displayName}`}><XIcon size={15} aria-hidden="true" /></button> : null}</div>)}</div>
          <h4 className="groups-section-title">Assigned channels</h4>
          {selected.currentUserRole === "owner" ? <form className="groups-inline-form" onSubmit={addChannel}><label htmlFor="group-channel-select">Assign channel</label><select id="group-channel-select" aria-label="Assign channel to group" value={channelToAdd} onChange={(event) => setChannelToAdd(event.target.value)}><option value="">Choose a channel</option>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}{channel.type === "private" ? " (private)" : ""}</option>)}</select><button type="submit" className="btn-secondary" disabled={!channelToAdd}>Assign channel</button></form> : null}
          <div className="groups-channel-list">{selected.channels.length ? selected.channels.map((channel) => <span className="groups-channel-pill" key={channel.id}>#{channel.name}{channel.type === "private" ? " · private" : ""}{selected.currentUserRole === "owner" ? <button type="button" className="groups-channel-remove" onClick={() => mutate(() => api.removeGroupChannel(selected.id, channel.id))} aria-label={`Remove #${channel.name} from group`}><XIcon size={12} aria-hidden="true" /></button> : null}</span>) : <span className="people-empty">No channels assigned.</span>}</div>
          <div className="groups-detail-actions">{selected.currentUserRole === "owner" && selected.memberCount > 1 ? <form className="groups-inline-form groups-owner-form" onSubmit={transferOwner}><label htmlFor="group-owner-select">Transfer ownership</label><select id="group-owner-select" aria-label="Transfer group ownership" value={replacementOwner} onChange={(event) => setReplacementOwner(event.target.value)}><option value="">Choose a member</option>{selected.members.filter((member) => member.role !== "owner").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select><button type="submit" className="btn-secondary" disabled={!replacementOwner}>Transfer</button></form> : null}{selected.isMember ? <form className="groups-inline-form" onSubmit={leaveGroup}>{selected.currentUserRole === "owner" && selected.memberCount > 1 ? <><label htmlFor="group-leave-owner-select">Replacement owner before leaving</label><select id="group-leave-owner-select" aria-label="Replacement owner before leaving group" value={replacementOwner} onChange={(event) => setReplacementOwner(event.target.value)}><option value="">Choose a member</option>{selected.members.filter((member) => member.role !== "owner").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></> : null}<button type="submit" className="btn-secondary" disabled={selected.currentUserRole === "owner" && selected.memberCount > 1 && !replacementOwner}>Leave group</button></form> : null}{selected.canDelete ? <button type="button" className="btn-danger" onClick={deleteGroup}>Delete group</button> : null}</div>
        </>}</div>
      </div>
    </div>
  </main>;
}
