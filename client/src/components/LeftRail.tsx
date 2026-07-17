import { flushSync } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ActivityIcon, BookmarkIcon, HomeIcon, MessageSquareTextIcon } from "lucide-react";

const icon = (Icon) => () => <Icon size={22} strokeWidth={2} />;
const ITEMS = [
  { key: "home", label: "Home", Icon: icon(HomeIcon) },
  { key: "dms", label: "DMs", Icon: icon(MessageSquareTextIcon) },
  { key: "activity", label: "Activity", Icon: icon(ActivityIcon) },
  { key: "saved", label: "Saved", Icon: icon(BookmarkIcon) },
];

export default function LeftRail({ view, onSelect, badges = {} }) {
  const [clicked, setClicked] = useState(null);
  const clickTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(clickTimerRef.current), []);

  function pulse(key) {
    clearTimeout(clickTimerRef.current);
    setClicked(key);
    clickTimerRef.current = setTimeout(() => setClicked(null), 650);
  }

  function selectFromEvent(e) {
    const item = e.target.closest?.('button[data-testid^="rail-"]');
    if (!item) return;
    const key = item.dataset.testid?.slice("rail-".length);
    if (key) flushSync(() => {
      pulse(key);
      onSelect(key);
    });
  }

  return (
    <nav className="rail" onMouseDownCapture={selectFromEvent} onPointerDownCapture={selectFromEvent}>
      <div className="rail-top">
        {ITEMS.map(({ key, label, Icon }) => {
          const count = badges[key] || 0;
          return (
            <button
              key={key}
              type="button"
              className={`rail-item rail-item-${key} ${view === key ? "active" : ""} ${clicked === key ? "clicked" : ""}`}
              data-testid={`rail-${key}`}
              onClick={() => {
                pulse(key);
                onSelect(key);
              }}
            >
              <span className="rail-icon">
                <Icon />
                {count > 0 && <span className="rail-badge">{count > 99 ? "99+" : count}</span>}
              </span>
              <span className="rail-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
