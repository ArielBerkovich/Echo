// Shared inline SVG icons (stroke uses currentColor so they inherit text color).

export function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5l3 3L7 16l-3.5.5L4 13z" />
      <path d="M12 5l3 3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M8 6V4h4v2M6 6l.7 10a1 1 0 001 .9h4.6a1 1 0 001-.9L15 6" />
    </svg>
  );
}

export function ReplyIcon() {
  // Two overlapping chat bubbles — a "thread / reply" glyph.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 15H5a2 2 0 01-2-2V6a2 2 0 012-2h9a2 2 0 012 2v1" />
      <path d="M11 20l3-3h5a2 2 0 002-2v-4a2 2 0 00-2-2h-7a2 2 0 00-2 2v9z" />
    </svg>
  );
}

export function EmojiAddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 9.5A7 7 0 1110.5 3" />
      <path d="M7.3 12.2a3.4 3.4 0 005 .6" />
      <circle cx="7.6" cy="8.4" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8.4" r="0.5" fill="currentColor" stroke="none" />
      <path d="M15.5 2.5v4M13.5 4.5h4" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6H6a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-3" />
      <path d="M11 3h6v6M17 3l-7 7" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="6" width="9" height="10" rx="1.5" />
      <path d="M4 12.5V4.5A1.5 1.5 0 015.5 3h7" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8a1 1 0 011 1V17l-5-3.2L5 17V4.5a1 1 0 011-1z" />
    </svg>
  );
}

export function PersonAddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="6.5" r="3" />
      <path d="M2 16.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 6v5M13 8.5h5" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l6 6-2.5 2.5-2-1L9 14l1 2-1.5 1.5-4-4L6 12 2.5 8.5 4 7l2 1 4.5-4.5-1-2z" />
      <line x1="2" y1="18" x2="7" y2="13" />
    </svg>
  );
}

export function LeaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5H5a1.5 1.5 0 00-1.5 1.5v10A1.5 1.5 0 005 16.5h3" />
      <path d="M12 6l4 4-4 4M16 10H7.5" />
    </svg>
  );
}
