import { useEffect, useRef, useState } from "react";
import { ActivityIcon, BookmarkIcon, HomeIcon, MessageSquareTextIcon } from "lucide-react";
import Logo from "./Logo.js";

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
  const activeIndex = Math.max(0, ITEMS.findIndex((item) => item.key === view));

  useEffect(() => () => clearTimeout(clickTimerRef.current), []);

  function pulse(key) {
    clearTimeout(clickTimerRef.current);
    setClicked(key);
    clickTimerRef.current = setTimeout(() => setClicked(null), 650);
  }

  return (
    <nav className="rail" aria-label="Primary navigation">
      <div className="rail-brand" aria-hidden="true">
        <Logo size={54} />
        <span className="rail-brand-name">echo</span>
      </div>
      <div className="rail-top" style={{ "--rail-active-index": activeIndex }}>
        <span className="rail-active-indicator" aria-hidden="true" />
        {ITEMS.map(({ key, label, Icon }) => {
          const count = badges[key] || 0;
          return (
            <button
              key={key}
              type="button"
              className={`rail-item rail-item-${key} ${view === key ? "active" : ""} ${clicked === key ? "clicked" : ""}`}
              data-testid={`rail-${key}`}
              aria-current={view === key ? "page" : undefined}
              onClick={() => {
                pulse(key);
                onSelect(key);
              }}
            >
              <span className="rail-icon">
                <Icon />
                {count > 0 && (
                  <span className={`rail-badge ${key === "home" ? "dot" : ""}`} aria-hidden="true">
                    {key === "home" ? null : count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="rail-label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
