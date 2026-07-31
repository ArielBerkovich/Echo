import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
let pptxgen;
try {
  pptxgen = require("pptxgenjs");
} catch {
  pptxgen = require("/tmp/echo-presentation-tools/node_modules/pptxgenjs");
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "presentation", "output");
const RENDERED = path.join(ROOT, "presentation", "rendered");
const ASSETS = path.join(ROOT, "presentation", "assets");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RENDERED, { recursive: true });

const W = 1600;
const H = 900;
const FONT = "DejaVu Sans";
const COLORS = {
  ink: "#F4F7FC",
  muted: "#A9B5C8",
  dim: "#778399",
  bg: "#07111F",
  bg2: "#0B1728",
  blue: "#5C91D1",
  cyan: "#3DD7C3",
  green: "#43D69A",
  amber: "#F4B95F",
  red: "#FF6B78",
  violet: "#B17BE8",
  echoMain: "#272F3D",
  echoSidebar: "#343C4B",
  echoRail: "#2C3442",
  echoHeader: "#303847",
  echoBorder: "#465064",
  echoComposer: "#3C4556",
};

const echoLogo = dataUri(path.join(ROOT, "client", "src", "assets", "echo-logo.png"));
const jenkinsIcon = dataUri(path.join(ASSETS, "jenkins-headshot.png"));
const garpImage = dataUri(path.join(ASSETS, "garp-avatar.png"));
const garpFullImage = dataUri(path.join(ASSETS, "garp-fanart.jpg"));

function dataUri(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rect(x, y, w, h, fill, rx = 0, stroke = "none", strokeWidth = 0, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

function line(x1, y1, x2, y2, stroke, width = 1, dash = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function text(x, y, value, size = 20, fill = COLORS.ink, weight = 400, anchor = "start", extra = "") {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(value)}</text>`;
}

function multiline(x, y, lines, size = 20, fill = COLORS.ink, weight = 400, lineHeight = 1.35, anchor = "start") {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${lines
    .map((value, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : size * lineHeight}">${esc(value)}</tspan>`)
    .join("")}</text>`;
}

function pill(x, y, label, fill, color = "#FFFFFF", width = null) {
  const w = width ?? Math.max(74, label.length * 8.2 + 24);
  return `${rect(x, y, w, 30, fill, 15)}${text(x + w / 2, y + 21, label, 13, color, 700, "middle")}`;
}

function statusDot(x, y, color) {
  return `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`;
}

function checkItem(x, y, value, color = COLORS.cyan) {
  return `${statusDot(x, y - 5, color)}${text(x + 18, y, value, 15.5, COLORS.muted, 500)}`;
}

function avatar(x, y, initials, fill = "#5A77BE", size = 42, image = null) {
  if (image) {
    return `<image href="${image}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="9" fill="none" stroke="#F5D898" stroke-width="1.5"/>`;
  }
  return `${rect(x, y, size, size, fill, 12)}${text(x + size / 2, y + size * 0.68, initials, size * 0.36, "#FFFFFF", 700, "middle")}`;
}

function message({
  x,
  y,
  width,
  initials,
  avatarColor,
  author,
  time = "14:32",
  title,
  titleColor = COLORS.ink,
  lines = [],
  image = null,
  reactions = [],
  attachment = null,
  compact = false,
}) {
  const a = compact ? 34 : 42;
  let s = avatar(x, y, initials, avatarColor, a, image);
  const tx = x + a + 14;
  s += text(tx, y + 15, author, compact ? 14 : 15, "#E8ECF5", 700);
  s += text(tx + Math.min(180, author.length * 9 + 12), y + 15, time, 11, "#79859A", 400);
  let cy = y + (compact ? 37 : 43);
  if (title) {
    s += text(tx, cy, title, compact ? 15 : 17, titleColor, 700);
    cy += compact ? 25 : 28;
  }
  for (const row of lines) {
    if (typeof row === "string") {
      s += text(tx, cy, row, compact ? 13 : 14, "#B8C1D1", 400);
    } else {
      s += text(tx + (row.indent || 0), cy, row.text, row.size || (compact ? 13 : 14), row.color || "#B8C1D1", row.weight || 400);
    }
    cy += compact ? 21 : 23;
  }
  if (attachment) {
    const ay = cy + 2;
    s += rect(tx, ay, Math.min(width - a - 24, attachment.width || 390), 58, "#313A49", 8, "#465166", 1);
    s += rect(tx + 12, ay + 12, 34, 34, attachment.color || "#4E72B5", 7);
    s += text(tx + 29, ay + 35, attachment.icon || "↗", 18, "#FFFFFF", 700, "middle");
    s += text(tx + 58, ay + 24, attachment.name, 13, "#E4E9F2", 700);
    s += text(tx + 58, ay + 43, attachment.meta || "", 11, "#8F9BAE", 400);
    cy += 66;
  }
  if (reactions.length) {
    let rx = tx;
    for (const reaction of reactions) {
      s += pill(rx, cy + 2, reaction.label, reaction.fill || "#3A4558", reaction.color || "#D7DEEA", reaction.width);
      rx += reaction.width || Math.max(74, reaction.label.length * 8.2 + 24);
      rx += 8;
    }
  }
  return s;
}

function echoFrame({
  x = 55,
  y = 140,
  w = 1490,
  h = 720,
  channel,
  topic,
  channels,
  content,
  thread = null,
  threadTitle = "Thread",
  active = null,
  badges = {},
}) {
  const railW = 64;
  const sideW = 225;
  const mainX = x + railW + sideW;
  const mainW = w - railW - sideW;
  const channelSep = Math.min(330, Math.max(168, channel.length * 11.5 + 55));
  const threadW = thread ? 345 : 0;
  const timelineW = mainW - threadW;
  let s = `<g>`;
  s += rect(x, y, w, h, COLORS.echoMain, 18, "#404A5D", 1);
  s += `<path d="M ${x + 18} ${y} H ${x + railW} V ${y + h} H ${x + 18} Q ${x} ${y + h} ${x} ${y + h - 18} V ${y + 18} Q ${x} ${y} ${x + 18} ${y}" fill="${COLORS.echoRail}"/>`;
  s += rect(x + railW, y, sideW, h, COLORS.echoSidebar);
  s += `<image href="${echoLogo}" x="${x + 77}" y="${y + 20}" width="42" height="42"/>`;
  s += text(x + 125, y + 48, "Echo", 18, "#F1F4FA", 700);
  const railItems = [
    ["⌂", "Home"],
    ["▤", "DMs"],
    ["⌁", "Activity"],
    ["▱", "Saved"],
  ];
  railItems.forEach(([icon, label], i) => {
    const iy = y + 22 + i * 76;
    if (i === 0) s += rect(x + 12, iy - 4, 40, 40, "#587EA9", 12);
    s += text(x + 32, iy + 23, icon, 23, "#C0CADB", 500, "middle");
    s += text(x + 32, iy + 48, label, 10, "#AAB5C6", 600, "middle");
  });
  s += rect(x + 77, y + 81, sideW - 25, 36, "#495263", 10, "#647084", 1);
  s += text(x + 91, y + 105, "Filter channels & DMs", 12, "#AEB8C8", 400);
  s += text(x + 84, y + 158, "⌄  CHANNELS", 11, "#A8B3C4", 700);
  let sy = y + 180;
  channels.forEach((name) => {
    const isActive = (active || channel) === name;
    if (isActive) s += rect(x + 76, sy - 20, sideW - 22, 36, "#52749C", 9);
    s += text(x + 89, sy + 3, "#", 14, isActive ? "#EAF0F8" : "#8D99AC", 500);
    s += text(x + 111, sy + 3, name, 13, isActive ? "#F4F7FC" : "#B1BBCB", isActive ? 600 : 400);
    if (badges[name]) {
      s += `<circle cx="${x + railW + sideW - 18}" cy="${sy - 2}" r="10" fill="${COLORS.red}"/>`;
      s += text(x + railW + sideW - 18, sy + 2, badges[name], 10, "#FFFFFF", 700, "middle");
    }
    sy += 39;
  });
  s += text(x + 84, y + h - 96, "●", 13, COLORS.green, 700);
  s += text(x + 104, y + h - 96, "Maya Cohen", 13, "#EEF2F8", 700);
  s += text(x + 104, y + h - 78, "active", 11, COLORS.green, 500);

  s += rect(mainX, y, mainW, 62, COLORS.echoHeader);
  s += rect(mainX + 18, y + 14, mainW - 36, 34, "#3B4557", 9);
  s += text(mainX + 36, y + 36, "⌕  Search messages, people, and channels", 12, "#8F9BAE", 400);
  s += rect(mainX, y + 62, mainW, 58, "#2E3745");
  s += text(mainX + 27, y + 97, `# ${channel}`, 17, "#F4F6FA", 700);
  s += line(mainX + channelSep, y + 80, mainX + channelSep, y + 104, "#586275");
  s += text(mainX + channelSep + 17, y + 97, topic, 12, "#A4AFC0", 400);
  s += pill(mainX + mainW - 112, y + 76, "Pinned", "#3B4659", "#DDE3ED", 86);
  s += line(mainX, y + 120, mainX + mainW, y + 120, "#465064");
  if (thread) {
    s += line(mainX + timelineW, y + 62, mainX + timelineW, y + h, "#465064");
    s += rect(mainX + timelineW, y + 62, threadW, 58, "#2E3745");
    s += text(mainX + timelineW + 22, y + 97, threadTitle, 16, "#F2F5FA", 700);
    s += text(mainX + mainW - 24, y + 97, "×", 21, "#AAB4C5", 400, "middle");
  }
  s += content({ x: mainX + 24, y: y + 145, w: timelineW - 48, h: h - 230 });
  if (thread) s += thread({ x: mainX + timelineW + 18, y: y + 140, w: threadW - 36, h: h - 200 });
  const composerX = mainX + 18;
  const composerW = timelineW - 36;
  s += rect(composerX, y + h - 90, composerW, 70, COLORS.echoComposer, 10, "#505B70", 1);
  s += text(composerX + 16, y + h - 63, `Message #${channel}`, 12, "#9DA9BB", 400);
  s += text(composerX + 18, y + h - 36, "＋    Aa    ☺", 18, "#BFC8D7", 500);
  s += text(composerX + composerW - 30, y + h - 37, "➤", 20, "#9EB1CD", 500, "middle");
  if (thread) {
    const tx = mainX + timelineW + 14;
    s += rect(tx, y + h - 90, threadW - 28, 70, COLORS.echoComposer, 10, "#505B70", 1);
    s += text(tx + 14, y + h - 57, "Reply…", 12, "#9DA9BB", 400);
  }
  s += `</g>`;
  return s;
}

function slideBase(number, eyebrow, titleLines, subtitleLines, bullets, mockup, accent = COLORS.cyan, footer = "", leftExtra = "") {
  const headline = titleLines.join(" ");
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLORS.bg}"/>
        <stop offset="100%" stop-color="${COLORS.bg2}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.34"/>
      </filter>
    </defs>
    ${rect(0, 0, W, H, "url(#bg)")}
    <circle cx="72" cy="62" r="22" fill="${accent}"/>
    ${text(72, 70, number, 20, COLORS.bg, 800, "middle")}
    ${text(112, 54, eyebrow.toUpperCase(), 13, accent, 700, "start", 'letter-spacing="2.2"')}
    ${text(112, 103, headline, 34, COLORS.ink, 750)}
    <g filter="url(#shadow)">${mockup}</g>
    ${text(58, 888, footer || "Echo integration concept · sanitized demonstration", 11, COLORS.dim, 400)}
  </svg>`;
  return s;
}

function titleSlide() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#07111F"/>
        <stop offset="64%" stop-color="#0A1B30"/>
        <stop offset="100%" stop-color="#123B52"/>
      </linearGradient>
      <radialGradient id="glow">
        <stop offset="0%" stop-color="#3DD7C3" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#3DD7C3" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${rect(0, 0, W, H, "url(#hero)")}
    <circle cx="1325" cy="130" r="440" fill="url(#glow)"/>
    <image href="${echoLogo}" x="82" y="70" width="92" height="92"/>
    ${text(195, 128, "Echo", 38, COLORS.ink, 750)}
    ${pill(82, 210, "VISION DECK", "#16334A", COLORS.cyan, 132)}
    ${multiline(82, 320, ["Operational integrations,", "inside Echo."], 68, COLORS.ink, 750, 1.12)}
    ${text(86, 520, "Seven scenarios. One familiar workspace.", 25, COLORS.muted, 500)}
    ${line(86, 580, 530, 580, COLORS.cyan, 3)}
    ${text(86, 635, "State · Ownership · Action", 22, COLORS.ink, 700)}
    ${text(86, 842, "Sanitized demonstration · Initial concept deck", 13, COLORS.dim, 400)}
  </svg>`;
}

function jenkinsSlide() {
  const content = ({ x, y, w }) => {
    let s = pill(x, y, "FAILED", "#6A3340", "#FF9AA4", 82);
    s += pill(x + 92, y, "8m 42s", "#384456", "#C7D1DF", 82);
    s += message({
      x,
      y: y + 47,
      width: w,
      initials: "J",
      avatarColor: "#FFFFFF",
      image: jenkinsIcon,
      author: "Jenkins",
      title: "payments-api #1842",
      titleColor: COLORS.red,
      lines: [
        { text: "Triggered by @noa · feature/refunds · 7c31abc", color: "#C7D0DE" },
        { text: "Integration tests failed · 4/6 stages completed", color: "#E5EAF2", weight: 600 },
      ],
    });
    s += text(x + 56, y + 170, "PIPELINE", 11, "#7F8BA0", 700);
    const stages = [
      ["Checkout", "✓", COLORS.green],
      ["Compile", "✓", COLORS.green],
      ["Unit", "✓", COLORS.green],
      ["Integration", "×", COLORS.red],
      ["Package", "—", COLORS.dim],
      ["Publish", "—", COLORS.dim],
    ];
    const gap = 8;
    const stageW = (w - 56 - gap * 5) / 6;
    stages.forEach((stage, index) => {
      const sx = x + 56 + index * (stageW + gap);
      const selected = stage[0] === "Integration";
      s += rect(sx, y + 188, stageW, 66, selected ? "#49333C" : "#303846", 9, selected ? "#8B4754" : "#465064", 1);
      s += `<circle cx="${sx + 20}" cy="${y + 210}" r="10" fill="${stage[2]}" opacity="${selected ? 1 : 0.85}"/>`;
      s += text(sx + 20, y + 215, stage[1], 12, "#FFFFFF", 800, "middle");
      s += text(sx + 12, y + 241, stage[0], 10.5, selected ? "#FFD4D8" : "#C0CAD8", selected ? 700 : 600);
    });
    s += rect(x + 56, y + 278, w - 56, 105, "#3A3038", 10, "#73424D", 1);
    s += rect(x + 56, y + 278, 5, 105, COLORS.red, 3);
    s += text(x + 76, y + 304, "FAILED CHECK", 10.5, "#FF9AA4", 700);
    s += text(x + 76, y + 331, "payments.checkout › retries after provider timeout", 14, "#F2E5E7", 700);
    s += text(x + 76, y + 357, "3 assertions failed · first failure at 14:27 UTC", 12, "#BFAAB0", 500);
    s += pill(x + 56, y + 405, "↗ Open build", "#345473", "#BFE2FF", 112);
    s += pill(x + 178, y + 405, "View logs", "#3A4558", "#D7DEEA", 92);
    s += pill(x + 280, y + 405, "💬 4 updates", "#3A4558", "#D7DEEA", 108);
    return s;
  };
  const thread = ({ x, y, w }) => {
    let s = message({
      x,
      y,
      width: w,
      initials: "J",
      avatarColor: "#FFFFFF",
      image: jenkinsIcon,
      author: "Jenkins",
      time: "14:32",
      title: "Pipeline summary",
      titleColor: "#E8EDF5",
      lines: [],
      compact: true,
    });
    const rows = [
      ["Checkout", "PASSED", "12s", COLORS.green],
      ["Compile", "PASSED", "48s", COLORS.green],
      ["Unit tests", "PASSED", "2m 11s", COLORS.green],
      ["Integration", "FAILED", "5m 31s", COLORS.red],
      ["Package", "SKIPPED", "—", COLORS.dim],
    ];
    rows.forEach((row, index) => {
      const ry = y + 76 + index * 43;
      s += line(x + 46, ry + 15, x + w, ry + 15, "#3E485A");
      s += statusDot(x + 52, ry, row[3]);
      s += text(x + 66, ry + 5, row[0], 12, "#D8DFEA", 600);
      s += text(x + w - 54, ry + 5, row[2], 11, "#8995A8", 500, "end");
      s += text(x + w, ry + 5, row[1], 10, row[3], 700, "end");
    });
    s += rect(x + 46, y + 302, w - 46, 84, "#3A3038", 8, "#73424D", 1);
    s += text(x + 60, y + 327, "Failure", 10.5, "#FF9AA4", 700);
    s += text(x + 60, y + 351, "Expected 200; received 503", 12, "#F0E3E5", 600);
    s += text(x + 60, y + 371, "provider timeout after retry #3", 11, "#BCA8AE", 400);
    s += text(x + 46, y + 419, "@noa, this build needs your attention.", 12, "#F0C781", 700);
    return s;
  };
  return slideBase(
    "01",
    "Delivery visibility",
    ["Every build has", "a clear owner."],
    ["Jenkins updates one message from running", "to success or failure—without channel noise."],
    ["Mention the person who triggered it", "Keep stages and repair attempts in a thread", "Notify on action, not every event"],
    echoFrame({
      channel: "jenkins-builds",
      topic: "Live CI status across repositories",
      channels: ["jenkins-builds", "daily-prod-errors", "nightly-build-status", "version-releases"],
      badges: { "jenkins-builds": "1" },
      content,
      thread,
      threadTitle: "Build #1842",
    }),
    COLORS.blue,
    "Jenkins logo: Jenkins project · jenkins.io"
  );
}

function errorsSlide() {
  const content = ({ x, y, w }) => {
    let s = message({
      x,
      y,
      width: w,
      initials: "K8",
      avatarColor: "#386A7B",
      author: "Production Monitor",
      title: "Daily production error summary · 25 Jul",
      lines: [
        { text: "12,465 errors · 3 affected pods · production cluster", color: "#E5EAF2", weight: 600 },
      ],
    });
    s += pill(x + 56, y + 96, "1 NEW", "#663B35", "#FFB097", 78);
    s += pill(x + 144, y + 96, "2 RESOLVED", "#285647", "#8FE0BC", 106);
    s += pill(x + 260, y + 96, "▲ 18% VS YESTERDAY", "#3A4558", "#C8D3E1", 160);
    const rows = [
      ["vessels-rest-api", "HTTP 503 · upstream vessel registry timeout", "8,420", "▲ 41%", COLORS.red],
      ["comm-channel-transmitter", "Acknowledgement timeout after retry #3", "3,105", "▼ 12%", COLORS.amber],
      ["comm-channel-receiver", "Invalid frame checksum", "940", "NEW", COLORS.amber],
    ];
    s += text(x + 56, y + 155, "POD / TOP ERROR FINGERPRINT", 11, "#7F8BA0", 700);
    s += text(x + w - 205, y + 155, "COUNT", 11, "#7F8BA0", 700);
    s += text(x + w - 95, y + 155, "TREND", 11, "#7F8BA0", 700);
    rows.forEach((r, i) => {
      const ry = y + 190 + i * 76;
      const selected = i === 0;
      s += rect(x + 52, ry - 28, w - 55, 64, selected ? "#3E3540" : "#303846", 9, selected ? "#744552" : "#465064", 1);
      s += rect(x + 52, ry - 28, 4, 64, r[4], 2);
      s += statusDot(x + 70, ry - 6, r[4]);
      s += text(x + 84, ry - 1, r[0], 13, selected ? "#FFE1E4" : "#DCE2EC", 700);
      s += text(x + 84, ry + 22, r[1], 11.5, "#8F9CAF", 400);
      s += text(x + w - 197, ry + 4, r[2], 13, "#C5CEDC", 600);
      s += text(x + w - 92, ry + 4, r[3], 13, r[4], 700);
    });
    s += rect(x + 52, y + 402, w - 55, 54, "#333B49", 8, "#495569", 1);
    s += text(x + 68, y + 425, "Daily assessment", 10.5, "#8D9AAF", 700);
    s += text(x + 68, y + 446, "vessels-rest-api drives 68% of today's errors · @vessels-team notified", 12, "#F0C781", 600);
    return s;
  };
  const thread = ({ x, y, w }) => {
    let s = message({
      x,
      y,
      width: w,
      initials: "K8",
      avatarColor: "#386A7B",
      author: "Production Monitor",
      title: "vessels-rest-api",
      titleColor: "#FFE1E4",
      lines: [{ text: "Selected pod details", color: "#8F9CAF", size: 11.5 }],
      compact: true,
    });
    s += pill(x + 46, y + 90, "DEGRADED", "#66512D", "#FFD98C", 102);
    s += pill(x + 158, y + 90, "5 / 6 READY", "#3A4558", "#C8D3E1", 108);
    s += text(x + 46, y + 150, "TOP FINGERPRINTS", 10.5, "#7F8BA0", 700);
    const fingerprints = [
      ["HTTP 503", "upstream registry timeout", "5,921", COLORS.red],
      ["TIMEOUT", "request exceeded 5 seconds", "2,499", COLORS.amber],
    ];
    fingerprints.forEach((row, index) => {
      const ry = y + 178 + index * 76;
      s += rect(x + 46, ry - 22, w - 46, 62, "#323A48", 8, "#495366", 1);
      s += statusDot(x + 61, ry - 2, row[3]);
      s += text(x + 75, ry + 3, row[0], 11, row[3], 700);
      s += text(x + w - 12, ry + 3, row[2], 11.5, "#D9E0EA", 700, "end");
      s += text(x + 61, ry + 27, row[1], 11, "#97A3B5", 400);
    });
    s += text(x + 46, y + 338, "First seen", 10.5, "#7F8BA0", 700);
    s += text(x + w - 5, y + 338, "01:14 UTC", 11.5, "#D5DCE7", 600, "end");
    s += text(x + 46, y + 366, "Last occurrence", 10.5, "#7F8BA0", 700);
    s += text(x + w - 5, y + 366, "23:52 UTC", 11.5, "#D5DCE7", 600, "end");
    s += text(x + 46, y + 410, "Owner  @vessels-team", 12, "#F0C781", 700);
    s += pill(x + 46, y + 433, "↗ Open logs", "#345473", "#BFE2FF", 106);
    s += pill(x + 162, y + 433, "Create incident", "#4E3E58", "#E0C8FF", 116);
    return s;
  };
  return slideBase(
    "02",
    "Production reliability",
    ["A daily signal,", "not a log firehose."],
    ["Errors are grouped by workload and fingerprint,", "compared with yesterday, and routed by ownership."],
    ["Surface new and growing error patterns", "Keep raw logs in the logging platform", "Escalate only when a team must act"],
    echoFrame({
      channel: "daily-prod-errors",
      topic: "24-hour production error digest",
      channels: ["jenkins-builds", "daily-prod-errors", "nightly-build-status", "version-releases"],
      badges: { "daily-prod-errors": "1" },
      content,
      thread,
      threadTitle: "Pod details",
    }),
    COLORS.red
  );
}

function nightlySlide() {
  const content = ({ x, y, w }) => {
    let s = pill(x, y, "DEGRADED", "#66512D", "#FFD98C", 102);
    s += message({
      x,
      y: y + 45,
      width: w,
      initials: "N",
      avatarColor: "#586C9F",
      author: "Nightly",
      title: "Nightly 2026.07.25 · build 612",
      titleColor: COLORS.amber,
      lines: [
        { text: "2 regressions · 1 flaky test · duration 1h 18m", color: "#E5EAF2", weight: 600 },
        { text: "Compared with previous successful nightly", color: "#8F9CAF" },
      ],
    });
    const stages = [
      ["Compile", "PASSED", COLORS.green],
      ["Unit tests", "PASSED", COLORS.green],
      ["Integration", "FAILED", COLORS.red],
      ["E2E", "DEGRADED", COLORS.amber],
      ["Packaging", "BLOCKED", COLORS.dim],
    ];
    stages.forEach((r, i) => {
      const ry = y + 175 + i * 43;
      s += rect(x + 56, ry - 25, w - 60, 34, "#303846", 7);
      s += text(x + 71, ry - 1, r[0], 13, "#DBE1EB", 600);
      s += text(x + w - 75, ry - 1, r[1], 12, r[2], 700, "end");
    });
    s += text(x + 56, y + 407, "@checkout-team owns both new regressions.", 13, "#F0C781", 600);
    s += pill(x + 56, y + 429, "💬 7 stage updates", "#3A4558", "#D7DEEA", 135);
    return s;
  };
  return slideBase(
    "03",
    "Quality at a glance",
    ["One nightly,", "one evolving story."],
    ["A stable status message summarizes the run;", "stage evidence and regressions stay in its thread."],
    ["Compare against the previous baseline", "Separate new regressions from known failures", "Route failures to the owning team"],
    echoFrame({
      channel: "nightly-build-status",
      topic: "Cross-system nightly qualification",
      channels: ["jenkins-builds", "daily-prod-errors", "nightly-build-status", "version-releases"],
      content,
    }),
    COLORS.amber
  );
}

function releasesSlide() {
  const content = ({ x, y, w }) => {
    let s = pill(x, y, "RELEASED", "#285647", "#9BE6C6", 98);
    s += message({
      x,
      y: y + 46,
      width: w,
      initials: "R",
      avatarColor: "#6A4F9D",
      author: "Release Bot",
      title: "Echo Platform v4.18.0",
      titleColor: "#DCC7FF",
      lines: [
        { text: "Production rollout complete · 14:24 UTC", color: "#A4E1C6", weight: 600 },
        { text: "42 changes · 11 contributors · commit 84b7d21", color: "#97A4B7" },
      ],
    });
    s += text(x + 56, y + 159, "RELEASE NOTES", 11, "#7F8BA0", 700);
    s += text(x + 60, y + 190, "• Faster message search across large channels", 13, "#D8DEE9", 500);
    s += text(x + 60, y + 217, "• Improved deployment health reporting", 13, "#D8DEE9", 500);
    s += text(x + 60, y + 244, "• New team ownership metadata", 13, "#D8DEE9", 500);
    s += text(x + 56, y + 291, "ENVIRONMENTS", 11, "#7F8BA0", 700);
    s += pill(x + 56, y + 308, "✓ staging", "#285647", "#9BE6C6", 98);
    s += pill(x + 164, y + 308, "✓ production", "#285647", "#9BE6C6", 112);
    s += message({
      x,
      y: y + 370,
      width: w,
      initials: "MC",
      avatarColor: "#3C74A8",
      author: "Maya Cohen",
      lines: [{ text: "Great work — the rollout is stable across all monitored services.", color: "#C8D1DF" }],
      compact: true,
      reactions: [{ label: "git-merged  6", width: 126, fill: "#3D4657", color: "#D8E2F0" }],
    });
    return s;
  };
  return slideBase(
    "04",
    "Release awareness",
    ["The latest version", "is never a mystery."],
    ["Release notes, artifacts and rollout progress", "arrive together in a searchable channel record."],
    ["Show what changed and where it is deployed", "Mention teams affected by breaking changes", "Connect merge → nightly → release"],
    echoFrame({
      channel: "version-releases",
      topic: "Approved versions and rollout history",
      channels: ["jenkins-builds", "daily-prod-errors", "nightly-build-status", "version-releases"],
      content,
    }),
    COLORS.violet
  );
}

function teamsSlide() {
  const content = ({ x, y, w }) => {
    let s = pill(x, y, "REVIEW NEEDED", "#3A4F69", "#B8D9FF", 132);
    s += message({
      x,
      y: y + 46,
      width: w,
      initials: "PR",
      avatarColor: "#4B62A0",
      author: "Git Service",
      title: "PR #482 · Refund retry policy",
      titleColor: "#CFE1FF",
      lines: [
        { text: "@noa requested review from @daniel", color: "#D8DEE9", weight: 600 },
        { text: "payments-api · +214 / −36 · risk: medium", color: "#96A3B6" },
        { text: "CI 11/12 · integration suite still running", color: "#E5C886" },
      ],
      reactions: [
        { label: "↗ Open PR", width: 94, fill: "#345473", color: "#BFE2FF" },
        { label: "👀 2", width: 66 },
      ],
    });
    s += line(x, y + 246, x + w, y + 246, "#414B5F");
    s += message({
      x,
      y: y + 271,
      width: w,
      initials: "PR",
      avatarColor: "#4B62A0",
      author: "Git Service",
      title: "PR #479 · Improve timeout telemetry",
      titleColor: COLORS.green,
      lines: [
        { text: "Approved · all required checks passed", color: "#A4E1C6" },
        { text: "Ready to merge", color: "#C7D0DE", weight: 600 },
      ],
      compact: true,
    });
    return s;
  };
  return slideBase(
    "05",
    "Team-shaped communication",
    ["Three channels.", "Three expectations."],
    ["Each team gets focused spaces for coordination,", "pull requests and operational alerts."],
    ["<team>-team for people and decisions", "<team>-team-prs for review flow", "<team>-team-alerts for operational action"],
    echoFrame({
      channel: "payments-team-prs",
      topic: "Reviews and merge readiness",
      channels: ["payments-team", "payments-team-prs", "payments-team-alerts", "identity-team", "platform-team"],
      badges: { "payments-team-alerts": "2", "payments-team-prs": "1" },
      content,
    }),
    COLORS.blue
  );
}

function e2eSlide() {
  const content = ({ x, y, w }) => {
    let s = pill(x, y, "NEW REGRESSION", "#6A3340", "#FF9AA4", 142);
    s += message({
      x,
      y: y + 46,
      width: w,
      initials: "E2E",
      avatarColor: "#814B62",
      author: "E2E Monitor",
      title: "Checkout · card decline recovery",
      titleColor: COLORS.red,
      lines: [
        { text: "@payments-team this test failed in 3 consecutive runs.", color: "#F0D0D4", weight: 600 },
        { text: "First observed after payments-api@8c71f2", color: "#C1CAD8" },
        { text: "Likely owner: @noa · confidence 86%", color: "#F0C781" },
      ],
      attachment: {
        name: "failure-screenshot.png",
        meta: "1280×720 · trace and video available",
        icon: "▧",
        color: "#6A4F65",
        width: 420,
      },
      reactions: [
        { label: "💬 Investigate", width: 112 },
        { label: "↗ Open trace", width: 108, fill: "#345473", color: "#BFE2FF" },
      ],
    });
    s += rect(x + 56, y + 382, w - 60, 72, "#333A46", 8, "#4B5568", 1);
    s += text(x + 72, y + 408, "Failure fingerprint", 11, "#8290A4", 700);
    s += text(x + 72, y + 435, "checkout.submit › retry after provider decline", 13, "#DCE2EC", 600);
    return s;
  };
  return slideBase(
    "06",
    "Ownership-aware quality",
    ["The right failure", "finds the right team."],
    ["Ownership metadata routes each regression", "with evidence to the team most likely to act."],
    ["Fingerprint repeated failures into one story", "Attach screenshots, traces and representative logs", "Escalate regressions; suppress known noise"],
    echoFrame({
      channel: "payments-team-alerts",
      topic: "Actionable production and quality signals",
      channels: ["payments-team", "payments-team-prs", "payments-team-alerts", "identity-team", "platform-team"],
      badges: { "payments-team-alerts": "1" },
      content,
    }),
    COLORS.red
  );
}

function garpSlide() {
  const content = ({ x, y, w }) => {
    let s = message({
      x,
      y,
      width: w,
      initials: "MC",
      avatarColor: "#3C74A8",
      author: "Maya Cohen",
      lines: [
        { text: "@Garp, tell me why the nightly build", color: "#DCE4EF", weight: 600 },
        { text: "failed and which team should act.", color: "#DCE4EF", weight: 600 },
      ],
      reactions: [{ label: "💬 3", width: 68 }],
    });
    s += line(x, y + 130, x + w, y + 130, "#414B5F");
    s += message({
      x,
      y: y + 158,
      width: w,
      initials: "G",
      avatarColor: "#FFFFFF",
      image: garpImage,
      author: "Garp",
      title: "I found the failure and started a thread.",
      titleColor: "#F6C86D",
      lines: [
        { text: "Evidence, ownership and next steps are kept together.", color: "#B9C4D3" },
      ],
      compact: true,
    });
    return s;
  };
  const thread = ({ x, y, w }) => {
    let s = message({
      x,
      y,
      width: w,
      initials: "G",
      avatarColor: "#FFFFFF",
      image: garpImage,
      author: "Garp",
      time: "14:35",
      lines: [
        { text: "The integration suite failed because", color: "#C5CEDB", size: 12 },
        { text: "checkout-worker rejected a new", color: "#C5CEDB", size: 12 },
        { text: "CartItem schema.", color: "#C5CEDB", size: 12 },
        { text: "", size: 6 },
        { text: "First seen 11 minutes after commit", color: "#8F9CAF", size: 12 },
        { text: "8c71f2. The changed component is", color: "#8F9CAF", size: 12 },
        { text: "owned by @payments-team.", color: "#F0C781", size: 12, weight: 700 },
      ],
      compact: true,
    });
    s += rect(x + 46, y + 210, w - 48, 92, "#323A48", 8, "#4A5568", 1);
    s += text(x + 61, y + 235, "RECOMMENDED NEXT STEP", 10, "#7F8BA0", 700);
    s += text(x + 61, y + 261, "Re-run after reverting the", 12, "#DDE3EC", 600);
    s += text(x + 61, y + 280, "schema change or update the fixture.", 12, "#DDE3EC", 600);
    s += pill(x + 46, y + 324, "View evidence", "#345473", "#BFE2FF", 108);
    s += pill(x + 162, y + 324, "Create incident", "#4E3E58", "#E0C8FF", 116);
    s += rect(x + 46, y + 378, w - 48, 100, "#FFFFFF", 9, "#5B4A31", 1.5);
    s += `<image href="${garpFullImage}" x="${x + 46}" y="${y + 378}" width="${w - 48}" height="100" preserveAspectRatio="xMidYMid meet"/>`;
    return s;
  };
  const frame = echoFrame({
    channel: "nightly-build-status",
    topic: "AI with evidence",
    channels: ["nightly-build-status", "payments-team", "daily-prod-errors", "ask-garp"],
    content,
    thread,
  });
  return slideBase(
    "07",
    "Trusted AI in context",
    ["Ask @Garp.", "Keep the evidence."],
    ["A mention starts a permission-aware thread.", "Garp explains the signal, names the owner", "and recommends a next step."],
    ["Answers link back to source evidence", "Threads keep human judgment in the loop", "A cheerful veteran who trusts the next generation"],
    frame,
    COLORS.amber,
    "Garp fanart: user-provided Pinterest reference · pinterest.com/pin/578501514655029831"
  );
}

const slides = [
  { name: "00-title", svg: titleSlide(), notes: "Open with Echo as an operational collaboration layer, not merely another chat application." },
  { name: "01-jenkins-builds", svg: jenkinsSlide(), notes: "One evolving message per build. Mention the trigger owner only when action is required." },
  { name: "02-daily-prod-errors", svg: errorsSlide(), notes: "Aggregate by stable workload and error fingerprint—not ephemeral pod name." },
  { name: "03-nightly-build-status", svg: nightlySlide(), notes: "The nightly is a cross-system qualification story, with regressions compared to the previous baseline." },
  { name: "04-version-releases", svg: releasesSlide(), notes: "Connect release notes to artifacts and environment rollout state." },
  { name: "05-team-pr-alert-channels", svg: teamsSlide(), notes: "Different channels carry different expectations: conversation, review, and action." },
  { name: "06-team-owned-e2e", svg: e2eSlide(), notes: "Ownership metadata makes the routing layer reusable across every integration." },
  { name: "07-garp-ai", svg: garpSlide(), notes: "Garp answers in a thread, cites evidence, and recommends next steps while preserving human judgment." },
];

for (const slide of slides) {
  const svgPath = path.join(RENDERED, `${slide.name}.svg`);
  const pngPath = path.join(RENDERED, `${slide.name}.png`);
  fs.writeFileSync(svgPath, slide.svg);
  execFileSync("convert", ["-background", "none", "-density", "144", svgPath, "-resize", `${W}x${H}!`, pngPath], {
    stdio: "inherit",
  });
}

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Echo";
pptx.subject = "Echo integration possibilities inside a Navy organization";
pptx.title = "Echo — Operational Collaboration Possibilities";
pptx.company = "Echo";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "DejaVu Sans",
  bodyFontFace: "DejaVu Sans",
  lang: "en-US",
};
pptx.defineSlideMaster({
  title: "ECHO_MASTER",
  background: { color: "07111F" },
  objects: [],
  slideNumber: { x: 12.68, y: 7.18, w: 0.3, h: 0.18, color: "718096", fontFace: "DejaVu Sans", fontSize: 7 },
});

for (let i = 0; i < slides.length; i += 1) {
  const item = slides[i];
  const slide = pptx.addSlide("ECHO_MASTER");
  slide.addImage({ path: path.join(RENDERED, `${item.name}.png`), x: 0, y: 0, w: 13.333, h: 7.5 });
  slide.addNotes(item.notes);
  if (item.name === "07-garp-ai") {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.58,
      y: 7.0,
      w: 4.8,
      h: 0.25,
      fill: { color: "FFFFFF", transparency: 100 },
      line: { color: "FFFFFF", transparency: 100 },
      hyperlink: { url: "https://www.pinterest.com/pin/garp-fanart--578501514655029831/" },
    });
  }
}

await pptx.writeFile({ fileName: path.join(OUT, "Echo_Integration_Possibilities.pptx") });

const manifest = {
  title: "Echo — Operational Collaboration Possibilities",
  generatedAt: new Date().toISOString(),
  slides: slides.map((s, index) => ({
    number: index + 1,
    name: s.name,
    image: `../rendered/${s.name}.png`,
    notes: s.notes,
  })),
  garpSource: "https://www.pinterest.com/pin/garp-fanart--578501514655029831/",
};
fs.writeFileSync(path.join(OUT, "deck-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Created ${slides.length} slides`);
console.log(path.join(OUT, "Echo_Integration_Possibilities.pptx"));
