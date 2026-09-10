import {
  ArrowUpRight, BookOpen, Bug, CheckSquare2, CircleAlert, ClipboardList,
  Construction, FileText, FlaskConical, RefreshCw, Sparkles, Zap,
} from "lucide-react";
import { formatDateTime } from "../lib/time.js";
import Avatar from "./Avatar.js";

const TYPE_ICONS = new Map([
  ["bug", Bug], ["task", CheckSquare2], ["epic", Zap],
  ["story", BookOpen], ["user story", BookOpen], ["feature", Sparkles],
  ["issue", CircleAlert], ["test case", FlaskConical], ["test plan", ClipboardList],
  ["test suite", FlaskConical], ["requirement", FileText], ["impediment", Construction],
  ["change request", RefreshCw], ["product backlog item", ClipboardList],
]);
const TYPE_LABEL = /^(type|work item type|issue type)$/i;
const STATUS_LABEL = /^(status|state)$/i;
const CARD_COLORS = {
  blue: "#2563eb", cyan: "#0891b2", green: "#16a34a", amber: "#d97706",
  orange: "#ea580c", red: "#dc2626", pink: "#db2777", purple: "#7c3aed", gray: "#64748b",
};

function resolveColor(value) {
  const color = String(value || "").trim().toLowerCase();
  return CARD_COLORS[color] || (/^#[0-9a-f]{6}$/i.test(color) ? color : undefined);
}

function cardStyle(card) {
  const accent = resolveColor(card.color);
  const title = resolveColor(card.titleColor);
  if (!accent && !title) return undefined;
  return {
    ...(accent ? { "--card-accent": accent } : {}),
    ...(title ? { "--card-title-color": title } : {}),
  };
}

function peopleByUsername(usersById) {
  const people = new Map();
  for (const user of usersById?.values() || []) {
    if (user.username) people.set(user.username.toLowerCase(), user);
  }
  return people;
}

function CardAttribute({ item, person }) {
  const TypeIcon = item.type !== "user" && TYPE_LABEL.test(item.label.trim())
    ? TYPE_ICONS.get(item.value.trim().toLowerCase().replace(/\s+/g, " "))
    : null;
  const valueClass = person
    ? "message-card-person"
    : STATUS_LABEL.test(item.label) ? "message-card-status" : undefined;

  return (
    <div className="message-card-field">
      <dt>{item.label}</dt>
      <dd className={valueClass}>
        {person && <Avatar name={person.displayName || person.username} src={person.avatarUrl} size={20} />}
        {TypeIcon && <TypeIcon className="message-card-type-icon" size={15} strokeWidth={2.1} aria-hidden="true" />}
        <span>{person?.displayName || item.value}</span>
      </dd>
    </div>
  );
}

export default function Card({ card, usersById }) {
  if (!card?.title || !card?.url) return null;
  const attributes = Array.isArray(card.attributes)
    ? card.attributes.filter((item) => item?.label && item?.value)
    : [];
  const people = attributes.some((item) => item.type === "user")
    ? peopleByUsername(usersById)
    : new Map();
  const timestamp = card.timestamp && !Number.isNaN(new Date(card.timestamp).getTime())
    ? formatDateTime(card.timestamp)
    : "";

  return (
    <a
      className="message-card"
      style={cardStyle(card)}
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open card"
      aria-label={`Open ${card.eyebrow ? `${card.eyebrow}: ` : ""}${card.title}`}
    >
      {(card.eyebrow || timestamp) && (
        <span className="message-card-eyebrow">
          {card.eyebrow && <span>{card.eyebrow}</span>}
          {timestamp && <time dateTime={card.timestamp} aria-label={`Event time ${timestamp}`}>{timestamp}</time>}
        </span>
      )}
      <span className="message-card-heading">
        <strong className="message-card-title">{card.title}</strong>
        <ArrowUpRight size={16} aria-hidden="true" />
      </span>
      {card.description && <p className="message-card-description">{card.description}</p>}
      {attributes.length > 0 && (
        <dl className="message-card-attributes">
          {attributes.map((item, index) => {
            const username = item.value.replace(/^@/, "").toLowerCase();
            const person = item.type === "user" ? people.get(username) : null;
            return <CardAttribute key={`${item.label}-${index}`} item={item} person={person} />;
          })}
        </dl>
      )}
    </a>
  );
}
