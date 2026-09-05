import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.js";
import Modal, { ModalActions } from "./Modal.js";
import useRecipientPickerKeyboard from "./useRecipientPickerKeyboard.js";

const PEOPLE_ROW_HEIGHT = 52;
const PEOPLE_LIST_HEIGHT = 340;

// Pick workspace members to add to a channel. Adding is immediate; the person
// then drops out of the list. "Done" closes the dialog.
export default function AddPeopleModal({ channel, users, onAdd, onClose }) {
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [listScrollTop, setListScrollTop] = useState(0);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, []);

  const memberIds = useMemo(
    () => new Set(
      channel.members?.length
        ? channel.members
        : (channel.participants || []).map((member) => member.id)
    ),
    [channel.members, channel.participants]
  );
  const isGroupDm = channel.type === "dm" && memberIds.size > 2;
  const q = filter.trim().toLowerCase();
  const available = useMemo(() => users
    .filter((u) => !memberIds.has(u.id))
    .filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    ), [memberIds, q, users]);
  const firstVisible = Math.max(0, Math.floor(listScrollTop / PEOPLE_ROW_HEIGHT) - 2);
  const lastVisible = Math.min(
    available.length,
    firstVisible + Math.ceil(PEOPLE_LIST_HEIGHT / PEOPLE_ROW_HEIGHT) + 4
  );
  const visibleUsers = available.slice(firstVisible, lastVisible);

  const {
    activeIndex,
    activeOptionRef,
    handleKeyDown,
    setActiveIndex,
  } = useRecipientPickerKeyboard({
    items: available,
    hasQuery: Boolean(q),
    // The list is virtualized, so the parent scrolls to an off-screen active
    // row before it can be rendered and assigned activeOptionRef.
    scrollEnabled: false,
    onSelect: add,
  });

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(available.length - 1, 0)));
  }, [available.length]);

  useEffect(() => {
    if (!q || !available.length || !listRef.current) return;
    const list = listRef.current;
    const targetTop = activeIndex * PEOPLE_ROW_HEIGHT;
    const targetBottom = targetTop + PEOPLE_ROW_HEIGHT;
    if (targetTop < list.scrollTop) {
      list.scrollTo({ top: targetTop });
    } else if (targetBottom > list.scrollTop + PEOPLE_LIST_HEIGHT) {
      list.scrollTo({ top: targetBottom - PEOPLE_LIST_HEIGHT });
    }
  }, [activeIndex, available.length, q]);

  async function add(u) {
    setAdding(u.id);
    setError(null);
    try {
      await onAdd(u.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(null);
    }
  }

  return (
    <Modal title={isGroupDm ? "Add people to this group DM" : `Add people to ${channel.type === "private" ? "🔒" : "#"} ${channel.name}`} onClose={onClose}>
      <div data-testid="add-people-modal">
        {isGroupDm && memberIds.size >= 10 ? (
          <div className="people-empty">This group DM has reached the 10-person limit.</div>
        ) : null}
        <input
          className="people-filter"
          ref={searchRef}
          data-testid="add-people-search"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setActiveIndex(0);
            setListScrollTop(0);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search people"
          autoFocus
        />

        <div
          className="people-list"
          ref={listRef}
          onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}
        >
          {isGroupDm && memberIds.size >= 10 ? null : available.length === 0 ? (
            <div className="people-empty">Everyone in the workspace is already here.</div>
          ) : (
            <div className="people-virtual-content" style={{ height: available.length * PEOPLE_ROW_HEIGHT }}>
              {visibleUsers.map((u, index) => {
                const rowIndex = firstVisible + index;
                return (
                <div
                  className={`person-row ${rowIndex === activeIndex ? "active" : ""}`}
                  key={u.id}
                  ref={rowIndex === activeIndex ? activeOptionRef : undefined}
                  style={{ transform: `translateY(${rowIndex * PEOPLE_ROW_HEIGHT}px)` }}
                  onMouseEnter={() => setActiveIndex(rowIndex)}
                >
                  <Avatar name={u.displayName} src={u.avatarUrl} size={32} />
                  <div className="person-info">
                    <div className="person-name">{u.displayName}</div>
                    <div className="person-handle">@{u.username}</div>
                  </div>
                  <button type="button" className="btn-secondary" data-testid={`add-people-add-${u.username}`} disabled={adding === u.id} onClick={() => add(u)}>
                    {adding === u.id ? "Adding…" : "Add"}
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <ModalActions>
          <button type="button" className="btn-primary" data-testid="add-people-done" onClick={onClose}>
            Done
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}
