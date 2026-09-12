import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon, UsersRoundIcon } from "lucide-react";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { CloseButton } from "./Button.js";

// Directory groups are read-only in Echo. Only identities that have joined
// Echo are surfaced as members or recipients.
export default function GroupsPanel({ onClose, onOpenProfile, openGroup = null }) {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [error, setError] = useState("");
  const memberRequest = useRef(0);

  const filteredGroups = useMemo(() => {
    const query = groupQuery.trim().toLocaleLowerCase();
    return query ? groups.filter((group) => `${group.name} ${group.path}`.toLocaleLowerCase().includes(query)) : groups;
  }, [groupQuery, groups]);
  const echoMembers = useMemo(() => members.filter((member) => member.echoUser), [members]);
  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase();
    return query ? echoMembers.filter((member) => `${member.displayName} ${member.username}`.toLocaleLowerCase().includes(query)) : echoMembers;
  }, [echoMembers, memberQuery]);

  useEffect(() => {
    let cancelled = false;
    api.listGroups().then(({ groups: result }) => {
      if (!cancelled) setGroups(result || []);
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message || "Could not load groups.");
    }).finally(() => { if (!cancelled) setGroupsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { memberRequest.current += 1; }, []);

  const selectGroup = useCallback(async (group) => {
    setSelected(group);
    setMembers([]);
    setMemberQuery("");
    setError("");
    setMembersLoading(true);
    const requestId = memberRequest.current + 1;
    memberRequest.current = requestId;
    try {
      const result = await api.getGroup(group.provider, group.id);
      if (requestId !== memberRequest.current) return;
      setSelected(result.group);
      setMembers(result.members || []);
    } catch (requestError) {
      if (requestId === memberRequest.current) setError(requestError.message || "Could not load group members.");
    } finally { if (requestId === memberRequest.current) setMembersLoading(false); }
  }, []);

  useEffect(() => {
    if (!openGroup || groupsLoading) return;
    const group = groups.find((item) => item.provider === openGroup.provider && item.id === openGroup.id);
    if (group && (selected?.provider !== group.provider || selected?.id !== group.id)) selectGroup(group);
  }, [groups, groupsLoading, openGroup, selected?.id, selected?.provider, selectGroup]);

  return (
    <aside className="groups-panel" data-testid="groups-panel" aria-label="User groups">
      <header className="groups-panel-header">
        <div>
          <h2>Groups</h2>
          <p>Directory-managed groups and members</p>
        </div>
        <CloseButton size="sm" onClick={onClose} label="Close groups" />
      </header>
      <div className="groups-panel-body">
        <div className="groups-panel-summary"><strong>{groups.length} group{groups.length === 1 ? "" : "s"}</strong><span>Echo members only · managed in RHSSO</span></div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        <div className="groups-panel-layout">
          <div className="groups-panel-list" aria-label="Available groups">
            <div className="groups-panel-list-head"><label className="sr-only" htmlFor="group-search">Search groups</label><input id="group-search" className="groups-panel-filter" value={groupQuery} onChange={(event) => setGroupQuery(event.target.value)} placeholder="Search groups" /></div>
            {groupsLoading ? <div className="people-empty">Loading groups…</div> : null}
            {!groupsLoading && groups.length === 0 ? <div className="people-empty">No groups are available.</div> : null}
            {!groupsLoading && groups.length > 0 && filteredGroups.length === 0 ? <div className="people-empty">No groups match that search.</div> : null}
            {filteredGroups.map((group) => <button type="button" key={`${group.provider}:${group.id}`} className={`groups-panel-group${selected?.id === group.id && selected?.provider === group.provider ? " active" : ""}`} onClick={() => selectGroup(group)}>
              <UsersRoundIcon size={16} aria-hidden="true" />
              <span><strong>{group.name}</strong><small>{group.path}</small></span>
            </button>)}
          </div>
          <div className="groups-panel-members" aria-live="polite">
            {!selected ? <div className="people-empty">Choose a group to view its members.</div> : <>
              <div className="groups-panel-members-head"><div><h3>{selected.name}</h3><p className="field-hint">{membersLoading ? "Loading members…" : `${echoMembers.length} Echo member${echoMembers.length === 1 ? "" : "s"}`}</p></div></div>
              {!membersLoading ? <><label className="sr-only" htmlFor="member-search">Search members</label><input id="member-search" className="groups-panel-filter" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members" /></> : null}
              {membersLoading ? <div className="people-empty">Loading members…</div> : filteredMembers.length === 0 ? <div className="people-empty">{echoMembers.length === 0 ? "No Echo members are in this group." : "No members match that search."}</div> : filteredMembers.map((member) => <button type="button" className="person-row groups-panel-member" key={member.id} onClick={() => onOpenProfile(member.echoUser)} aria-label={`View profile for ${member.displayName}`}>
                <Avatar name={member.displayName} src={member.echoUser?.avatarUrl} size={30} />
                <div className="person-info"><div className="person-name">{member.displayName}</div><div className="person-handle">@{member.username}</div></div>
                <ChevronRightIcon className="groups-panel-member-arrow" size={16} aria-hidden="true" />
              </button>)}
            </>}
          </div>
        </div>
      </div>
    </aside>
  );
}
