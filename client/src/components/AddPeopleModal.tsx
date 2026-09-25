import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.js";
import Modal, { ModalActions } from "./Modal.js";
import { useI18n } from "../lib/i18n.js";

const PEOPLE_ROW_HEIGHT = 52;
const PEOPLE_LIST_HEIGHT = 340;

// Pick workspace members to add to a channel. Adding is immediate; the person
// then drops out of the list. "Done" closes the dialog.
export default function AddPeopleModal({ channel, users, onAdd, onClose }) {
  const { t, translateError } = useI18n();
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [listScrollTop, setListScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
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

  function onSearchKeyDown(event) {
    if (event.key === "Enter") {
      const selected = available[activeIndex];
      if (!selected || adding) return;
      event.preventDefault();
      add(selected);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!available.length) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (activeIndex + delta + available.length) % available.length;
    setActiveIndex(nextIndex);
    const list = listRef.current;
    if (!list) return;
    const nextTop = nextIndex * PEOPLE_ROW_HEIGHT;
    const nextBottom = nextTop + PEOPLE_ROW_HEIGHT;
    if (nextTop < list.scrollTop) {
      list.scrollTo({ top: nextTop });
    } else if (nextBottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: nextBottom - list.clientHeight });
    }
  }

  async function add(u) {
    setAdding(u.id);
    setError(null);
    try {
      await onAdd(u.id);
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Modal title={isGroupDm ? t("addPeopleToGroupConversation") : t("addPeopleToChannel").replace("{channel}", `${channel.type === "private" ? "🔒" : "#"} ${channel.name}`)} onClose={onClose}>
      <div data-testid="add-people-modal">
        {isGroupDm && memberIds.size >= 10 ? (
          <div className="people-empty">{t("groupConversationLimit")}</div>
        ) : null}
        <input
          className="people-filter"
          ref={searchRef}
          data-testid="add-people-search"
          aria-label={t("searchPeopleToAdd")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setActiveIndex(0);
            setListScrollTop(0);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={onSearchKeyDown}
          placeholder={t("searchPeople")}
          autoFocus
        />

        <div
          className="people-list"
          ref={listRef}
          onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}
        >
          {isGroupDm && memberIds.size >= 10 ? null : available.length === 0 ? (
            <div className="people-empty">{t("everyoneAlreadyHere")}</div>
          ) : (
            <div className="people-virtual-content" style={{ height: available.length * PEOPLE_ROW_HEIGHT }}>
              {visibleUsers.map((u, index) => (
                <div className={`person-row${firstVisible + index === activeIndex ? " active" : ""}`} key={u.id} style={{ transform: `translateY(${(firstVisible + index) * PEOPLE_ROW_HEIGHT}px)` }}>
                  <Avatar name={u.displayName} src={u.avatarUrl} size={32} />
                  <div className="person-info">
                    <div className="person-name">{u.displayName}</div>
                    <div className="person-handle">@{u.username}</div>
                  </div>
                  <button type="button" className="btn-secondary" data-testid={`add-people-add-${u.username}`} disabled={adding === u.id} onClick={() => add(u)}>
                    {adding === u.id ? t("adding") : t("add")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <ModalActions>
          <button type="button" className="btn-primary" data-testid="add-people-done" onClick={onClose}>
            {t("done")}
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}
