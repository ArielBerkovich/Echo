const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M4.5 11.5L12 5l7.5 6.5" />
    <path d="M7 10.7V19h10v-8.3" />
  </svg>
);
const DmIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M5 6h14v9H9l-4 3v-3H5z" />
    <path d="M8 9h8M8 12h5" />
  </svg>
);
const ActivityIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M7 12h3l1.5-3 2.5 6 1.5-3H17" />
  </svg>
);
const SavedIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4h10v16l-5-3-5 3z" />
    <path d="M9 8h6" />
  </svg>
);

const ITEMS = [
  { key: "home", label: "Home", Icon: HomeIcon },
  { key: "dms", label: "DMs", Icon: DmIcon },
  { key: "activity", label: "Activity", Icon: ActivityIcon },
  { key: "saved", label: "Saved", Icon: SavedIcon },
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
