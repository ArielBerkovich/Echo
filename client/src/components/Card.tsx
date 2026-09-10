import Avatar from "./Avatar.js";
import { ArrowUpRight, BookOpen, Bug, CheckSquare2, CircleAlert, ClipboardList, Construction, FileText, FlaskConical, RefreshCw, Sparkles, Zap } from "lucide-react";
import { formatDateTime } from "../lib/time.js";

const TYPE_ICONS = new Map([
  ["bug", Bug], ["task", CheckSquare2], ["epic", Zap],
  ["story", BookOpen], ["user story", BookOpen], ["feature", Sparkles],
  ["issue", CircleAlert], ["test case", FlaskConical], ["test plan", ClipboardList],
  ["test suite", FlaskConical], ["requirement", FileText], ["impediment", Construction],
  ["change request", RefreshCw], ["product backlog item", ClipboardList],
]);

const CARD_COLORS = {
  blue: "#2563eb", cyan: "#0891b2", green: "#16a34a", amber: "#d97706",
  orange: "#ea580c", red: "#dc2626", pink: "#db2777", purple: "#7c3aed", gray: "#64748b",
};

function cardAccent(value) {
  const color = String(value || "").trim().toLowerCase();
  return CARD_COLORS[color] || (/^#[0-9a-f]{6}$/i.test(color) ? color : undefined);
}

export default function Card({ card, usersById }) {
  if (!card?.title || !card?.url) return null;
  const attributes = Array.isArray(card.attributes) ? card.attributes.filter((item) => item?.label && item?.value) : [];
  const people = new Map();
  if (attributes.some((item) => item.type === "user")) {
    for (const user of usersById?.values() || []) people.set(user.username?.toLowerCase(), user);
  }
  const accent = cardAccent(card.color);
  const titleColor = cardAccent(card.titleColor);
  const timestamp = card.timestamp && !Number.isNaN(new Date(card.timestamp).getTime()) ? formatDateTime(card.timestamp) : "";
  const style = accent || titleColor ? { ...(accent ? { "--card-accent": accent } : {}), ...(titleColor ? { "--card-title-color": titleColor } : {}) } : undefined;
  return <a className="message-card" style={style} href={card.url} target="_blank" rel="noopener noreferrer" title="Open card" aria-label={`Open ${card.eyebrow ? `${card.eyebrow}: ` : ""}${card.title}`}>
    {(card.eyebrow || timestamp) && <span className="message-card-eyebrow">{card.eyebrow && <span>{card.eyebrow}</span>}{timestamp && <time dateTime={card.timestamp} aria-label={`Event time ${timestamp}`}>{timestamp}</time>}</span>}
    <span className="message-card-heading"><strong className="message-card-title">{card.title}</strong><ArrowUpRight size={16} aria-hidden="true" /></span>
    {card.description && <p className="message-card-description">{card.description}</p>}
    {attributes.length > 0 && <dl className="message-card-attributes">{attributes.map((item, index) => {
      const person = item.type === "user" ? people.get(item.value.replace(/^@/, "").toLowerCase()) : null;
      const status = /^(status|state)$/i.test(item.label);
      const TypeIcon = item.type !== "user" && /^(type|work item type|issue type)$/i.test(item.label.trim())
        ? TYPE_ICONS.get(item.value.trim().toLowerCase().replace(/\s+/g, " ")) : null;
      return <div className="message-card-field" key={`${item.label}-${index}`}><dt>{item.label}</dt><dd className={person ? "message-card-person" : status ? "message-card-status" : undefined}>{person && <Avatar name={person.displayName || person.username} src={person.avatarUrl} size={20} />}{TypeIcon && <TypeIcon className="message-card-type-icon" size={15} strokeWidth={2.1} aria-hidden="true" />}<span>{person?.displayName || item.value}</span></dd></div>;
    })}</dl>}
  </a>;
}
