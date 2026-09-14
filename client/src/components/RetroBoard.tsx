import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  GripVertical,
  LayoutPanelTop,
  Link,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Modal from "./Modal.js";
import ConfirmDialog from "./ConfirmDialog.js";
import Composer from "./Composer.js";
import Avatar from "./Avatar.js";
import { getSocket } from "../socket.js";

const COLUMNS = [
  { id: "went-well", label: "Went well", tone: "sun" },
  { id: "to-improve", label: "To improve", tone: "coral" },
  { id: "backlog", label: "Backlog", tone: "violet" },
  { id: "action-items", label: "Action items", tone: "mint" },
];
const canLink = (column) => column === "backlog" || column === "action-items";
function RetroIdeaModal({ draft, messageId, onClose, onSave }) {
  const [link, setLink] = useState(draft.link || "");
  const [, setBody] = useState(draft.text || "");
  const composerRef = useRef(null);
  const channel = { id: `retro-${messageId}`, type: "public", name: "retro" };
  const hasLink = canLink(draft.column);
  return (
    <Modal
      title={
        draft.id
          ? "Edit idea"
          : `Add to ${COLUMNS.find((column) => column.id === draft.column)?.label}`
      }
      className="retro-idea-modal"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        requestAnimationFrame(() => composerRef.current?.focus());
      }}
      onClose={onClose}
    >
      {hasLink && (
        <label className="schedule-custom-field retro-modal-link">
          <span>
            Linked work URL <em>(optional)</em>
          </span>
          <input
            className="settings-input"
            type="url"
            value={link}
            placeholder="Paste a link (optional)"
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                composerRef.current?.focus();
              }
            }}
          />
        </label>
      )}
      <Composer
        ref={composerRef}
        key={draft.id || draft.column}
        channel={channel}
        parentId={messageId}
        initialContent={draft.text || ""}
        onDraftChange={setBody}
        onSend={(text) => {
          if (text.trim()) onSave({ ...draft, text, link });
        }}
        sendAriaLabel={draft.id ? "Save changes" : "Add idea"}
        sendTitle={draft.id ? "Save changes" : "Add idea"}
        placeholder="Write an idea…"
        showSchedule={false}
        showAttachments={false}
      />
    </Modal>
  );
}

function RetroItem({
  item,
  author,
  currentUserId,
  creatorId,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}) {
  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
      className="retro-item"
    >
      <div className="retro-item-top">
        <span className="retro-drag-handle" aria-hidden="true">
          <GripVertical size={15} />
        </span>
        <p>{item.text}</p>
        {(item.authorId === currentUserId || creatorId === currentUserId) && (
          <span className="retro-item-actions">
            <button
              type="button"
              title="Edit idea"
              aria-label="Edit idea"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onEdit(item)}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              title="Delete idea"
              aria-label="Delete idea"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDelete(item)}
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="retro-item-link"
          title="Open linked item"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Link size={13} /> Linked work <ArrowUpRight size={13} />
        </a>
      )}
      <footer>
        <Avatar
          name={author?.displayName || author?.username || "Teammate"}
          src={author?.avatarUrl || null}
          size={20}
        />
        <span>
          {item.authorId === currentUserId
            ? "You"
            : author?.displayName || author?.username || "Teammate"}
        </span>
      </footer>
    </article>
  );
}

function RetroColumn({
  column,
  items,
  usersById,
  currentUserId,
  creatorId,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
}) {
  const [isOver, setIsOver] = useState(false);
  return (
    <section
      className={`retro-column ${column.tone}${isOver ? " is-drop-target" : ""}`}
      data-retro-column={column.id}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOver(false);
      }}
      onDrop={(event) => {
        setIsOver(false);
        onDrop(event, column.id);
      }}
    >
      <div className="retro-cards">
        {items.map((item) => (
          <RetroItem
            key={item.id}
            item={item}
            author={usersById?.get(item.authorId)}
            currentUserId={currentUserId}
            creatorId={creatorId}
            onEdit={onEdit}
            onDelete={onDelete}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
      {!items.length && <div className="retro-empty">No ideas yet</div>}
    </section>
  );
}

function RetroColumnHeader({ column, itemCount, onAdd }) {
  return (
    <header className={`retro-column-header ${column.tone}`}>
      <div className="retro-column-heading">
        <span>{column.label}</span>
        <b>{itemCount}</b>
      </div>
      <button
        type="button"
        className="retro-column-submit"
        onClick={() => onAdd(column.id)}
      >
        <Plus size={14} /> Add idea
      </button>
    </header>
  );
}

export default function RetroBoard({
  messageId,
  retro,
  usersById,
  currentUserId,
  creatorId,
}) {
  const [open, setOpen] = useState(false),
    [ideaDraft, setIdeaDraft] = useState(null),
    [deleteItem, setDeleteItem] = useState(null),
    [error, setError] = useState("");
  const boardScrollRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const grouped = useMemo(
    () =>
      COLUMNS.reduce(
        (all, column) => ({
          ...all,
          [column.id]: retro.items.filter((item) => item.column === column.id),
        }),
        {},
      ),
    [retro.items],
  );
  const update = (change, done) => {
    setError("");
    getSocket().emit("retro:update", { messageId, change }, (result) => {
      if (result?.error) {
        pendingScrollRef.current = null;
        setError(result.error);
      }
      else done?.();
    });
  };
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending) return;
    const items = grouped[pending.column] || [];
    if (items.length <= pending.itemCount) return;

    const frame = requestAnimationFrame(() => {
      const board = boardScrollRef.current;
      const column = boardScrollRef.current?.querySelector(
        `[data-retro-column="${pending.column}"]`,
      );
      const newItem = column?.querySelector(
        ".retro-cards > .retro-item:last-child",
      );
      if (board && newItem) {
        const boardRect = board.getBoundingClientRect();
        const headerRect = board
          .querySelector(".retro-column-headers")
          ?.getBoundingClientRect();
        const itemRect = newItem.getBoundingClientRect();
        const visibleTop = Math.max(
          boardRect.top,
          headerRect?.bottom || boardRect.top,
        );
        const visibleBottom = boardRect.bottom;
        const margin = 8;
        let delta = 0;
        if (itemRect.top < visibleTop + margin) {
          delta = itemRect.top - visibleTop - margin;
        } else if (itemRect.bottom > visibleBottom - margin) {
          delta = itemRect.bottom - visibleBottom + margin;
        }
        if (delta) board.scrollBy({ top: delta, behavior: "smooth" });
      }
      pendingScrollRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [grouped]);
  const saveIdea = (idea) => {
    if (!idea.id) {
      pendingScrollRef.current = {
        column: idea.column,
        itemCount: grouped[idea.column]?.length || 0,
      };
    }
    update(
      idea.id
        ? { action: "edit", itemId: idea.id, text: idea.text, link: idea.link }
        : {
            action: "add",
            column: idea.column,
            text: idea.text,
            link: idea.link,
          },
      () => setIdeaDraft(null),
    );
  };
  return (
    <>
      <button
        type="button"
        className="retro-message-card"
        onClick={() => setOpen(true)}
        aria-label="Open retrospective board"
      >
        <span className="retro-message-icon">
          <LayoutPanelTop size={18} />
        </span>
        <span className="retro-message-copy">
          <strong>{retro.title}</strong>
          <small>
            Retrospective board · {retro.items.length}{" "}
            {retro.items.length === 1 ? "idea" : "ideas"}
          </small>
        </span>
        <span className="retro-message-open">
          Open board <ArrowUpRight size={15} />
        </span>
      </button>
      {open && (
        <Modal
          title={retro.title}
          className="retro-modal"
          testId={`retro-${messageId}`}
          onClose={() => setOpen(false)}
        >
          <div className="retro-intro">
            <span>
              <LayoutPanelTop size={17} /> Team retrospective
            </span>
          </div>
          {error && (
            <p className="retro-error" role="alert">
              {error}
            </p>
          )}
          <div className="retro-board-scroll" ref={boardScrollRef}>
            <div className="retro-columns">
              <div className="retro-column-headers">
                {COLUMNS.map((column) => (
                  <RetroColumnHeader
                    key={column.id}
                    column={column}
                    itemCount={grouped[column.id].length}
                    onAdd={(id) =>
                      setIdeaDraft({ column: id, text: "", link: "" })
                    }
                  />
                ))}
              </div>
              {COLUMNS.map((column) => (
                <RetroColumn
                  key={column.id}
                  column={column}
                  items={grouped[column.id]}
                  usersById={usersById}
                  currentUserId={currentUserId}
                  creatorId={creatorId}
                  onEdit={setIdeaDraft}
                  onDelete={setDeleteItem}
                  onDragStart={(event, item) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragEnd={() => setIsOver(false)}
                  onDrop={(event, columnId) => {
                    event.preventDefault();
                    const itemId = event.dataTransfer.getData("text/plain");
                    const item = retro.items.find(
                      (candidate) => candidate.id === itemId,
                    );
                    if (item && item.column !== columnId)
                      update({ action: "move", itemId, column: columnId });
                  }}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}
      {ideaDraft && (
        <RetroIdeaModal
          draft={ideaDraft}
          messageId={messageId}
          onClose={() => setIdeaDraft(null)}
          onSave={saveIdea}
        />
      )}
      {deleteItem && (
        <ConfirmDialog
          title="Delete idea?"
          message="This will permanently remove this idea from the retrospective."
          confirmLabel="Delete idea"
          danger
          onCancel={() => setDeleteItem(null)}
          onConfirm={() =>
            update({ action: "delete", itemId: deleteItem.id }, () =>
              setDeleteItem(null),
            )
          }
        />
      )}
    </>
  );
}
