import { ActivityIcon, BookmarkIcon, HomeIcon, MessageSquareTextIcon } from "lucide-react";

const icon = (Icon) => () => <Icon size={22} strokeWidth={2} />;
const ITEMS = [
  { key: "home", label: "Home", Icon: icon(HomeIcon) },
  { key: "dms", label: "DMs", Icon: icon(MessageSquareTextIcon) },
  { key: "activity", label: "Activity", Icon: icon(ActivityIcon) },
  { key: "saved", label: "Saved", Icon: icon(BookmarkIcon) },
];

export default function LeftRail({ view, onSelect, badges = {} }) {
  return (
    <nav className="rail">
      <div className="rail-top">
        {ITEMS.map(({ key, label, Icon }) => {
          const count = badges[key] || 0;
          return (
            <button
              key={key}
              className={`rail-item ${view === key ? "active" : ""}`}
              data-testid={`rail-${key}`}
              onClick={() => onSelect(key)}
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
