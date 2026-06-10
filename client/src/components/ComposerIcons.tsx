// Slack-style line icons for the composer. All inherit `currentColor`.
const base = {
  width: 19,
  height: 19,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const LinkIcon = () => (
  <svg {...base}>
    <path d="M8.7 11.3a2.6 2.6 0 003.7 0l2.3-2.3a2.6 2.6 0 00-3.7-3.7l-1 1" />
    <path d="M11.3 8.7a2.6 2.6 0 00-3.7 0l-2.3 2.3a2.6 2.6 0 003.7 3.7l1-1" />
  </svg>
);

export const OrderedListIcon = () => (
  <svg {...base}>
    <path d="M8 6.5h9M8 13.5h9" />
    <text x="1" y="8.6" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">1</text>
    <text x="1" y="15.6" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">2</text>
  </svg>
);

export const BulletListIcon = () => (
  <svg {...base}>
    <circle cx="3.4" cy="6.4" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="3.4" cy="13.4" r="1.3" fill="currentColor" stroke="none" />
    <path d="M8 6.5h9M8 13.5h9" />
  </svg>
);

export const QuoteIcon = () => (
  <svg {...base}>
    <path d="M4 5.5v9" strokeWidth="2" />
    <path d="M8 6.5h9M8 13.5h9" />
  </svg>
);

export const CodeIcon = () => (
  <svg {...base}>
    <path d="M7.5 6.5L4 10l3.5 3.5M12.5 6.5L16 10l-3.5 3.5" />
  </svg>
);

export const CodeBlockIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" strokeWidth="1.4" />
    <path d="M8.2 8l-1.7 2 1.7 2M11.8 8l1.7 2-1.7 2" strokeWidth="1.3" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base} strokeWidth="1.8">
    <path d="M10 5v10M5 10h10" />
  </svg>
);

export const SmileyIcon = () => (
  <svg {...base} strokeWidth="1.5">
    <circle cx="10" cy="10" r="7" />
    <circle cx="7.6" cy="8.6" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="12.4" cy="8.6" r="0.6" fill="currentColor" stroke="none" />
    <path d="M7.2 12.2a3.4 3.4 0 005.6 0" />
  </svg>
);

export const SendIcon = () => (
  <svg {...base} strokeWidth="1.5">
    <path d="M4 10l12.5-5.5-4 12.5-3-5z" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base}>
    <path d="M6 8.5l4 4 4-4" />
  </svg>
);
