import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUTPUT = "/home/ariel/Echo_User_Alias_Mapping_Architecture.pptx";
const LOGO = path.join(ROOT, "client", "src", "assets", "echo-logo.png");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Echo";
pptx.company = "Echo";
pptx.subject = "User alias mapping architecture";
pptx.title = "Echo User Alias Mapping Architecture";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "DejaVu Sans",
  bodyFontFace: "DejaVu Sans",
  lang: "en-US",
};

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
};
const S = pptx.ShapeType;

pptx.defineSlideMaster({
  title: "ECHO_ALIAS",
  background: { color: C.bg },
  objects: [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.08,
        fill: { color: C.violet },
        line: { color: C.violet },
      },
    },
    {
      text: {
        text: "ECHO  •  IDENTITY MAPPING",
        options: {
          x: 0.55,
          y: 7.12,
          w: 4.2,
          h: 0.18,
          margin: 0,
          fontFace: "DejaVu Sans",
          fontSize: 8,
          bold: true,
          color: C.dim,
          charSpacing: 1.3,
        },
      },
    },
  ],
  slideNumber: {
    x: 12.32,
    y: 7.08,
    w: 0.4,
    h: 0.2,
    margin: 0,
    fontFace: "DejaVu Sans",
    fontSize: 9,
    color: C.dim,
    align: "right",
  },
});

function text(slide, value, x, y, w, h, size = 13, color = C.ink, bold = false, extra = {}) {
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
    ...extra,
  });
}

function panel(slide, x, y, w, h, fill = C.panel, border = C.border) {
  slide.addShape(S.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.1,
    fill: { color: fill },
    line: { color: border, width: 1 },
  });
}

function pill(slide, value, x, y, w, color) {
  slide.addShape(S.roundRect, {
    x,
    y,
    w,
    h: 0.3,
    rectRadius: 0.15,
    fill: { color, transparency: 82 },
    line: { color, transparency: 45, width: 0.8 },
  });
  text(slide, value, x, y + 0.01, w, 0.27, 9, color, true, {
    align: "center",
    charSpacing: 0.4,
  });
}

function bulletList(slide, items, x, y, w, lineH = 0.43, size = 11.5, defaultColor = C.cyan) {
  items.forEach((entry, index) => {
    const item = typeof entry === "string" ? { text: entry } : entry;
    const yy = y + index * lineH;
    const color = item.color || defaultColor;
    slide.addShape(S.ellipse, {
      x,
      y: yy + 0.12,
      w: 0.08,
      h: 0.08,
      fill: { color },
      line: { color },
    });
    text(slide, item.text, x + 0.18, yy, w - 0.18, lineH - 0.02, size, item.textColor || C.muted, !!item.bold);
  });
}

function titleSlide(section, title, subtitle) {
  const slide = pptx.addSlide("ECHO_ALIAS");
  text(slide, section.toUpperCase(), 0.58, 0.35, 3.1, 0.22, 10, C.violet, true, { charSpacing: 1.5 });
  text(slide, title, 0.58, 0.64, 12.05, 0.48, 25, C.ink, true);
  if (subtitle) text(slide, subtitle, 0.58, 1.15, 11.9, 0.33, 11.5, C.muted);
  return slide;
}

function arrow(slide, x1, y1, x2, y2, color = C.cyan, width = 1.7, dashType = "solid") {
  slide.addShape(S.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: {
      color,
      width,
      dashType,
      beginArrowType: "none",
      endArrowType: "triangle",
    },
  });
}

function identityCard(slide, x, y, w, label, id, username, color, faded = false) {
  panel(slide, x, y, w, 1.65, C.panel2, color);
  pill(slide, label, x + 0.22, y + 0.2, 1.1, color);
  text(slide, username, x + 0.22, y + 0.65, w - 0.44, 0.32, 16, faded ? C.muted : C.ink, true);
  text(slide, id, x + 0.22, y + 1.07, w - 0.44, 0.26, 10, color, true);
}

function metric(slide, value, label, x, y, w, color) {
  panel(slide, x, y, w, 0.96, C.panel2, C.border);
  text(slide, value, x + 0.16, y + 0.11, w - 0.32, 0.38, 22, color, true);
  text(slide, label, x + 0.16, y + 0.56, w - 0.32, 0.2, 8.8, C.muted, true, { charSpacing: 0.4 });
}

// Slide 1
{
  const slide = pptx.addSlide("ECHO_ALIAS");
  slide.addShape(S.ellipse, {
    x: 8.8,
    y: -1.3,
    w: 5.7,
    h: 5.7,
    fill: { color: C.violet, transparency: 92 },
    line: { color: C.violet, transparency: 100 },
  });
  slide.addShape(S.ellipse, {
    x: 9.85,
    y: 3.8,
    w: 4.2,
    h: 4.2,
    fill: { color: C.cyan, transparency: 93 },
    line: { color: C.cyan, transparency: 100 },
  });
  slide.addImage({ path: LOGO, x: 0.65, y: 0.55, w: 0.62, h: 0.62 });
  text(slide, "ECHO", 1.4, 0.67, 1.2, 0.25, 14, C.ink, true, { charSpacing: 1.6 });
  pill(slide, "ARCHITECTURE IDEA", 0.65, 1.55, 1.7, C.violet);
  text(slide, "Keep a map from", 0.65, 2.12, 7.8, 0.62, 32, C.ink, true);
  text(slide, "old identity → new identity", 0.65, 2.8, 8.7, 0.65, 32, C.violet, true);
  text(
    slide,
    "Display the surviving user immediately. Migrate physical data safely in the background.",
    0.68,
    3.76,
    7.75,
    0.58,
    15,
    C.muted
  );

  identityCard(slide, 9.12, 1.65, 3.25, "OLD", "@old.username", "sourceUserId", C.red, true);
  arrow(slide, 10.74, 3.55, 10.74, 4.35, C.violet, 2.2);
  panel(slide, 9.12, 4.5, 3.25, 0.72, "201A2B", C.violet);
  text(slide, "UserAlias", 9.35, 4.65, 1.1, 0.25, 13, C.violet, true);
  text(slide, "source → target", 10.47, 4.65, 1.55, 0.25, 11, C.ink, true);
  arrow(slide, 10.74, 5.4, 10.74, 5.87, C.cyan, 2.2);
  pill(slide, "SURVIVING NEW USER", 9.4, 6.0, 2.7, C.green);
  text(slide, "Old User deleted. Alias retained.", 0.68, 5.85, 7.25, 0.35, 13, C.amber, true);
}

// Slide 2
{
  const slide = titleSlide(
    "1 · Core model",
    "A small permanent alias becomes the compatibility layer",
    "The old User document can be deleted while its ID and username remain safely resolvable."
  );

  panel(slide, 0.68, 1.82, 4.15, 4.55);
  pill(slide, "USER ALIAS", 1.0, 2.12, 1.25, C.violet);
  const schema = [
    ["sourceUserId", "deleted old user ID"],
    ["sourceUsername", "reserved old handle"],
    ["targetUserId", "surviving user ID"],
    ["mergedAt", "audit timestamp"],
    ["mergedBy", "admin / operation"],
  ];
  schema.forEach(([field, description], index) => {
    const yy = 2.72 + index * 0.61;
    panel(slide, 1.0, yy, 1.62, 0.36, "17243A", C.violet);
    text(slide, field, 1.12, yy + 0.03, 1.38, 0.29, 10.5, C.violet, true);
    text(slide, description, 2.88, yy, 1.54, 0.36, 10.5, C.muted);
  });

  identityCard(slide, 5.4, 2.15, 2.38, "SOURCE", "sourceUserId", "@old.username", C.red, true);
  panel(slide, 8.19, 2.15, 1.62, 1.65, "201A2B", C.violet);
  text(slide, "Alias", 8.44, 2.52, 1.1, 0.32, 16, C.violet, true, { align: "center" });
  text(slide, "permanent", 8.44, 2.99, 1.1, 0.24, 10, C.muted, true, { align: "center" });
  identityCard(slide, 10.22, 2.15, 2.38, "TARGET", "targetUserId", "@new.username", C.green);
  arrow(slide, 7.8, 2.98, 8.15, 2.98, C.violet);
  arrow(slide, 9.84, 2.98, 10.18, 2.98, C.cyan);

  panel(slide, 5.4, 4.28, 7.2, 1.56, C.panel2, C.cyan);
  pill(slide, "CHAIN RULE", 5.72, 4.56, 1.15, C.cyan);
  text(slide, "A → B and B → C must flatten to A → C", 7.05, 4.51, 4.9, 0.34, 16, C.ink, true);
  bulletList(
    slide,
    ["Reject cycles", "Unique source ID and source username", "Resolve to one canonical user"],
    5.76,
    5.04,
    6.35,
    0.32,
    9.8,
    C.cyan
  );
  text(slide, "Registration and RHSSO allocation must also treat alias usernames as reserved.", 5.72, 6.1, 6.35, 0.28, 11.2, C.amber, true, {
    align: "center",
  });
}

// Slide 3
{
  const slide = titleSlide(
    "2 · Security boundary",
    "Resolve history through aliases—but never resolve authentication",
    "The alias represents historical identity, not permission to become the target account."
  );
  panel(slide, 0.67, 1.83, 5.92, 4.65, C.panel, C.green);
  pill(slide, "ALIAS-AWARE", 0.99, 2.12, 1.38, C.green);
  text(slide, "Read & display paths", 0.99, 2.58, 3.4, 0.35, 18, C.ink, true);
  bulletList(
    slide,
    [
      "Message author hydration",
      "Historical @mention resolution",
      "Profile-link redirects",
      "Search from:@old.username",
      "Forwarded attribution with authorId",
    ],
    1.02,
    3.12,
    4.92,
    0.5,
    12,
    C.green
  );

  panel(slide, 6.83, 1.83, 5.82, 4.65, C.panel2, C.red);
  pill(slide, "STRICT USER LOOKUP", 7.15, 2.12, 1.78, C.red);
  text(slide, "Authentication & authorization", 7.15, 2.58, 4.5, 0.35, 18, C.ink, true);
  bulletList(
    slide,
    [
      { text: "JWT subject must find a live User", color: C.red },
      { text: "Old API tokens become invalid", color: C.red },
      { text: "Old sockets are disconnected", color: C.red },
      { text: "Old webhooks are rotated or revoked", color: C.red },
      { text: "Aliases never grant channel access", color: C.red },
    ],
    7.18,
    3.12,
    4.85,
    0.5,
    12
  );
  text(slide, "Rule of thumb", 4.82, 6.69, 1.15, 0.22, 9.5, C.violet, true, { align: "center" });
  text(slide, "Aliases answer “who should this history display as?”—not “who may act?”", 2.48, 6.38, 8.4, 0.35, 14, C.ink, true, {
    align: "center",
  });
}

// Slide 4
{
  const slide = titleSlide(
    "3 · Immediate value",
    "The mapping layer removes the need for a perfect one-shot rewrite",
    "Users see the canonical identity while structural collections migrate in verified batches."
  );
  const cards = [
    {
      x: 0.67,
      color: C.blue,
      tag: "MESSAGES",
      title: "Historical authors",
      body: ["Old author IDs can hydrate as new", "No broken avatars or profiles", "Rewrite can happen later"],
    },
    {
      x: 4.55,
      color: C.violet,
      tag: "MENTIONS",
      title: "Old usernames",
      body: ["Remain clickable", "Cannot be reclaimed", "Search resolves old and new handles"],
    },
    {
      x: 8.43,
      color: C.green,
      tag: "RECOVERY",
      title: "Resumable migration",
      body: ["Alias created first", "Batches become idempotent", "A failed batch can safely resume"],
    },
  ];
  cards.forEach((card) => {
    panel(slide, card.x, 1.85, 3.58, 2.75, C.panel2, card.color);
    pill(slide, card.tag, card.x + 0.25, 2.13, 1.12, card.color);
    text(slide, card.title, card.x + 0.25, 2.61, 3.0, 0.36, 17, C.ink, true);
    bulletList(slide, card.body, card.x + 0.28, 3.15, 2.96, 0.44, 10.8, card.color);
  });
  panel(slide, 1.25, 5.02, 10.83, 1.08, "201A2B", C.violet);
  text(slide, "Before", 1.6, 5.27, 0.75, 0.24, 10, C.red, true);
  text(slide, "Rewrite everything correctly → then delete old user", 2.28, 5.2, 3.8, 0.35, 12, C.muted, true);
  arrow(slide, 6.24, 5.46, 6.87, 5.46, C.violet, 2);
  text(slide, "With alias", 7.06, 5.27, 1.05, 0.24, 10, C.green, true);
  text(slide, "Map immediately → migrate safely → retain compatibility", 8.04, 5.2, 3.55, 0.35, 12, C.ink, true);
  text(slide, "Result: lower cut-over risk and a clear recovery path.", 2.9, 6.45, 7.55, 0.3, 13, C.cyan, true, {
    align: "center",
  });
}

// Slide 5
{
  const slide = titleSlide(
    "4 · Hybrid migration",
    "Map historical identity; eagerly migrate permission-critical state",
    "Not every reference should remain virtualized forever."
  );

  panel(slide, 0.67, 1.82, 3.83, 4.68, C.panel, C.red);
  pill(slide, "EAGER MIGRATION", 0.98, 2.12, 1.55, C.red);
  text(slide, "Must become physical", 0.98, 2.57, 2.65, 0.33, 16, C.ink, true);
  bulletList(
    slide,
    [
      "DM consolidation",
      "Channel membership + ownership",
      "Read cursors",
      "Activity events",
      "Reaction arrays",
      "Saved messages + VIPs",
      "Scheduled messages",
      "Webhook disposition",
    ],
    1.02,
    3.06,
    2.92,
    0.4,
    10.8,
    C.red
  );

  panel(slide, 4.75, 1.82, 3.83, 4.68, C.panel2, C.violet);
  pill(slide, "ALIAS RESOLUTION", 5.06, 2.12, 1.6, C.violet);
  text(slide, "Permanent compatibility", 5.06, 2.57, 2.9, 0.33, 16, C.ink, true);
  bulletList(
    slide,
    [
      "Old username",
      "Old profile ID",
      "Historical mention links",
      "Search by old handle",
      "Deep links and external references",
    ],
    5.1,
    3.06,
    2.92,
    0.48,
    11.2,
    C.violet
  );

  panel(slide, 8.83, 1.82, 3.83, 4.68, C.panel, C.blue);
  pill(slide, "BACKGROUND REWRITE", 9.14, 2.12, 1.78, C.blue);
  text(slide, "Optional optimization", 9.14, 2.57, 2.8, 0.33, 16, C.ink, true);
  bulletList(
    slide,
    [
      "Message.author",
      "mentionedUserIds",
      "threadRootAuthor",
      "pinnedBy",
      "Emoji ownership",
      "Resolvable forward snapshots",
    ],
    9.18,
    3.06,
    2.92,
    0.46,
    11.2,
    C.blue
  );
  text(slide, "Aliases stay after the rewrite to reserve old identity and protect links.", 2.25, 6.72, 8.8, 0.3, 12.5, C.amber, true, {
    align: "center",
  });
}

// Slide 6
{
  const slide = titleSlide(
    "5 · Remaining hard cases",
    "Mapping reduces migration risk—it does not eliminate data reconciliation",
    "These conflicts still require explicit rules and physical updates."
  );
  const issues = [
    ["DMs", "Two histories can map to one participant pair", C.red],
    ["Reads", "One timestamp cannot perfectly represent merged timelines", C.amber],
    ["Reactions", "Old + new may become duplicate reactors", C.violet],
    ["Automation", "Author-scoped keys can violate unique indexes", C.blue],
    ["Forwards", "Old snapshots may lack a source author ID", C.violet],
    ["Webhooks", "Old secret holders must not inherit new permissions", C.red],
  ];
  issues.forEach(([name, detail, color], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 0.68 + col * 6.15;
    const y = 1.82 + row * 1.48;
    panel(slide, x, y, 5.82, 1.12, C.panel2, color);
    pill(slide, name.toUpperCase(), x + 0.22, y + 0.19, 1.1, color);
    text(slide, detail, x + 1.5, y + 0.2, 3.95, 0.53, 11.5, C.muted, true);
  });
  panel(slide, 1.45, 6.32, 10.42, 0.54, "211C21", C.amber);
  text(
    slide,
    "The alias buys time and compatibility. Structural truth still belongs in canonical Mongo records.",
    1.72,
    6.43,
    9.88,
    0.25,
    11.5,
    C.amber,
    true,
    { align: "center" }
  );
}

// Slide 7
{
  const slide = titleSlide(
    "6 · Recommended lifecycle",
    "Create the alias early, delete the old user late",
    "Every phase is explicit, testable, and safe to retry."
  );
  const steps = [
    ["1", "Preview", "DM map + collisions", C.blue],
    ["2", "Lock source", "Revoke + disconnect", C.red],
    ["3", "Create alias", "Display resolves now", C.violet],
    ["4", "Eager migrate", "Permissions + DMs", C.amber],
    ["5", "Verify", "No unsafe old refs", C.cyan],
    ["6", "Delete old User", "Keep alias forever", C.green],
  ];
  steps.forEach(([n, title, detail, color], index) => {
    const x = 0.52 + index * 2.13;
    panel(slide, x, 2.15, 1.78, 2.16, C.panel2, color);
    slide.addShape(S.ellipse, {
      x: x + 0.64,
      y: 2.42,
      w: 0.5,
      h: 0.5,
      fill: { color },
      line: { color },
    });
    text(slide, n, x + 0.64, 2.49, 0.5, 0.31, 13, C.bg, true, { align: "center" });
    text(slide, title, x + 0.16, 3.14, 1.46, 0.31, 13, C.ink, true, { align: "center" });
    text(slide, detail, x + 0.16, 3.57, 1.46, 0.36, 9.5, C.muted, true, { align: "center" });
    if (index < steps.length - 1) arrow(slide, x + 1.82, 3.2, x + 2.06, 3.2, color, 1);
  });

  metric(slide, "YES", "RECOMMENDED FOUNDATION", 1.2, 5.02, 2.6, C.green);
  panel(slide, 4.08, 5.02, 7.98, 0.96, "10282A", C.cyan);
  text(slide, "Why it is worth it", 4.36, 5.18, 1.65, 0.26, 10.5, C.cyan, true);
  text(
    slide,
    "Immediate canonical display · safer retries · preserved history · reserved usernames · backward-compatible links",
    6.03,
    5.13,
    5.68,
    0.38,
    11,
    C.ink,
    true
  );
  text(
    slide,
    "Use aliases for identity continuity. Keep authentication strict. Reconcile authorization physically.",
    1.55,
    6.48,
    10.25,
    0.34,
    15,
    C.violet,
    true,
    { align: "center" }
  );
}

await pptx.writeFile({ fileName: OUTPUT });
console.log(OUTPUT);
