import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUTPUT = "/home/ariel/Echo_Local_User_Identity_Migration.pptx";
const LOGO = path.join(ROOT, "client", "src", "assets", "echo-logo.png");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Echo";
pptx.company = "Echo";
pptx.subject = "Local-user identity migration with local and RHSSO targets";
pptx.title = "Echo Local User Identity Migration";
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
  title: "ECHO_MIGRATION",
  background: { color: C.bg },
  objects: [
    {
      rect: {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.08,
        fill: { color: C.cyan },
        line: { color: C.cyan },
      },
    },
    {
      text: {
        text: "ECHO  •  IDENTITY MIGRATION",
        options: {
          x: 0.55,
          y: 7.12,
          w: 4,
          h: 0.18,
          margin: 0,
          fontFace: "DejaVu Sans",
          fontSize: 8,
          bold: true,
          color: C.dim,
          charSpacing: 1.1,
        },
      },
    },
  ],
  slideNumber: {
    x: 12.3,
    y: 7.08,
    w: 0.42,
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
  text(slide, value, x, y + 0.01, w, 0.27, 8.6, color, true, {
    align: "center",
    charSpacing: 0.25,
  });
}

function heading(slide, kicker, titleValue, subtitle = "") {
  text(slide, kicker.toUpperCase(), 0.58, 0.34, 4.4, 0.22, 9.5, C.cyan, true, { charSpacing: 1.25 });
  text(slide, titleValue, 0.58, 0.65, 12.05, 0.5, 25, C.ink, true);
  if (subtitle) text(slide, subtitle, 0.58, 1.17, 12, 0.34, 11.2, C.muted);
}

function bulletList(slide, items, x, y, w, lineH = 0.47, size = 11.2) {
  items.forEach((entry, index) => {
    const item = typeof entry === "string" ? { text: entry } : entry;
    const yy = y + index * lineH;
    slide.addShape(S.ellipse, {
      x,
      y: yy + 0.13,
      w: 0.08,
      h: 0.08,
      fill: { color: item.color || C.cyan },
      line: { color: item.color || C.cyan },
    });
    text(slide, item.text, x + 0.18, yy, w - 0.18, lineH - 0.02, size, item.textColor || C.muted, !!item.bold);
  });
}

function arrow(slide, x1, y1, x2, y2, color = C.cyan, width = 1.8) {
  slide.addShape(S.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width, beginArrowType: "none", endArrowType: "triangle" },
  });
}

function flowCard(slide, x, y, w, n, titleValue, detail, color = C.cyan) {
  panel(slide, x, y, w, 1.18, C.panel2, color);
  slide.addShape(S.ellipse, {
    x: x + 0.16,
    y: y + 0.16,
    w: 0.36,
    h: 0.36,
    fill: { color },
    line: { color },
  });
  text(slide, String(n), x + 0.16, y + 0.18, 0.36, 0.28, 10.2, C.bg, true, { align: "center" });
  text(slide, titleValue, x + 0.64, y + 0.13, w - 0.8, 0.36, 12.2, C.ink, true);
  text(slide, detail, x + 0.16, y + 0.62, w - 0.32, 0.36, 9.5, C.muted);
}

function fieldRow(slide, label, before, after, x, y, color, note = "") {
  text(slide, label, x, y, 1.45, 0.3, 10.2, C.muted, true);
  text(slide, before, x + 1.55, y, 2.45, 0.3, 10.5, C.ink, true);
  arrow(slide, x + 4.08, y + 0.15, x + 4.62, y + 0.15, color, 1.4);
  text(slide, after, x + 4.8, y, 2.85, 0.3, 10.5, color, true);
  if (note) text(slide, note, x + 7.72, y, 2.55, 0.3, 9, C.dim);
}

function compactFieldRow(slide, label, before, after, x, y, color, note = "") {
  text(slide, label, x, y, 1.02, 0.3, 9.5, C.muted, true);
  text(slide, before, x + 1.08, y, 1.2, 0.3, 9.8, C.ink, true);
  arrow(slide, x + 2.34, y + 0.15, x + 2.68, y + 0.15, color, 1.3);
  text(slide, after, x + 2.78, y, 1.42, 0.3, 9.8, color, true);
  if (note) text(slide, note, x + 4.22, y, 0.55, 0.3, 8, C.dim, false, { align: "right" });
}

// 1 — Title
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  slide.addShape(S.ellipse, {
    x: 8.7,
    y: -1.3,
    w: 5.8,
    h: 5.8,
    fill: { color: C.cyan, transparency: 92 },
    line: { color: C.cyan, transparency: 100 },
  });
  slide.addShape(S.ellipse, {
    x: 9.7,
    y: 3.75,
    w: 4.2,
    h: 4.2,
    fill: { color: C.violet, transparency: 93 },
    line: { color: C.violet, transparency: 100 },
  });
  slide.addImage({ path: LOGO, x: 0.65, y: 0.55, w: 0.62, h: 0.62 });
  text(slide, "ECHO", 1.4, 0.67, 1.2, 0.25, 14, C.ink, true, { charSpacing: 1.6 });
  pill(slide, "REFINED DESIGN", 0.65, 1.55, 1.48, C.cyan);
  text(slide, "Replace the login.", 0.65, 2.12, 8.6, 0.64, 32, C.ink, true);
  text(slide, "Keep the person.", 0.65, 2.8, 8.8, 0.64, 32, C.cyan, true);
  text(
    slide,
    "Migrate a locally created Echo account into a new local or RHSSO identity—while retaining its display name, profile, and complete history.",
    0.68,
    3.72,
    7.75,
    0.76,
    14,
    C.muted
  );
  panel(slide, 8.85, 2.02, 3.55, 3.1, C.panel2, C.border);
  text(slide, "OLD PROFILE", 9.15, 2.33, 1.55, 0.22, 9, C.dim, true, { charSpacing: 1 });
  text(slide, "Ariel Cohen", 9.15, 2.68, 2.8, 0.34, 18, C.ink, true);
  text(slide, "@ariel.old", 9.15, 3.05, 2.4, 0.28, 11, C.red, true);
  arrow(slide, 9.2, 3.68, 11.95, 3.68, C.cyan, 2.3);
  text(slide, "SAME PROFILE", 9.15, 4.02, 1.8, 0.22, 9, C.dim, true, { charSpacing: 1 });
  text(slide, "Ariel Cohen", 9.15, 4.35, 2.8, 0.34, 18, C.ink, true);
  text(slide, "@ariel.new", 9.15, 4.72, 2.4, 0.28, 11, C.green, true);
  text(slide, "Local source only  •  One-time  •  Explicit confirmation", 0.68, 6.43, 8.5, 0.25, 10, C.dim, true);
}

// 2 — Product rule
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "The product rule", "A narrow migration with clear boundaries");
  panel(slide, 0.6, 1.78, 7.5, 4.65, C.panel2, C.cyan);
  text(slide, "A locally created user may replace their username and login method once.", 0.95, 2.18, 6.8, 0.68, 23, C.ink, true);
  text(slide, "Their Echo identity and profile remain intact.", 0.95, 3.0, 6.5, 0.42, 16, C.cyan, true);
  bulletList(
    slide,
    [
      { text: "Source: an existing non-SSO user", color: C.green },
      { text: "Target: a new local identity or unused RHSSO identity", color: C.blue },
      { text: "New username becomes canonical", color: C.cyan },
      { text: "Old display name, avatar, and history are preserved", color: C.violet },
    ],
    1,
    3.72,
    6.65,
    0.49,
    11.5
  );
  panel(slide, 8.45, 1.78, 4.27, 2.05, C.panel, C.green);
  pill(slide, "ALLOWED", 8.78, 2.08, 0.92, C.green);
  text(slide, "Local → Local", 8.78, 2.62, 3.2, 0.34, 17, C.ink, true);
  text(slide, "Local → RHSSO", 8.78, 3.04, 3.2, 0.34, 17, C.ink, true);
  panel(slide, 8.45, 4.08, 4.27, 2.35, C.panel, C.red);
  pill(slide, "NOT ALLOWED", 8.78, 4.38, 1.18, C.red);
  text(slide, "RHSSO → anything", 8.78, 4.92, 3.3, 0.3, 14, C.ink, true);
  text(slide, "Existing Echo user → existing Echo user", 8.78, 5.35, 3.3, 0.52, 12.2, C.ink, true);
  text(slide, "No two-user merge. No admin/system migration.", 8.78, 5.98, 3.35, 0.24, 9.5, C.muted);
}

// 3 — Same record
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Core architecture", "Keep the Mongo user ID; replace only the login identity", "Every reference already points to the correct person.");
  panel(slide, 0.62, 1.82, 5.22, 4.72, C.panel2, C.red);
  pill(slide, "BEFORE", 0.95, 2.12, 0.82, C.red);
  compactFieldRow(slide, "_id", "64f…123", "64f…123", 0.98, 2.72, C.green, "same");
  compactFieldRow(slide, "username", "ariel.old", "ariel.new", 0.98, 3.23, C.cyan, "new");
  compactFieldRow(slide, "displayName", "Ariel Cohen", "Ariel Cohen", 0.98, 3.74, C.green, "same");
  compactFieldRow(slide, "avatarKey", "avatar-7.png", "avatar-7.png", 0.98, 4.25, C.green, "same");
  compactFieldRow(slide, "login", "local", "local / SSO", 0.98, 4.76, C.blue, "new");
  compactFieldRow(slide, "tokenVersion", "4", "5", 0.98, 5.27, C.amber, "revoke");
  text(slide, "Only allowlisted identity fields may change.", 0.98, 5.96, 4.3, 0.25, 10, C.muted, true);
  panel(slide, 6.2, 1.82, 6.5, 4.72, C.panel);
  text(slide, "What follows the unchanged _id", 6.55, 2.16, 5.5, 0.34, 17, C.ink, true);
  const items = [
    ["Messages & threads", C.cyan],
    ["Channels & DMs", C.blue],
    ["Reactions & activity", C.green],
    ["Saved messages & VIPs", C.violet],
    ["MinIO avatars & files", C.amber],
    ["Permissions & ownership", C.cyan],
  ];
  items.forEach(([label, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    panel(slide, 6.55 + col * 2.88, 2.86 + row * 0.91, 2.58, 0.68, C.panel2, color);
    text(slide, label, 6.73 + col * 2.88, 3.03 + row * 0.91, 2.22, 0.3, 10.5, C.ink, true, { align: "center" });
  });
  text(slide, "No reference rewrites. No DM renaming. No MinIO movement.", 6.55, 5.93, 5.55, 0.3, 10.5, C.green, true, { align: "center" });
}

// 4 — Preserved vs changed
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Migration contract", "Preserve the profile; change the credential boundary");
  panel(slide, 0.62, 1.76, 5.92, 4.86, C.panel2, C.green);
  pill(slide, "PRESERVED", 0.95, 2.08, 1.08, C.green);
  bulletList(
    slide,
    [
      "Mongo user _id",
      "Display name, first name, and last name",
      "Avatar and profile preferences",
      "Messages, threads, reactions, and activity",
      "DMs, channel membership, and permissions",
      "Saved messages, VIPs, and MinIO object keys",
    ],
    1,
    2.62,
    5.1,
    0.5,
    11.2
  );
  panel(slide, 6.82, 1.76, 5.9, 4.86, C.panel2, C.cyan);
  pill(slide, "REPLACED", 7.15, 2.08, 1.02, C.cyan);
  bulletList(
    slide,
    [
      "Canonical username",
      "Local password, or RHSSO issuer + subject",
      "Old local login eligibility",
      "Session and API-token generation",
      "Historical username alias resolution",
    ],
    7.2,
    2.62,
    5.05,
    0.55,
    11.2
  );
  panel(slide, 7.18, 5.5, 4.98, 0.72, C.panel, C.violet);
  text(slide, "RHSSO profile claims never overwrite Echo’s display name.", 7.42, 5.68, 4.5, 0.32, 10.3, C.violet, true, { align: "center" });
}

// 5 — Local flow
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Target: new local login", "A short, synchronous replacement flow");
  const cards = [
    ["Open Settings", "Start from the authenticated old local account."],
    ["Re-authenticate", "Verify the current password immediately."],
    ["Choose credentials", "Enter the new username and password."],
    ["Review", "Show exactly what changes and what stays."],
    ["Commit", "Update the same User in one transaction."],
    ["Sign in again", "Revoke old sessions and return a fresh JWT."],
  ];
  cards.forEach(([titleValue, detail], i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    flowCard(slide, 0.66 + col * 4.18, 1.88 + row * 1.72, 3.72, i + 1, titleValue, detail, i === 4 ? C.green : C.cyan);
    if (col < 2) arrow(slide, 4.42 + col * 4.18, 2.46 + row * 1.72, 4.75 + col * 4.18, 2.46 + row * 1.72, C.dim, 1.3);
  });
  panel(slide, 0.66, 5.52, 12.06, 0.76, C.panel2, C.green);
  text(slide, "The form does not ask for a new display name—the old profile is intentionally retained.", 0.98, 5.74, 11.42, 0.3, 12, C.green, true, { align: "center" });
}

// 6 — RHSSO flow
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Target: new RHSSO login", "A separate, purpose-bound flow with an explicit commit point");
  const steps = [
    ["Verify source", "Authenticated local user re-enters current password.", C.cyan],
    ["Create intent", "One-use, 10-minute record binds user + tokenVersion.", C.blue],
    ["Authenticate", "RHSSO authorization code + PKCE validates the target.", C.violet],
    ["Stage identity", "Callback stores issuer, subject, and proposed username.", C.amber],
    ["Confirm", "User sees old profile + exact new SSO identity.", C.green],
    ["Commit", "Transaction replaces login and revokes old sessions.", C.cyan],
  ];
  steps.forEach(([titleValue, detail, color], i) => {
    const y = 1.78 + i * 0.77;
    slide.addShape(S.ellipse, {
      x: 0.86,
      y: y + 0.05,
      w: 0.42,
      h: 0.42,
      fill: { color },
      line: { color },
    });
    text(slide, String(i + 1), 0.86, y + 0.1, 0.42, 0.25, 10, C.bg, true, { align: "center" });
    if (i < steps.length - 1) {
      slide.addShape(S.line, {
        x: 1.07,
        y: y + 0.47,
        w: 0,
        h: 0.3,
        line: { color: C.border, width: 2 },
      });
    }
    text(slide, titleValue, 1.55, y, 2.2, 0.28, 12.2, C.ink, true);
    text(slide, detail, 3.72, y, 5.15, 0.34, 10.2, C.muted);
  });
  panel(slide, 9.12, 1.79, 3.55, 4.67, C.panel2, C.violet);
  pill(slide, "CONFIRMATION", 9.46, 2.11, 1.2, C.violet);
  text(slide, "Replace this login?", 9.46, 2.62, 2.8, 0.34, 17, C.ink, true);
  text(slide, "Ariel Cohen", 9.46, 3.17, 2.8, 0.34, 15, C.ink, true);
  text(slide, "@ariel.old", 9.46, 3.53, 2.5, 0.27, 10.5, C.red, true);
  arrow(slide, 9.5, 4.03, 12.06, 4.03, C.cyan, 2);
  text(slide, "Ariel Cohen", 9.46, 4.31, 2.8, 0.34, 15, C.ink, true);
  text(slide, "@ariel.new  •  RHSSO", 9.46, 4.67, 2.8, 0.27, 10.5, C.green, true);
  text(slide, "The display name remains unchanged.", 9.46, 5.2, 2.72, 0.42, 10, C.muted);
  panel(slide, 9.46, 5.76, 2.84, 0.43, C.green, C.green);
  text(slide, "CONFIRM MIGRATION", 9.46, 5.84, 2.84, 0.24, 9.5, C.bg, true, { align: "center" });
}

// 7 — Why stage
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "RHSSO safety", "The callback validates—it does not migrate");
  panel(slide, 0.64, 1.76, 5.82, 4.83, C.panel2, C.red);
  pill(slide, "RISK", 0.98, 2.08, 0.66, C.red);
  text(slide, "Immediate callback mutation", 0.98, 2.58, 4.85, 0.38, 18, C.ink, true);
  bulletList(
    slide,
    [
      "The browser may already have an RHSSO session",
      "The user can select the wrong IdP account",
      "A retry can replay an ambiguous operation",
      "Failure may leave partially changed credentials",
      "Ordinary login and migration semantics can mix",
    ],
    1.03,
    3.18,
    4.95,
    0.53,
    10.9
  );
  panel(slide, 6.76, 1.76, 5.92, 4.83, C.panel2, C.green);
  pill(slide, "DESIGN", 7.1, 2.08, 0.82, C.green);
  text(slide, "Stage, display, confirm", 7.1, 2.58, 4.8, 0.38, 18, C.ink, true);
  bulletList(
    slide,
    [
      "Purpose-bound signed flow token",
      "OIDC state + nonce + PKCE validation",
      "Server-side one-use migration intent",
      "Issuer + subject must be unused in Echo",
      "Explicit confirmation before one transaction",
    ],
    7.15,
    3.18,
    5.02,
    0.53,
    10.9
  );
  text(slide, "Cancel or failure leaves the old local login untouched.", 7.12, 5.97, 5.1, 0.3, 10.5, C.green, true, { align: "center" });
}

// 8 — Alias and historical rendering
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Historical usernames", "Reserve the old handle; render the new canonical handle");
  panel(slide, 0.65, 1.78, 4.1, 4.72, C.panel2, C.cyan);
  pill(slide, "ALIAS RECORD", 0.98, 2.08, 1.16, C.cyan);
  text(slide, "UserAlias", 0.98, 2.62, 2.3, 0.32, 17, C.ink, true);
  text(slide, 'aliasUsername: "ariel.old"', 0.98, 3.18, 3.2, 0.3, 11.2, C.muted, true);
  text(slide, 'user: ObjectId("64f…123")', 0.98, 3.65, 3.2, 0.3, 11.2, C.muted, true);
  text(slide, "The alias cannot authenticate and cannot be registered by another user.", 0.98, 4.4, 3.2, 0.78, 11, C.ink, true);
  text(slide, "It exists only for continuity.", 0.98, 5.5, 3.2, 0.3, 10.5, C.cyan, true);
  panel(slide, 5.06, 1.78, 7.62, 4.72, C.panel);
  text(slide, "Stored message", 5.42, 2.13, 2, 0.26, 9.5, C.dim, true, { charSpacing: 0.7 });
  panel(slide, 5.42, 2.56, 2.84, 0.82, C.panel2, C.border);
  text(slide, "Thanks @ariel.old", 5.67, 2.8, 2.35, 0.3, 12, C.ink, true);
  arrow(slide, 8.55, 2.97, 9.2, 2.97, C.cyan, 2);
  text(slide, "Rendered message", 9.48, 2.13, 2.2, 0.26, 9.5, C.dim, true, { charSpacing: 0.7 });
  panel(slide, 9.48, 2.56, 2.84, 0.82, C.panel2, C.green);
  text(slide, "Thanks @ariel.new", 9.7, 2.8, 2.4, 0.3, 12, C.green, true);
  bulletList(
    slide,
    [
      "Mention clicks open the unchanged user ID",
      "Old mentions still notify the canonical user",
      "Search and autocomplete expose only the new username",
      "Forwarded author names already retain the old display name",
    ],
    5.48,
    4.03,
    6.48,
    0.5,
    10.7
  );
}

// 9 — Atomic update
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Commit contract", "One transaction, a strict allowlist, and immediate revocation");
  panel(slide, 0.64, 1.77, 6.16, 4.83, C.panel2, C.cyan);
  text(slide, "Mongo transaction", 0.98, 2.11, 3.5, 0.34, 17, C.ink, true);
  bulletList(
    slide,
    [
      "Re-check source is local, eligible, and unchanged",
      "Re-check target username and RHSSO identity are unused",
      "Create the old-username alias",
      "Set only username and authentication fields",
      "Increment tokenVersion and consume the intent",
      "Commit all changes—or none",
    ],
    1.02,
    2.7,
    5.3,
    0.5,
    10.7
  );
  panel(slide, 7.1, 1.77, 5.58, 2.47, C.panel2, C.green);
  text(slide, "After commit", 7.45, 2.11, 3, 0.34, 17, C.ink, true);
  bulletList(
    slide,
    [
      "Disconnect all old sockets",
      "Issue a fresh Echo JWT",
      "Broadcast user:update",
    ],
    7.5,
    2.68,
    4.55,
    0.46,
    10.8
  );
  panel(slide, 7.1, 4.52, 5.58, 2.08, C.panel2, C.amber);
  text(slide, "Never update", 7.45, 4.84, 3, 0.34, 17, C.ink, true);
  text(slide, "displayName • firstName • lastName • avatarKey • history references", 7.45, 5.43, 4.72, 0.68, 11.2, C.amber, true);
}

// 10 — Delivery plan
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Implementation plan", "Small data surface; security-sensitive authentication work");
  const phases = [
    ["1", "Data guardrails", "authOrigin, migratedAt, aliases, migration intents", C.cyan],
    ["2", "Local path", "Re-authentication, transaction, session revocation", C.blue],
    ["3", "RHSSO path", "Purpose-bound PKCE, staging, confirmation", C.violet],
    ["4", "Continuity", "Alias-aware mentions, canonical rendering", C.amber],
    ["5", "Proof", "Race, replay, rollback, and E2E coverage", C.green],
  ];
  phases.forEach(([n, titleValue, detail, color], i) => {
    const y = 1.77 + i * 0.88;
    panel(slide, 0.7, y, 8.05, 0.67, C.panel2, color);
    text(slide, n, 0.92, y + 0.15, 0.34, 0.29, 11, color, true, { align: "center" });
    text(slide, titleValue, 1.48, y + 0.12, 2.1, 0.32, 12, C.ink, true);
    text(slide, detail, 3.65, y + 0.12, 4.7, 0.32, 10.2, C.muted);
  });
  panel(slide, 9.08, 1.77, 3.58, 2.11, C.panel2, C.green);
  text(slide, "Expected scope", 9.42, 2.08, 2.8, 0.3, 15, C.ink, true);
  text(slide, "1–2 weeks", 9.42, 2.57, 2.8, 0.46, 25, C.green, true);
  text(slide, "for a production-ready first release", 9.42, 3.12, 2.72, 0.35, 9.7, C.muted);
  panel(slide, 9.08, 4.16, 3.58, 2.01, C.panel2, C.cyan);
  text(slide, "Why it stays simple", 9.42, 4.47, 2.8, 0.3, 15, C.ink, true);
  text(slide, "No bulk migration engine", 9.42, 4.98, 2.72, 0.3, 10.5, C.cyan, true);
  text(slide, "No object-storage changes", 9.42, 5.37, 2.72, 0.3, 10.5, C.cyan, true);
  text(slide, "No two-user merge", 9.42, 5.76, 2.72, 0.3, 10.5, C.cyan, true);
}

// 11 — Decision
{
  const slide = pptx.addSlide("ECHO_MIGRATION");
  heading(slide, "Recommendation", "Ship identity replacement—not user merging");
  panel(slide, 0.65, 1.75, 12.03, 2.0, C.panel2, C.green);
  text(slide, "Keep the old Echo person.", 1.05, 2.15, 5.3, 0.58, 25, C.ink, true);
  text(slide, "Give them a new username and login.", 1.05, 2.78, 7.3, 0.48, 21, C.green, true);
  const decisions = [
    ["LOCAL SOURCE ONLY", "Eligibility is explicit and auditable.", C.cyan],
    ["PROFILE PRESERVED", "Display name and avatar never change.", C.violet],
    ["STAGED RHSSO", "Validation precedes confirmation and commit.", C.blue],
    ["SAME USER ID", "History and ownership remain naturally intact.", C.green],
  ];
  decisions.forEach(([label, detail, color], i) => {
    const x = 0.66 + i * 3.08;
    panel(slide, x, 4.18, 2.76, 1.72, C.panel, color);
    pill(slide, label, x + 0.22, 4.47, 2.32, color);
    text(slide, detail, x + 0.24, 5.02, 2.28, 0.56, 10.2, C.muted, true, { align: "center" });
  });
  text(slide, "The result feels like a new account to the user—without creating a second person in the data model.", 1.05, 6.35, 11.3, 0.35, 12, C.cyan, true, { align: "center" });
}

await pptx.writeFile({ fileName: OUTPUT });
console.log(`Wrote ${OUTPUT}`);
