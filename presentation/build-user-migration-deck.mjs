import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUTPUT = "/home/ariel/Echo_User_Migration_Overview.pptx";
const LOGO = path.join(ROOT, "client", "src", "assets", "echo-logo.png");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Echo";
pptx.subject = "User identity and history migration";
pptx.title = "Echo User Migration";
pptx.company = "Echo";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "DejaVu Sans",
  bodyFontFace: "DejaVu Sans",
  lang: "en-US",
};
pptx.defineSlideMaster({
  title: "ECHO",
  background: { color: "08111D" },
  objects: [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.08,
        fill: { color: "47D7C5" },
        line: { color: "47D7C5" },
      },
    },
    {
      text: {
        text: "ECHO  •  USER MIGRATION",
        options: {
          x: 0.55,
          y: 7.12,
          w: 4.3,
          h: 0.18,
          fontFace: "DejaVu Sans",
          fontSize: 8,
          bold: true,
          color: "718096",
          charSpacing: 1.3,
          margin: 0,
        },
      },
    },
  ],
  slideNumber: {
    x: 12.32,
    y: 7.08,
    w: 0.4,
    h: 0.2,
    fontFace: "DejaVu Sans",
    fontSize: 9,
    color: "718096",
    align: "right",
    margin: 0,
  },
});

const C = {
  bg: "08111D",
  panel: "101C2C",
  panel2: "142235",
  border: "26384E",
  ink: "F4F7FC",
  muted: "A7B4C7",
  dim: "738197",
  cyan: "47D7C5",
  blue: "66A6E8",
  green: "54D79D",
  amber: "F3B960",
  red: "FF7180",
  violet: "B88AF0",
  white: "FFFFFF",
};

const S = pptx.ShapeType;

function slideBase(section, title, subtitle = "") {
  const slide = pptx.addSlide("ECHO");
  slide.addText(section.toUpperCase(), {
    x: 0.58,
    y: 0.35,
    w: 2.5,
    h: 0.22,
    margin: 0,
    fontFace: "DejaVu Sans",
    fontSize: 10,
    bold: true,
    color: C.cyan,
    charSpacing: 1.5,
  });
  slide.addText(title, {
    x: 0.58,
    y: 0.63,
    w: 12.1,
    h: 0.48,
    margin: 0,
    fontFace: "DejaVu Sans",
    fontSize: 25,
    bold: true,
    color: C.ink,
    breakLine: false,
    fit: "shrink",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.58,
      y: 1.14,
      w: 11.9,
      h: 0.33,
      margin: 0,
      fontFace: "DejaVu Sans",
      fontSize: 11.5,
      color: C.muted,
      fit: "shrink",
    });
  }
  return slide;
}

function rounded(slide, x, y, w, h, fill = C.panel, border = C.border, radius = 0.1) {
  slide.addShape(S.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: radius,
    fill: { color: fill },
    line: { color: border, width: 1 },
  });
}

function text(slide, value, x, y, w, h, size = 14, color = C.ink, bold = false, options = {}) {
  slide.addText(value, {
    x,
    y,
    w,
    h,
    margin: 0,
    fontFace: "DejaVu Sans",
    fontSize: size,
    color,
    bold,
    valign: "mid",
    fit: "shrink",
    breakLine: false,
    ...options,
  });
}

function pill(slide, value, x, y, w, color = C.cyan) {
  slide.addShape(S.roundRect, {
    x,
    y,
    w,
    h: 0.3,
    rectRadius: 0.15,
    fill: { color, transparency: 82 },
    line: { color, transparency: 45, width: 0.8 },
  });
  text(slide, value, x, y + 0.01, w, 0.27, 9, color, true, { align: "center" });
}

function bulletList(slide, items, x, y, w, lineH = 0.42, size = 12, dotColor = C.cyan) {
  items.forEach((item, index) => {
    const yy = y + index * lineH;
    slide.addShape(S.ellipse, {
      x,
      y: yy + 0.12,
      w: 0.08,
      h: 0.08,
      fill: { color: item.color || dotColor },
      line: { color: item.color || dotColor },
    });
    text(
      slide,
      typeof item === "string" ? item : item.text,
      x + 0.18,
      yy,
      w - 0.18,
      lineH - 0.02,
      size,
      typeof item === "string" ? C.muted : item.textColor || C.muted,
      typeof item === "string" ? false : !!item.bold
    );
  });
}

function metric(slide, value, label, x, y, w, color) {
  rounded(slide, x, y, w, 1.0, C.panel2);
  text(slide, value, x + 0.18, y + 0.13, w - 0.36, 0.42, 23, color, true);
  text(slide, label, x + 0.18, y + 0.59, w - 0.36, 0.22, 9.5, C.muted, true, {
    charSpacing: 0.5,
  });
}

function connector(slide, x1, y1, x2, y2, color = C.border, width = 1.5, dash = "solid") {
  slide.addShape(S.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width, dashType: dash, beginArrowType: "none", endArrowType: "triangle" },
  });
}

// Slide 1 — title
{
  const slide = pptx.addSlide("ECHO");
  slide.background = { color: C.bg };
  slide.addShape(S.ellipse, {
    x: 8.8,
    y: -1.3,
    w: 5.7,
    h: 5.7,
    fill: { color: C.cyan, transparency: 92 },
    line: { color: C.cyan, transparency: 100 },
  });
  slide.addShape(S.ellipse, {
    x: 9.8,
    y: 3.8,
    w: 4.1,
    h: 4.1,
    fill: { color: C.violet, transparency: 93 },
    line: { color: C.violet, transparency: 100 },
  });
  slide.addImage({ path: LOGO, x: 0.65, y: 0.55, w: 0.62, h: 0.62 });
  text(slide, "ECHO", 1.4, 0.67, 1.2, 0.25, 14, C.ink, true, { charSpacing: 1.6 });
  pill(slide, "DISCOVERY SUMMARY", 0.65, 1.55, 1.75, C.cyan);
  text(slide, "Merge two users.", 0.65, 2.12, 8.2, 0.65, 33, C.ink, true);
  text(slide, "Keep the new identity.", 0.65, 2.82, 8.8, 0.65, 33, C.cyan, true);
  text(
    slide,
    "What Echo stores today—and what a safe migration must reconcile.",
    0.68,
    3.75,
    7.8,
    0.48,
    16,
    C.muted
  );

  rounded(slide, 9.15, 1.65, 3.35, 3.9, C.panel2);
  pill(slide, "OLD USER", 9.53, 2.05, 1.05, C.red);
  pill(slide, "NEW USER", 11.1, 2.05, 1.05, C.green);
  text(slide, "Messages", 9.45, 2.72, 1.5, 0.3, 12, C.muted, true);
  text(slide, "Identity", 11.02, 2.72, 1.2, 0.3, 12, C.muted, true);
  text(slide, "Activity", 9.45, 3.2, 1.5, 0.3, 12, C.muted, true);
  text(slide, "Login", 11.02, 3.2, 1.2, 0.3, 12, C.muted, true);
  text(slide, "DM history", 9.45, 3.68, 1.5, 0.3, 12, C.muted, true);
  text(slide, "Profile", 11.02, 3.68, 1.2, 0.3, 12, C.muted, true);
  connector(slide, 10.35, 4.48, 11.38, 4.48, C.cyan, 2);
  text(slide, "transfer history", 9.72, 4.75, 2.4, 0.28, 11, C.cyan, true, { align: "center" });
  text(slide, "Old user is deleted only after verification.", 0.68, 5.65, 7.4, 0.35, 13, C.amber, true);
}

// Slide 2 — storage map
{
  const slide = slideBase(
    "1 · Current state",
    "Identity is spread across MongoDB; files are only referenced by key",
    "The merge touches every persisted relationship—not just message authorship."
  );

  rounded(slide, 0.58, 1.72, 8.05, 4.95);
  text(slide, "MongoDB", 0.9, 1.98, 2.1, 0.35, 18, C.blue, true);
  const rows = [
    ["users", "saved messages · VIPs · auth state"],
    ["channels", "members · managers · creator · hidden DMs"],
    ["messages", "author · mentions · reactions · pins · forwards"],
    ["reads", "channel + thread read cursors"],
    ["activityevents", "recipient · actor · message"],
    ["scheduledmessages", "future messages + attachments"],
    ["webhooks / emojis", "ownership via createdBy"],
  ];
  rows.forEach(([name, detail], i) => {
    const yy = 2.48 + i * 0.53;
    slide.addShape(S.roundRect, {
      x: 0.9,
      y: yy,
      w: 1.68,
      h: 0.34,
      rectRadius: 0.08,
      fill: { color: C.blue, transparency: 86 },
      line: { color: C.blue, transparency: 55 },
    });
    text(slide, name, 1.02, yy + 0.02, 1.45, 0.29, 10, C.blue, true);
    text(slide, detail, 2.82, yy, 5.4, 0.34, 11.5, C.muted);
  });

  rounded(slide, 8.9, 1.72, 3.85, 4.95);
  text(slide, "MinIO", 9.22, 1.98, 1.8, 0.35, 18, C.amber, true);
  text(slide, "Random UUID object keys", 9.22, 2.5, 3.0, 0.3, 13, C.ink, true);
  bulletList(
    slide,
    [
      "category=attachment",
      "category=avatar",
      "category=emoji",
      "No uploader or owner ID",
      "No database reference record",
    ],
    9.24,
    2.92,
    3.1,
    0.49,
    11.5,
    C.amber
  );
  rounded(slide, 9.18, 5.55, 3.25, 0.72, "211C21", C.amber);
  text(slide, "Good news", 9.4, 5.69, 1.0, 0.2, 10, C.amber, true);
  text(slide, "Files do not need to move.", 10.38, 5.66, 1.8, 0.25, 10.5, C.ink, true);
  text(slide, "Mongo references keep attachment URLs intact.", 9.4, 5.94, 2.8, 0.2, 8.8, C.muted);
}

// Slide 3 — reference graph
{
  const slide = slideBase(
    "2 · Blast radius",
    "One user ID participates in many different behaviors",
    "Each arrow represents a separate migration rule and, in several cases, a collision policy."
  );
  const cx = 6.67;
  const cy = 3.93;
  slide.addShape(S.ellipse, {
    x: cx - 1.05,
    y: cy - 0.72,
    w: 2.1,
    h: 1.44,
    fill: { color: C.cyan, transparency: 78 },
    line: { color: C.cyan, width: 2 },
  });
  text(slide, "OLD USER ID", cx - 0.8, cy - 0.22, 1.6, 0.42, 17, C.ink, true, { align: "center" });

  const nodes = [
    { x: 0.72, y: 1.82, w: 2.7, h: 1.12, color: C.blue, title: "Messages", body: "author · mentions · pins · reactions" },
    { x: 0.72, y: 3.42, w: 2.7, h: 1.12, color: C.violet, title: "Activity", body: "recipient · actor · thread ownership" },
    { x: 0.72, y: 5.02, w: 2.7, h: 1.12, color: C.green, title: "Preferences", body: "saved · VIPs · dismissed items" },
    { x: 9.91, y: 1.82, w: 2.7, h: 1.12, color: C.amber, title: "Channels", body: "members · managers · creator" },
    { x: 9.91, y: 3.42, w: 2.7, h: 1.12, color: C.red, title: "Direct messages", body: "ID-derived names · duplicate histories" },
    { x: 9.91, y: 5.02, w: 2.7, h: 1.12, color: C.cyan, title: "Automation", body: "scheduled posts · webhook identity" },
  ];
  nodes.forEach((node) => {
    rounded(slide, node.x, node.y, node.w, node.h, C.panel2, node.color);
    pill(slide, node.title.toUpperCase(), node.x + 0.2, node.y + 0.16, 1.45, node.color);
    text(slide, node.body, node.x + 0.2, node.y + 0.57, node.w - 0.4, 0.35, 10.5, C.muted);
    const left = node.x < cx;
    connector(
      slide,
      left ? node.x + node.w : cx + 1.05,
      node.y + node.h / 2,
      left ? cx - 1.05 : node.x,
      cy,
      node.color,
      1.2
    );
  });
  pill(slide, "NEW USER KEEPS LOGIN + PROFILE", 5.12, 5.67, 3.1, C.green);
  text(slide, "Transfer history. Preserve the surviving identity.", 4.33, 6.15, 4.7, 0.3, 12, C.muted, true, {
    align: "center",
  });
}

// Slide 4 — DM collision
{
  const slide = slideBase(
    "3 · Hardest data problem",
    "Direct messages must be consolidated, not renamed",
    "DM channel names are derived from participant IDs, so two histories can collapse into one."
  );
  pill(slide, "BEFORE", 0.73, 1.76, 0.9, C.red);
  pill(slide, "AFTER", 8.18, 1.76, 0.9, C.green);

  rounded(slide, 0.7, 2.18, 5.45, 3.65);
  text(slide, "Old ↔ Alice", 1.05, 2.55, 1.8, 0.3, 14, C.ink, true);
  text(slide, "dm-OLD-ALICE", 1.05, 2.91, 2.2, 0.25, 10, C.red, true);
  text(slide, "12 messages", 3.76, 2.7, 1.5, 0.3, 12, C.muted, true);
  slide.addShape(S.line, { x: 1.08, y: 3.38, w: 4.65, h: 0, line: { color: C.border, width: 1 } });
  text(slide, "New ↔ Alice", 1.05, 3.72, 1.8, 0.3, 14, C.ink, true);
  text(slide, "dm-NEW-ALICE", 1.05, 4.08, 2.2, 0.25, 10, C.green, true);
  text(slide, "8 messages", 3.76, 3.87, 1.5, 0.3, 12, C.muted, true);
  slide.addShape(S.line, { x: 1.08, y: 4.55, w: 4.65, h: 0, line: { color: C.border, width: 1 } });
  text(slide, "Also collides:", 1.05, 4.85, 1.5, 0.25, 10, C.amber, true);
  text(slide, "old self-DM · old↔new DM · hidden state · read cursors", 2.35, 4.8, 3.25, 0.4, 10.5, C.muted);

  connector(slide, 6.36, 4.0, 7.55, 4.0, C.cyan, 2);
  text(slide, "map + merge", 6.38, 4.2, 1.1, 0.22, 9, C.cyan, true, { align: "center" });

  rounded(slide, 7.85, 2.18, 4.78, 3.65, C.panel2, C.green);
  text(slide, "Canonical: New ↔ Alice", 8.25, 2.55, 3.4, 0.35, 16, C.ink, true);
  text(slide, "dm-NEW-ALICE", 8.25, 2.98, 2.1, 0.25, 11, C.green, true);
  metric(slide, "20", "MESSAGES — ORIGINAL TIMESTAMPS", 8.25, 3.48, 1.65, C.cyan);
  metric(slide, "1", "CHANNEL", 10.1, 3.48, 1.15, C.green);
  metric(slide, "0", "DUPLICATES", 11.45, 3.48, 0.85, C.amber);
  bulletList(
    slide,
    ["Move all channel references", "Deduplicate reads and hidden state", "Delete redundant DM only at the end"],
    8.3,
    4.73,
    3.85,
    0.36,
    10.5,
    C.green
  );
  text(slide, "Unread trade-off: prefer false unread over silently hiding unread history.", 0.84, 6.2, 11.8, 0.32, 12, C.amber, true, {
    align: "center",
  });
}

// Slide 5 — denormalized identity
{
  const slide = slideBase(
    "4 · Historical identity",
    "Object IDs move cleanly; text and snapshots do not",
    "Visible attribution is partly normalized and partly copied into historical records."
  );
  const cards = [
    {
      x: 0.65,
      color: C.blue,
      tag: "MENTIONS",
      title: "@old.username",
      body: ["Body stores raw text", "Activity stores mentionedUserIds", "Deleting the user breaks mention resolution"],
    },
    {
      x: 4.56,
      color: C.violet,
      tag: "FORWARDS",
      title: "Name + avatar snapshot",
      body: ["No original author ID", "Some cards can resolve via messageId", "Deleted sources can be ambiguous"],
    },
    {
      x: 8.47,
      color: C.amber,
      tag: "AUTOMATION",
      title: "Keys include author",
      body: ["idempotencyKey is author-scoped", "externalKey is author-scoped", "Transfer can violate unique indexes"],
    },
  ];
  cards.forEach((card) => {
    rounded(slide, card.x, 1.82, 3.55, 2.65, C.panel2, card.color);
    pill(slide, card.tag, card.x + 0.25, 2.07, 1.15, card.color);
    text(slide, card.title, card.x + 0.25, 2.55, 3.0, 0.38, 17, C.ink, true);
    bulletList(slide, card.body, card.x + 0.28, 3.08, 2.98, 0.39, 10.5, card.color);
  });

  rounded(slide, 1.1, 4.83, 11.12, 1.25, "10282A", C.cyan);
  pill(slide, "RECOMMENDATION", 1.42, 5.08, 1.55, C.cyan);
  text(slide, "Keep a permanent UserAlias after deleting the old User", 3.18, 5.04, 5.55, 0.32, 15, C.ink, true);
  text(slide, "oldUserId + oldUsername → targetUserId", 3.18, 5.4, 4.5, 0.25, 11, C.cyan, true);
  text(
    slide,
    "Reserves the old username, resolves historical mentions, supports old profile links, and avoids rewriting code blocks or quoted history.",
    7.62,
    5.14,
    4.12,
    0.58,
    10.5,
    C.muted
  );
  text(slide, "Future forwards should also store forwardedFrom.authorId.", 2.38, 6.35, 8.55, 0.3, 12, C.violet, true, {
    align: "center",
  });
}

// Slide 6 — MinIO
{
  const slide = slideBase(
    "5 · File storage",
    "No file move is required—but ownership and cleanup are missing",
    "The local stack confirms that MinIO objects can outlive their Mongo references."
  );
  metric(slide, "227", "OBJECTS IN LOCAL MINIO", 0.68, 1.78, 2.25, C.cyan);
  metric(slide, "41 MiB", "TOTAL SIZE", 3.13, 1.78, 2.25, C.blue);
  metric(slide, "0", "CURRENT MONGO FILE REFERENCES", 5.58, 1.78, 2.55, C.red);

  rounded(slide, 0.68, 3.03, 7.45, 2.75);
  text(slide, "What migration can do today", 1.0, 3.32, 3.0, 0.34, 16, C.ink, true);
  bulletList(
    slide,
    [
      { text: "Keep message and scheduled attachment keys", color: C.green },
      { text: "Transfer custom emoji ownership in Mongo", color: C.green },
      { text: "Keep the new user’s avatar", color: C.green },
      { text: "Cannot identify old user’s unattached uploads", color: C.red },
      { text: "Cannot delete old avatar—no DeleteObject helper", color: C.red },
    ],
    1.02,
    3.78,
    6.7,
    0.38,
    11.2
  );

  rounded(slide, 8.43, 1.78, 4.2, 4.0, C.panel2, C.amber);
  pill(slide, "FOLLOW-UP", 8.75, 2.08, 1.12, C.amber);
  text(slide, "Add StoredFile metadata", 8.75, 2.57, 3.3, 0.38, 17, C.ink, true);
  text(slide, "{ key, uploadedBy, category, references }", 8.75, 3.02, 3.35, 0.3, 10.5, C.amber, true);
  bulletList(
    slide,
    [
      "Enables ownership transfer",
      "Makes orphan cleanup safe",
      "Supports reference-aware deletion",
      "Improves attachment authorization",
    ],
    8.77,
    3.53,
    3.3,
    0.43,
    11,
    C.amber
  );
  rounded(slide, 0.94, 6.06, 11.45, 0.54, "211C21", C.amber);
  text(
    slide,
    "Security note: file download currently checks authentication, not channel/message membership.",
    1.17,
    6.18,
    11.0,
    0.25,
    11.5,
    C.amber,
    true,
    { align: "center" }
  );
}

// Slide 7 — execution sequence
{
  const slide = slideBase(
    "6 · Safe implementation",
    "Treat migration as a verified, resumable identity operation",
    "The source account is locked first and deleted last."
  );
  const steps = [
    ["1", "Preview", "Counts, DM map, conflicts"],
    ["2", "Lock", "Revoke tokens, disconnect sockets"],
    ["3", "Map DMs", "Choose canonical channels"],
    ["4", "Resolve keys", "Prevent unique-index failures"],
    ["5", "Transfer", "Bulk-update all references"],
    ["6", "Reconcile", "Reads, activity, VIPs, saves"],
    ["7", "Verify", "Zero forbidden old-ID references"],
    ["8", "Delete", "Alias old identity, refresh clients"],
  ];
  steps.forEach(([n, title, detail], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 0.65 + col * 3.13;
    const y = 1.82 + row * 2.1;
    const color = [C.cyan, C.red, C.amber, C.violet, C.blue, C.green, C.cyan, C.green][i];
    rounded(slide, x, y, 2.78, 1.55, C.panel2, color);
    slide.addShape(S.ellipse, {
      x: x + 0.2,
      y: y + 0.2,
      w: 0.42,
      h: 0.42,
      fill: { color, transparency: 10 },
      line: { color },
    });
    text(slide, n, x + 0.2, y + 0.21, 0.42, 0.37, 12, C.bg, true, { align: "center" });
    text(slide, title, x + 0.77, y + 0.2, 1.7, 0.38, 14, C.ink, true);
    text(slide, detail, x + 0.22, y + 0.75, 2.34, 0.5, 10.5, C.muted);
    if (col < 3) connector(slide, x + 2.82, y + 0.77, x + 3.05, y + 0.77, color, 1);
  });
  rounded(slide, 1.05, 6.15, 11.2, 0.5, "10282A", C.cyan);
  text(
    slide,
    "Recommended engine: UserMergeOperation + idempotent bulk phases. One giant transaction will not scale safely to millions of messages.",
    1.3,
    6.25,
    10.7,
    0.25,
    10.8,
    C.cyan,
    true,
    { align: "center" }
  );
}

// Slide 8 — decision summary
{
  const slide = slideBase(
    "7 · Recommendation",
    "Build the feature around explicit policies—not silent assumptions",
    "The data can be migrated safely once these ownership and collision rules are fixed."
  );
  rounded(slide, 0.65, 1.8, 5.85, 4.62);
  pill(slide, "NEW USER WINS", 0.98, 2.1, 1.4, C.green);
  bulletList(
    slide,
    [
      "Login credentials and RHSSO identity",
      "Username, display name and avatar",
      "Admin and password-reset state",
      "Existing profile and API identity",
    ],
    1.02,
    2.68,
    4.95,
    0.5,
    12,
    C.green
  );
  pill(slide, "MERGE", 0.98, 4.75, 0.8, C.blue);
  text(slide, "messages · channels · DMs · reads · activity · saves · VIPs · scheduled posts · emoji ownership", 1.02, 5.2, 4.9, 0.72, 12, C.muted, true);

  rounded(slide, 6.8, 1.8, 5.85, 4.62, C.panel2);
  pill(slide, "REVOKE / SPECIAL CASE", 7.13, 2.1, 1.95, C.amber);
  bulletList(
    slide,
    [
      { text: "Old API tokens — invalid after deletion", color: C.red },
      { text: "Old webhooks — rotate or revoke", color: C.red },
      { text: "Pending password-help actions — cancel", color: C.red },
      { text: "Admin or system account merges — block initially", color: C.red },
      { text: "Unresolvable forward snapshots — report", color: C.amber },
    ],
    7.17,
    2.69,
    4.95,
    0.5,
    11.5
  );

  text(slide, "Bottom line", 0.72, 6.67, 1.15, 0.26, 10, C.cyan, true, { charSpacing: 0.8 });
  text(
    slide,
    "Feasible, but this is an identity migration service—not a single database update.",
    1.9,
    6.58,
    10.4,
    0.42,
    17,
    C.ink,
    true
  );
}

await pptx.writeFile({ fileName: OUTPUT });
console.log(OUTPUT);
