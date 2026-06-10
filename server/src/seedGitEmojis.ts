// Seed/refresh git-related custom emoji. Re-running replaces the images.
// Run inside the server container:  node src/seedGitEmojis.js
import mongoose from "mongoose";
import { connectDb } from "./db.js";
import { ensureBucket, putObject, FILE_CATEGORY } from "./storage.js";
import { CustomEmoji } from "./models/CustomEmoji.js";
import { User } from "./models/User.js";

// Explicit width/height so it renders everywhere (the emoji picker uses the SVG
// as a CSS background, which needs an intrinsic size).
const svg = (inner, color, vb = "0 0 16 16") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="${vb}" fill="${color}">${inner}</svg>`;
// Octicon-style icon from a single path's `d` data.
const icon = (d, color) => svg(`<path d="${d}"/>`, color);

const GIT = "#f05133";
const RED = "#f85149";
const PURPLE = "#a371f7";
const GREY = "#8b949e";
const DARKGRAY = "#6e7681"; // black-gray for the pull-request glyph

// GitHub octicon path data.
const P = {
  branch:
    "M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm0 9.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-9.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  commit:
    "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  // One branch curving into another — a true "merge".
  merge:
    "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z",
  pr:
    "M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z",
  github:
    "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z",
};

const EMOJIS = {
  // Git logo — orange diamond with a small branch.
  git: svg(
    `<path d="M12 1.5 22.5 12 12 22.5 1.5 12Z"/>` +
      `<g fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"><path d="M9 15.5v-2"/><path d="M15 15.5v-4"/><path d="M9 13.4c0-2.3 6-.5 6-3.3"/></g>` +
      `<g fill="#fff"><circle cx="9" cy="15.6" r="1.3"/><circle cx="15" cy="15.6" r="1.3"/><circle cx="15" cy="9.6" r="1.3"/></g>`,
    GIT,
    "0 0 24 24"
  ),
  "git-branch": icon(P.branch, GIT),
  "git-commit": icon(P.commit, GIT),
  "git-merge": icon(P.merge, PURPLE),
  "git-pull-request": icon(P.pr, DARKGRAY),
  "git-pull-request-closed": icon(P.pr, RED),
  merged: icon(P.merge, PURPLE),
  github: icon(P.github, GREY),
};

async function main() {
  await connectDb();
  await ensureBucket();
  const owner =
    (await User.findOne({ isAdmin: true })) ||
    (await User.findOne({ username: { $ne: "system" } }));
  if (!owner) {
    console.error("No user to attribute emoji to.");
    process.exit(1);
  }
  for (const [name, svg] of Object.entries(EMOJIS)) {
    const key = await putObject({
      buffer: Buffer.from(svg, "utf8"),
      name: `${name}.svg`,
      contentType: "image/svg+xml",
      category: FILE_CATEGORY.EMOJI,
    });
    const existing = await CustomEmoji.findOne({ name });
    if (existing) {
      existing.key = key;
      existing.contentType = "image/svg+xml";
      await existing.save();
      console.log("updated:", name);
    } else {
      await CustomEmoji.create({ name, key, contentType: "image/svg+xml", createdBy: owner._id });
      console.log("added:", name);
    }
  }
  console.log("Done.");
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
