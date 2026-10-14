import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import Modal, { ModalActions } from "./Modal.js";
import { Button } from "./Button.js";
import { useI18n } from "../lib/i18n.js";
import { CheckIcon, ChevronDownIcon, ContactRoundIcon } from "lucide-react";

const GROUP_MEMBER_ROW_HEIGHT = 46;
const GROUP_MEMBER_LIST_HEIGHT = 260;

export default function AddGroupModal({ channel, onUpdated, onClose }) {
  const { t, translateError } = useI18n();
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [progress, setProgress] = useState(0);
  const [memberScrollTop, setMemberScrollTop] = useState(0);
  const [memberListHeight, setMemberListHeight] = useState(GROUP_MEMBER_LIST_HEIGHT);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupSelectRef = useRef(null);
  const groupOptionRefs = useRef([]);
  const memberListRef = useRef(null);

  useEffect(() => {
    let active = true;
    api.listGroups().then(({ groups: items = [] }) => {
      if (!active) return;
      setGroups(items);
      setSelectedId(items[0]?.id || "");
    }).catch((err) => {
      if (active) setError(translateError(err.message));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [translateError]);

  const selected = groups.find((group) => group.id === selectedId);
  const selectedIndex = Math.max(0, groups.findIndex((group) => group.id === selectedId));
  const memberIds = useMemo(() => new Set(channel.members || []), [channel.members]);
  const eligible = (selected?.members || []).filter((member) => !memberIds.has(member.id));
  const alreadyInChannel = (selected?.members || []).length - eligible.length;
  const groupMembers = selected?.members || [];
  const firstVisibleMember = Math.max(0, Math.floor(memberScrollTop / GROUP_MEMBER_ROW_HEIGHT) - 3);
  const lastVisibleMember = Math.min(groupMembers.length, firstVisibleMember + Math.ceil(memberListHeight / GROUP_MEMBER_ROW_HEIGHT) + 6);
  const visibleGroupMembers = groupMembers.slice(firstVisibleMember, lastVisibleMember);

  useEffect(() => {
    const list = memberListRef.current;
    if (!list) return undefined;
    list.scrollTop = 0;
    setMemberScrollTop(0);
    const updateHeight = () => setMemberListHeight(list.clientHeight || GROUP_MEMBER_LIST_HEIGHT);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, [selectedId, loading]);

  useEffect(() => {
    if (!groupMenuOpen) return undefined;
    function closeOutside(event) {
      if (!groupSelectRef.current?.contains(event.target)) setGroupMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [groupMenuOpen]);

  useEffect(() => {
    if (groupMenuOpen) groupOptionRefs.current[selectedIndex]?.focus();
  }, [groupMenuOpen, selectedIndex]);

  function handleGroupOptionKeyDown(event, index) {
    if (event.key === "Escape") {
      event.preventDefault();
      setGroupMenuOpen(false);
      groupSelectRef.current?.querySelector(".add-group-channel-trigger")?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (index + delta + groups.length) % groups.length;
    groupOptionRefs.current[nextIndex]?.focus();
  }

  async function addGroup() {
    if (!selected || !eligible.length) return;
    setAdding(true);
    setError("");
    setResult("");
    setProgress(0);
    let added = 0;
    let failed = 0;
    let latestChannel = null;
    for (let start = 0; start < eligible.length; start += 5) {
      const batch = eligible.slice(start, start + 5);
      const outcomes = await Promise.allSettled(batch.map((member) => api.addChannelMember(channel.id, member.id)));
      outcomes.forEach((outcome) => {
        if (outcome.status === "fulfilled") {
          added += 1;
          latestChannel = outcome.value.channel || latestChannel;
        } else failed += 1;
      });
      setProgress(Math.min(start + batch.length, eligible.length));
    }
    if (latestChannel) {
      try {
        const latest = await api.getChannel(channel.id);
        onUpdated?.(latest.channel || latestChannel);
      } catch {
        onUpdated?.(latestChannel);
      }
    }
    setResult(t("addGroupResult").replace("{added}", String(added)).replace("{existing}", String(alreadyInChannel)).replace("{failed}", String(failed)));
    setAdding(false);
  }

  return <Modal title={t("addGroupToChannel")} className="add-group-channel-modal" closeDisabled={adding} onClose={onClose}>
    <p className="groups-dialog-intro">{t("addGroupToChannelHint")}</p>
    {loading ? <div className="people-empty" role="status">{t("loadingGroups")}</div> : error ? <p className="add-group-channel-error" role="alert">{error}</p> : groups.length ? <>
      <label className="add-group-channel-label" id="add-group-channel-label">{t("group")}</label>
      <div className="add-group-channel-select-wrap" ref={groupSelectRef}>
        <button type="button" id="add-group-channel-select" className="add-group-channel-trigger" aria-labelledby="add-group-channel-label add-group-channel-selected" aria-haspopup="listbox" aria-expanded={groupMenuOpen} aria-controls="add-group-channel-options" disabled={adding} onClick={() => setGroupMenuOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setGroupMenuOpen(true); } }}>
          <ContactRoundIcon size={17} aria-hidden="true" />
          <span id="add-group-channel-selected">{selected ? `${selected.name} (${selected.memberCount})` : t("selectGroup")}</span>
          <ChevronDownIcon size={16} aria-hidden="true" />
        </button>
        {groupMenuOpen && <div className="add-group-channel-options" id="add-group-channel-options" role="listbox" aria-label={t("selectGroup")}>
          {groups.map((group, index) => <button type="button" role="option" aria-selected={group.id === selectedId} className={`add-group-channel-option${group.id === selectedId ? " selected" : ""}`} key={group.id} ref={(element) => { groupOptionRefs.current[index] = element; }} onKeyDown={(event) => handleGroupOptionKeyDown(event, index)} onClick={() => { setSelectedId(group.id); setResult(""); setGroupMenuOpen(false); groupSelectRef.current?.querySelector(".add-group-channel-trigger")?.focus(); }}>
            <ContactRoundIcon size={16} aria-hidden="true" /><span>{group.name} ({group.memberCount})</span>{group.id === selectedId && <CheckIcon size={15} aria-hidden="true" />}
          </button>)}
        </div>}
      </div>
      {selected && <>
        <div className="add-group-channel-members-heading">
          <span>{t("selectedGroupMembers")}</span>
          <span className="add-group-channel-count">{groupMembers.length}</span>
        </div>
        <div className="add-group-channel-summary">
          <span>{eligible.length} {t("peopleToAdd")}</span>
          {alreadyInChannel > 0 && <span>{alreadyInChannel} {t("alreadyInChannel")}</span>}
        </div>
        <div className="add-group-channel-members" ref={memberListRef} role="list" aria-label={t("selectedGroupMembers")} onScroll={(event) => setMemberScrollTop(event.currentTarget.scrollTop)}>
          <div className="add-group-channel-member-virtual-content" style={{ height: groupMembers.length * GROUP_MEMBER_ROW_HEIGHT }}>
          {visibleGroupMembers.map((member, index) => {
            const memberIndex = firstVisibleMember + index;
            return <div className={`mention-item add-group-channel-member${memberIndex === 0 ? " first" : ""}`} key={member.id} role="listitem" aria-posinset={memberIndex + 1} aria-setsize={groupMembers.length} style={{ transform: `translateY(${memberIndex * GROUP_MEMBER_ROW_HEIGHT}px)` }}><Avatar name={member.displayName} src={member.avatarUrl} size={26} /><span className="mention-item-copy"><span className="mi-name" dir="auto">{member.displayName}</span><span className="mi-handle" dir="ltr">@{member.username}</span></span>{memberIds.has(member.id) && <small className="add-group-channel-member-status">{t("alreadyInChannel")}</small>}</div>;
          })}
          </div>
          {!selected.members?.length && <div className="people-empty">{t("emptyGroup")}</div>}
        </div>
      </>}
      {adding && <div className="add-group-channel-progress" role="status"><div>{t("addingGroupMembers").replace("{done}", String(progress)).replace("{total}", String(eligible.length))}</div><div className="add-group-channel-progress-track"><span style={{ width: `${eligible.length ? (progress / eligible.length) * 100 : 0}%` }} /></div></div>}
      {result && <p className="add-group-channel-result" role="status">{result}</p>}
    </> : <div className="people-empty">{t("noGroupsAvailable")}</div>}
    <ModalActions>
      <Button variant="secondary" onClick={onClose} disabled={adding}>{t("done")}</Button>
      <Button variant="primary" onClick={addGroup} disabled={loading || adding || !eligible.length}>{adding ? t("adding") : t("add")}</Button>
    </ModalActions>
  </Modal>;
}
