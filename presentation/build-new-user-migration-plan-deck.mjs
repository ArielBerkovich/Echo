import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUTPUT = "/home/ariel/Echo_New_User_Migration_Feature_Plan.pptx";
const LOGO = path.join(ROOT, "client", "src", "assets", "echo-logo.png");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Echo";
pptx.company = "Echo";
pptx.subject = "New-user migration plan for local and RHSSO accounts";
pptx.title = "Echo New-User Migration Feature Plan";
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
  title: "ECHO_PLAN",
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
        text: "ECHO  •  NEW-USER MIGRATION PLAN",
        options: {
          x: 0.55,
          y: 7.12,
          w: 4.8,
          h: 0.18,
          margin: 0,
          fontFace: "DejaVu Sans",
          fontSize: 8,
          bold: true,
          color: C.dim,
          charSpacing: 1.2,
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
  text(slide, value, x, y + 0.01, w, 0.27, 8.8, color, true, {
    align: "center",
    charSpacing: 0.35,
  });
}

function titleSlide(section, title, subtitle = "") {
  const slide = pptx.addSlide("ECHO_PLAN");
  text(slide, section.toUpperCase(), 0.58, 0.35, 3.8, 0.22, 10, C.cyan, true, { charSpacing: 1.4 });
  text(slide, title, 0.58, 0.64, 12.05, 0.48, 25, C.ink, true);
  if (subtitle) text(slide, subtitle, 0.58, 1.15, 11.9, 0.33, 11.5, C.muted);
  return slide;
}

function bulletList(slide, items, x, y, w, lineH = 0.43, size = 11.5, defaultColor = C.cyan) {
  items.forEach((entry, index) => {
    const item = typeof entry === "string" ? { text: entry } : entry;
    const color = item.color || defaultColor;
    const yy = y + index * lineH;
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

function step(slide, x, y, w, n, title, detail, color) {
  panel(slide, x, y, w, 1.38, C.panel2, color);
  slide.addShape(S.ellipse, {
    x: x + 0.18,
    y: y + 0.18,
    w: 0.4,
    h: 0.4,
    fill: { color },
    line: { color },
  });
  text(slide, String(n), x + 0.18, y + 0.21, 0.4, 0.3, 11, C.bg, true, { align: "center" });
  text(slide, title, x + 0.7, y + 0.17, w - 0.87, 0.35, 13.5, C.ink, true);
  text(slide, detail, x + 0.2, y + 0.72, w - 0.4, 0.4, 10.3, C.muted, true);
}

function metric(slide, value, label, x, y, w, color) {
  panel(slide, x, y, w, 0.95, C.panel2);
  text(slide, value, x + 0.16, y + 0.1, w - 0.32, 0.38, 22, color, true);
  text(slide, label, x + 0.16, y + 0.56, w - 0.32, 0.2, 8.7, C.muted, true, { charSpacing: 0.35 });
}

// Slide 1 — title
{
  const slide = pptx.addSlide("ECHO_PLAN");
  slide.addShape(S.ellipse, {
    x: 8.72,
    y: -1.35,
    w: 5.8,
    h: 5.8,
    fill: { color: C.cyan, transparency: 92 },
    line: { color: C.cyan, transparency: 100 },
  });
  slide.addShape(S.ellipse, {
    x: 9.75,
    y: 3.75,
    w: 4.3,
    h: 4.3,
    fill: { color: C.violet, transparency: 93 },
    line: { color: C.violet, transparency: 100 },
  });
  slide.addImage({ path: LOGO, x: 0.65, y: 0.55, w: 0.62, h: 0.62 });
  text(slide, "ECHO", 1.4, 0.67, 1.2, 0.25, 14, C.ink, true, { charSpacing: 1.6 });
  pill(slide, "FEATURE PLAN", 0.65, 1.55, 1.25, C.cyan);
  text(slide, "Create a new identity.", 0.65, 2.12, 8.5, 0.62, 32, C.ink, true);
  text(slide, "Bring your Echo history.", 0.65, 2.8, 8.9, 0.65, 32, C.cyan, true);
  text(
    slide,
    "One migration engine for a new local account or a new RHSSO-backed account.",
    0.68,
    3.77,
    7.85,
    0.55,
    15,
    C.muted
  );

  panel(slide, 9.18, 1.7, 3.18, 3.72, C.panel2);
  pill(slide, "SOURCE", 9.48, 2.0, 0.92, C.red);
  text(slide, "Existing active user", 9.48, 2.45, 2.45, 0.34, 15, C.ink, true);
  arrow(slide, 10.78, 2.98, 10.78, 3.48, C.cyan, 2);
  pill(slide, "CHOOSE TARGET", 9.54, 3.62, 2.46, C.cyan);
  pill(slide, "LOCAL", 9.58, 4.18, 0.88, C.blue);
  pill(slide, "RHSSO", 11.04, 4.18, 0.92, C.violet);
  text(slide, "Target stays pending until migration passes.", 9.45, 4.72, 2.55, 0.4, 10.5, C.amber, true, {
    align: "center",
  });
  text(slide, "Old user is locked first—and deleted last.", 0.68, 5.83, 7.55, 0.35, 13, C.amber, true);
}

// Slide 2 — constraint
{
  const slide = titleSlide(
    "1 · Product boundary",
    "Only migrate into a brand-new, inactive target account",
    "This removes almost every two-sided merge conflict."
  );
  panel(slide, 0.68, 1.82, 5.78, 4.65, C.panel, C.green);
  pill(slide, "WHY THIS IS SIMPLER", 1.0, 2.13, 1.8, C.green);
  bulletList(
    slide,
    [
      "No target messages or reactions",
      "No target DMs or read cursors",
      "No target saved messages or VIPs",
      "No target scheduled posts or webhooks",
      "New identity fields always win",
      "Old history has one deterministic destination",
    ],
    1.03,
    2.74,
    4.88,
    0.5,
    12,
    C.green
  );

  panel(slide, 6.75, 1.82, 5.9, 4.65, C.panel2, C.red);
  pill(slide, "PENDING TARGET RULE", 7.07, 2.13, 1.82, C.red);
  text(slide, "Before migration completes, target cannot:", 7.07, 2.61, 4.85, 0.34, 15, C.ink, true);
  bulletList(
    slide,
    [
      { text: "Receive a normal session", color: C.red },
      { text: "Appear in user search or mentions", color: C.red },
      { text: "Join channels independently", color: C.red },
      { text: "Send messages or open sockets", color: C.red },
      { text: "Create DMs, uploads or automation", color: C.red },
    ],
    7.1,
    3.11,
    4.78,
    0.51,
    12
  );
  text(slide, "New User.status: migration_pending → active", 3.15, 6.72, 7.0, 0.3, 13, C.cyan, true, {
    align: "center",
  });
}

// Slide 3 — shared architecture
{
  const slide = titleSlide(
    "2 · Unified architecture",
    "Two provisioning paths feed one migration engine",
    "Authentication differs; data movement and verification remain identical."
  );
  panel(slide, 0.65, 1.82, 3.02, 3.92, C.panel2, C.blue);
  pill(slide, "LOCAL TARGET", 0.94, 2.12, 1.32, C.blue);
  bulletList(
    slide,
    ["Name + username", "New password", "Create pending User", "No token yet"],
    0.98,
    2.76,
    2.2,
    0.53,
    12,
    C.blue
  );

  panel(slide, 9.67, 1.82, 3.02, 3.92, C.panel2, C.violet);
  pill(slide, "RHSSO TARGET", 9.96, 2.12, 1.38, C.violet);
  bulletList(
    slide,
    ["OIDC + PKCE", "Purpose-bound state", "New issuer + subject", "Create pending User"],
    10.0,
    2.76,
    2.2,
    0.53,
    12,
    C.violet
  );

  arrow(slide, 3.73, 3.76, 4.34, 3.76, C.blue, 2);
  arrow(slide, 9.61, 3.76, 9.0, 3.76, C.violet, 2);
  panel(slide, 4.38, 1.82, 4.58, 3.92, "10282A", C.cyan);
  pill(slide, "SHARED ENGINE", 5.78, 2.12, 1.78, C.cyan);
  text(slide, "UserMergeOperation", 5.13, 2.66, 3.08, 0.35, 17, C.ink, true, { align: "center" });
  bulletList(
    slide,
    ["Lock source", "Create alias", "Remap DMs", "Transfer references", "Verify", "Activate target"],
    4.86,
    3.18,
    3.65,
    0.39,
    10.8,
    C.cyan
  );
  panel(slide, 2.0, 6.02, 9.35, 0.52, "201A2B", C.amber);
  text(
    slide,
    "Invariant: target provisioning may differ; target activation never does.",
    2.25,
    6.13,
    8.85,
    0.25,
    11.5,
    C.amber,
    true,
    { align: "center" }
  );
}

// Slide 4 — local flow
{
  const slide = titleSlide(
    "3 · Local account flow",
    "Create the replacement account inside the migration wizard",
    "The existing authenticated user proves ownership; the new local identity remains pending."
  );
  const steps = [
    ["Settings", "Move history", C.blue],
    ["Preview", "Counts + warnings", C.cyan],
    ["Reauth", "Current password", C.red],
    ["Create", "New local identity", C.blue],
    ["Migrate", "Progress + retries", C.amber],
    ["Switch", "Issue new session", C.green],
  ];
  steps.forEach(([name, detail, color], index) => {
    const x = 0.5 + index * 2.13;
    panel(slide, x, 2.05, 1.82, 2.22, C.panel2, color);
    slide.addShape(S.ellipse, {
      x: x + 0.65,
      y: 2.34,
      w: 0.52,
      h: 0.52,
      fill: { color },
      line: { color },
    });
    text(slide, String(index + 1), x + 0.65, 2.41, 0.52, 0.31, 13, C.bg, true, { align: "center" });
    text(slide, name, x + 0.18, 3.08, 1.46, 0.3, 13, C.ink, true, { align: "center" });
    text(slide, detail, x + 0.16, 3.54, 1.5, 0.35, 9.8, C.muted, true, { align: "center" });
    if (index < steps.length - 1) arrow(slide, x + 1.84, 3.15, x + 2.07, 3.15, color, 1);
  });
  panel(slide, 1.0, 4.79, 11.28, 1.14, C.panel, C.blue);
  pill(slide, "LOCAL TARGET KEEPS", 1.3, 5.09, 1.72, C.blue);
  text(slide, "new username · password · profile · authentication state", 3.26, 5.03, 4.25, 0.35, 13, C.ink, true);
  pill(slide, "OLD USER CONTRIBUTES", 7.74, 5.09, 1.9, C.cyan);
  text(slide, "history · relationships · preferences", 9.85, 5.03, 1.95, 0.35, 12, C.muted, true);
  text(slide, "Source remains recoverable until final verification.", 3.35, 6.33, 6.65, 0.3, 12.5, C.amber, true, {
    align: "center",
  });
}

// Slide 5 — SSO flow
{
  const slide = titleSlide(
    "4 · RHSSO account flow",
    "Carry migration intent through the existing PKCE login",
    "The callback provisions a pending target instead of performing ordinary login."
  );
  panel(slide, 0.68, 1.83, 7.05, 4.75, C.panel, C.violet);
  const ssoSteps = [
    ["1", "Start operation", "Source session + migration cookie"],
    ["2", "Redirect", "purpose=user-migration + operationId"],
    ["3", "Authenticate", "RHSSO authorization code + PKCE"],
    ["4", "Validate callback", "state · nonce · issuer · audience"],
    ["5", "Provision target", "Reject identity if it already exists"],
    ["6", "Run engine", "Return to migration progress"],
  ];
  ssoSteps.forEach(([n, name, detail], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 0.98 + col * 3.32;
    const y = 2.2 + row * 1.24;
    panel(slide, x, y, 3.03, 0.92, C.panel2, C.violet);
    pill(slide, n, x + 0.16, y + 0.17, 0.38, C.violet);
    text(slide, name, x + 0.66, y + 0.12, 2.08, 0.28, 11.5, C.ink, true);
    text(slide, detail, x + 0.66, y + 0.48, 2.08, 0.25, 9.2, C.muted);
  });

  panel(slide, 8.03, 1.83, 4.62, 4.75, C.panel2, C.red);
  pill(slide, "MUST REJECT", 8.35, 2.13, 1.3, C.red);
  bulletList(
    slide,
    [
      { text: "Same RHSSO identity as source", color: C.red },
      { text: "Identity already linked to Echo", color: C.red },
      { text: "Expired or mismatched operation", color: C.red },
      { text: "Ordinary login fallback", color: C.red },
      { text: "Admin or system migration", color: C.red },
    ],
    8.38,
    2.76,
    3.63,
    0.56,
    11.5
  );
  text(slide, "Ordinary RHSSO login remains unchanged when purpose=login.", 8.36, 5.76, 3.72, 0.36, 10.5, C.amber, true, {
    align: "center",
  });
}

// Slide 6 — data engine
{
  const slide = titleSlide(
    "5 · Migration engine",
    "Nine resumable phases protect data and identity",
    "Old User deletion is the final consequence of a successful verifier."
  );
  const steps = [
    ["1", "Preflight", "Counts + plan", C.blue],
    ["2", "Lock", "Tokens + sockets", C.red],
    ["3", "Alias", "Old → new", C.violet],
    ["4", "DM map", "Rename channels", C.amber],
    ["5", "Transfer", "Mongo references", C.blue],
    ["6", "Reconcile", "Reads + activity", C.green],
    ["7", "Attribute", "Mentions + forwards", C.violet],
    ["8", "Verify", "Zero unsafe refs", C.cyan],
    ["9", "Complete", "Delete + activate", C.green],
  ];
  steps.forEach(([n, name, detail, color], index) => {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const x = 0.49 + col * 2.55 + (row === 1 ? 1.27 : 0);
    const y = 1.85 + row * 2.05;
    step(slide, x, y, 2.2, n, name, detail, color);
    if (index < 8 && col < 4) arrow(slide, x + 2.22, y + 0.68, x + 2.48, y + 0.68, color, 1);
  });
  panel(slide, 1.15, 6.12, 11.05, 0.55, "10282A", C.cyan);
  text(
    slide,
    "UserMergeOperation stores phase, checkpoints, counters and errors—so every phase can safely run again.",
    1.42,
    6.24,
    10.5,
    0.25,
    11.2,
    C.cyan,
    true,
    { align: "center" }
  );
}

// Slide 7 — policy
{
  const slide = titleSlide(
    "6 · Transfer policy",
    "New identity wins; old history moves; risky capabilities are revoked",
    "The rules are explicit and identical for local and RHSSO targets."
  );
  panel(slide, 0.67, 1.83, 3.8, 4.64, C.panel, C.green);
  pill(slide, "NEW USER KEEPS", 0.98, 2.13, 1.5, C.green);
  bulletList(
    slide,
    [
      "Username",
      "Password or RHSSO identity",
      "Display name + avatar",
      "Admin/reset/token state",
      "New account ID",
    ],
    1.02,
    2.78,
    2.9,
    0.55,
    12,
    C.green
  );

  panel(slide, 4.76, 1.83, 3.8, 4.64, C.panel2, C.blue);
  pill(slide, "TRANSFER", 5.07, 2.13, 1.05, C.blue);
  bulletList(
    slide,
    [
      "Messages + channels",
      "DM history",
      "Reads + activity",
      "Saves + VIPs",
      "Reactions + pins",
      "Scheduled messages",
      "Emoji ownership",
    ],
    5.11,
    2.78,
    2.9,
    0.46,
    11.2,
    C.blue
  );

  panel(slide, 8.85, 1.83, 3.8, 4.64, C.panel, C.red);
  pill(slide, "REVOKE / REPORT", 9.16, 2.13, 1.55, C.red);
  bulletList(
    slide,
    [
      { text: "Old JWT + API tokens", color: C.red },
      { text: "Old webhook secrets", color: C.red },
      { text: "Pending password-help actions", color: C.red },
      { text: "Unresolved forward snapshots", color: C.amber },
      { text: "Unowned MinIO orphans", color: C.amber },
    ],
    9.2,
    2.78,
    2.9,
    0.55,
    11.2
  );
  text(slide, "Permanent UserAlias preserves old mentions, profile links and username reservation.", 1.57, 6.73, 10.2, 0.3, 12, C.violet, true, {
    align: "center",
  });
}

// Slide 8 — resilience and testing
{
  const slide = titleSlide(
    "7 · Reliability and security",
    "The feature succeeds only if failure is safe",
    "Refreshes, restarts and callback errors must never leave two usable identities or half-moved history."
  );
  panel(slide, 0.67, 1.82, 5.84, 4.75, C.panel, C.amber);
  pill(slide, "RECOVERY DESIGN", 0.99, 2.12, 1.45, C.amber);
  bulletList(
    slide,
    [
      "HttpOnly one-time migration-control cookie",
      "Source locked before writes",
      "Target pending until final verification",
      "Idempotent batches and durable checkpoints",
      "Cancel only before lock",
      "Admin retry for stuck operations",
      "Structured progress and metrics",
    ],
    1.03,
    2.72,
    4.92,
    0.48,
    11.5,
    C.amber
  );

  panel(slide, 6.78, 1.82, 5.87, 4.75, C.panel2, C.cyan);
  pill(slide, "REQUIRED E2E", 7.1, 2.12, 1.35, C.cyan);
  bulletList(
    slide,
    [
      "Local target—complete history transfer",
      "Real RHSSO target through Keycloak",
      "Pending target denied API + sockets",
      "Old login/tokens fail after lock",
      "Refresh and server restart in every phase",
      "DM rename and chronology",
      "Verifier blocks deletion on one stale reference",
    ],
    7.14,
    2.72,
    4.92,
    0.48,
    11.5,
    C.cyan
  );
  text(slide, "No source deletion without a green consistency report.", 3.12, 6.76, 7.1, 0.3, 13, C.red, true, {
    align: "center",
  });
}

// Slide 9 — rollout
{
  const slide = titleSlide(
    "8 · Delivery plan",
    "Ship local first, then add RHSSO on the same foundation",
    "The migration engine is the product; target provisioning is an adapter."
  );
  const phases = [
    ["0", "Foundations", "Status · Alias · Operation · control cookie", C.violet],
    ["1", "Local target", "Wizard · engine · local E2E", C.blue],
    ["2", "RHSSO target", "Purpose-bound PKCE · Keycloak E2E", C.violet],
    ["3", "Hardening", "Recovery UI · metrics · scale tests", C.cyan],
    ["4", "File follow-up", "StoredFile · authorization · cleanup", C.amber],
  ];
  phases.forEach(([n, name, detail, color], index) => {
    const x = 0.55 + index * 2.56;
    panel(slide, x, 1.95, 2.25, 2.15, C.panel2, color);
    pill(slide, `PHASE ${n}`, x + 0.22, 2.2, 0.9, color);
    text(slide, name, x + 0.22, 2.73, 1.8, 0.34, 15, C.ink, true);
    text(slide, detail, x + 0.22, 3.27, 1.8, 0.5, 9.8, C.muted, true);
    if (index < phases.length - 1) arrow(slide, x + 2.28, 3.0, x + 2.48, 3.0, color, 1);
  });

  metric(slide, "4–7", "WEEKS · PRODUCTION-GRADE", 1.08, 4.79, 2.5, C.green);
  panel(slide, 3.88, 4.79, 8.38, 0.95, "10282A", C.green);
  text(slide, "Recommended first release", 4.18, 4.96, 2.05, 0.28, 10.5, C.green, true);
  text(
    slide,
    "Non-admin source · new local or RHSSO target · resumable engine · permanent alias · webhooks revoked",
    6.24,
    4.9,
    5.55,
    0.4,
    11,
    C.ink,
    true
  );
  text(
    slide,
    "Strong recommendation: build this creation-time version before considering active-account merges.",
    1.38,
    6.31,
    10.6,
    0.38,
    16,
    C.cyan,
    true,
    { align: "center" }
  );
}

await pptx.writeFile({ fileName: OUTPUT });
console.log(OUTPUT);
