import { expect, test } from "@playwright/test";
import { io } from "socket.io-client";
import { requestAsToken, seedWorkspaceFixture, seedToken, uniqueSuffix } from "./helpers.js";

let fixture;
let channel;
test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  channel = (await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST", body: { name: uniqueSuffix("activity-read"), type: "public" },
  })).channel;
});
async function message(page, body = `Hello @${fixture.alice.username}`, parentId = null) {
  return (await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST", body: { channelId: channel.id, body, parentId },
  })).message;
}
async function activity(page, id) {
  return (await requestAsToken(page, fixture.alice.token, "/activity")).items.find((item) => item.messageId === id);
}
async function expectUnread(page, id, unread) {
  await expect.poll(async () => (await activity(page, id))?.unread).toBe(unread);
}
function location(id, thread = null) {
  return `/channels/${channel.name}?message=${id}${thread ? `&thread=${thread}` : ""}`;
}
async function socketAction(page, token, event, payload) {
  const socket = io(new URL(page.url()).origin, { auth: { token }, transports: ["websocket"] });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const result: any = await new Promise((resolve, reject) => socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
    expect(result?.error).toBeFalsy();
  } finally { socket.disconnect(); }
}

test("activity stays unread in the feed and keyboard navigation reads the source, persistently", async ({ page }) => {
  const target = await message(page);
  await page.goto("/activity");
  // Match by text that is independent of mention rendering.
  const entry = page.getByTestId("activity-item").filter({ hasText: "Hello" }).first();
  await expect(entry).toHaveClass(/unread/);
  await entry.focus();
  await page.waitForTimeout(900);
  await expectUnread(page, target.id, true);
  await entry.press("Enter");
  await expect(page.getByTestId(`message-${target.id}`)).toBeInViewport();
  await expectUnread(page, target.id, false);
  await page.reload();
  await expectUnread(page, target.id, false);
  await page.goto("/activity");
  await expect(page.getByTestId("activity-item").filter({ hasText: "Hello" }).first()).not.toHaveClass(/unread/);
});

test("viewing a newer mention leaves an older paginated mention unread", async ({ page }) => {
  const older = await message(page, `Older @${fixture.alice.username}`);
  for (let i = 0; i < 65; i++) await message(page, `Filler ${i}\n\nA second paragraph for scrolling.`);
  const newer = await message(page, `Newer @${fixture.alice.username}`);
  await page.goto(location(newer.id));
  await expectUnread(page, newer.id, false);
  await expectUnread(page, older.id, true);
  await page.goto(location(older.id));
  await expect(page.getByTestId(`message-${older.id}`)).toBeInViewport();
  await expectUnread(page, older.id, false);
});

test("channel reads do not clear thread activity and only the visible reply becomes read", async ({ page }) => {
  const root = await message(page, "Thread root");
  const older = await message(page, `Older reply @${fixture.alice.username}`, root.id);
  for (let i = 0; i < 20; i++) await message(page, `Reply filler ${i}\n\nExtra paragraph.`, root.id);
  const newer = await message(page, `Newest reply @${fixture.alice.username}`, root.id);
  await page.goto(location(root.id));
  await expect(page.getByTestId(`message-${root.id}`)).toBeInViewport();
  await page.waitForTimeout(900);
  await expectUnread(page, older.id, true);
  await expectUnread(page, newer.id, true);
  await page.goto(location(newer.id, root.id));
  await expectUnread(page, newer.id, false);
  await expectUnread(page, older.id, true);
  await page.goto(location(older.id, root.id));
  await expect(page.getByTestId("thread-body").getByTestId(`message-${older.id}`)).toBeInViewport({ ratio: 0.5 });
  await expectUnread(page, older.id, false);
});

test("failed acknowledgments stay unread and retry successfully", async ({ page }) => {
  const target = await message(page);
  let failed = 0;
  await page.route("**/api/activity/read", async (route) => {
    failed++;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporary failure"}' });
  });
  await page.goto(location(target.id));
  await expect.poll(() => failed).toBeGreaterThan(0);
  await expectUnread(page, target.id, true);
  await page.unroute("**/api/activity/read");
  await expectUnread(page, target.id, false);
});

test("reading in another tab updates the activity feed", async ({ browser, page }) => {
  const target = await message(page, `Cross tab @${fixture.alice.username}`);
  await page.goto("/activity");
  const entry = page.getByTestId("activity-item").filter({ hasText: "Cross tab" });
  await expect(entry).toHaveClass(/unread/);
  const other = await browser.newPage();
  try {
    await seedToken(other, fixture.alice.token);
    await other.goto(location(target.id));
    await expectUnread(page, target.id, false);
    await expect(entry).not.toHaveClass(/unread/);
  } finally { await other.close(); }
});

test("a hidden tab does not read messages until it becomes visible", async ({ page }) => {
  const target = await message(page);
  await page.addInitScript(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
  await page.goto(location(target.id));
  await expect(page.getByTestId(`message-${target.id}`)).toBeInViewport();
  await page.waitForTimeout(900);
  await expectUnread(page, target.id, true);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectUnread(page, target.id, false);
});

test("an unfocused browser window does not read a visible activity source", async ({ page }) => {
  const target = await message(page);
  await page.addInitScript(() => {
    let focused = false;
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: () => focused,
    });
    window.addEventListener("test-focus", () => { focused = true; });
    window.addEventListener("test-blur", () => { focused = false; });
  });
  await page.goto(location(target.id));
  await expect(page.getByTestId(`message-${target.id}`)).toBeInViewport({ ratio: 0.5 });
  await page.waitForTimeout(900);
  await expectUnread(page, target.id, true);

  await page.evaluate(() => {
    window.dispatchEvent(new Event("test-focus"));
    window.dispatchEvent(new Event("focus"));
  });
  await expectUnread(page, target.id, false);
});

test("acknowledgments reject malformed input and cannot read another user's activity", async ({ page }) => {
  const target = await message(page);
  const entry = await activity(page, target.id);
  await requestAsToken(page, fixture.bob.token, "/activity/read", {
    method: "POST", body: { items: [{ id: entry.id, createdAt: entry.createdAt }] },
  });
  await expectUnread(page, target.id, true);
  for (const invalid of [null, { id: entry.id, createdAt: { toString: null } }, { id: entry.id, createdAt: "invalid" }]) {
    const response = await page.request.post("/api/activity/read", {
      headers: { Authorization: `Bearer ${fixture.alice.token}` }, data: { items: [invalid] },
    });
    expect(response.status()).toBe(400);
  }
});

test("a fresh reaction to a previously read message stays unread and stale acknowledgments cannot clear it", async ({ page }) => {
  const source = (await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST", body: { channelId: channel.id, body: "React to this" },
  })).message;
  await page.goto("/activity");
  await socketAction(page, fixture.bob.token, "reaction:toggle", { messageId: source.id, emoji: "👍" });
  const first = await activity(page, source.id);
  await page.goto(location(source.id));
  await expectUnread(page, source.id, false);
  await page.goto("/activity");
  await socketAction(page, fixture.bob.token, "reaction:toggle", { messageId: source.id, emoji: "👍" });
  await socketAction(page, fixture.bob.token, "reaction:toggle", { messageId: source.id, emoji: "👍" });
  await requestAsToken(page, fixture.alice.token, "/activity/read", { method: "POST", body: { items: [first] } });
  await expectUnread(page, source.id, true);
  await page.goto(location(source.id));
  await expectUnread(page, source.id, false);
});

test("deleting a source removes unread activity live, including its thread replies", async ({ page }) => {
  const source = await message(page, `Delete source @${fixture.alice.username}`);
  const reply = await message(page, `Delete reply @${fixture.alice.username}`, source.id);
  await page.goto("/activity");
  await expect(page.getByTestId("activity-item").filter({ hasText: "Delete source" })).toHaveClass(/unread/);
  await socketAction(page, fixture.bob.token, "message:delete", { messageId: source.id });
  await expect(page.getByTestId("activity-item").filter({ hasText: "Delete source" })).toHaveCount(0);
  await expect(page.getByTestId("activity-item").filter({ hasText: "Delete reply" })).toHaveCount(0);
  expect(await activity(page, reply.id)).toBeUndefined();
});

test("a message covered by an overlay stays unread", async ({ page }) => {
  const source = await message(page);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const cover = document.createElement("div");
      cover.id = "test-cover";
      cover.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:white";
      document.body.append(cover);
    });
  });
  await page.goto(location(source.id));
  await expect(page.getByTestId(`message-${source.id}`)).toBeAttached();
  await page.waitForTimeout(900);
  await expectUnread(page, source.id, true);
  await page.evaluate(() => document.getElementById("test-cover")?.remove());
  await expectUnread(page, source.id, false);
});

test("navigating away before the visibility dwell preserves unread state", async ({ page }) => {
  const source = await message(page);
  await page.goto(location(source.id));
  await expect(page.getByTestId(`message-${source.id}`)).toBeInViewport();
  await page.getByTestId("rail-activity").click();
  await page.waitForTimeout(900);
  await expectUnread(page, source.id, true);
});

test("very tall messages can be read without fitting entirely in the viewport", async ({ page }) => {
  const source = await message(page, `Tall @${fixture.alice.username}\n\n${"Long paragraph.\n\n".repeat(80)}`);
  await page.goto(location(source.id));
  await expectUnread(page, source.id, false);
});

test("new visible mentions and broadcasts are read while the channel remains open", async ({ page }) => {
  const source = await message(page, "Starting here");
  await page.goto(location(source.id));
  await expect(page.getByTestId(`message-${source.id}`)).toBeInViewport();
  const mention = await message(page);
  await expect(page.getByTestId(`message-${mention.id}`)).toBeInViewport();
  await expectUnread(page, mention.id, false);
  const broadcast = await message(page, "Broadcast @everyone");
  await expect(page.getByTestId(`message-${broadcast.id}`)).toBeInViewport();
  await expectUnread(page, broadcast.id, false);
});

test("a DM mention becomes read when its message is visible", async ({ page }) => {
  const target = (await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST", body: { channelId: fixture.dmChannel.id, body: `DM @${fixture.alice.username}` },
  })).message;
  await page.goto("/activity");
  await expectUnread(page, target.id, true);
  await page.goto(`/dms/${fixture.dmChannel.id}?message=${target.id}`);
  await expect(page.getByTestId(`message-${target.id}`)).toBeInViewport({ ratio: 0.5 });
  await expectUnread(page, target.id, false);
});

test("channel notices become read when viewed and lost access removes message activity", async ({ page }) => {
  const privateChannel = (await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST", body: { name: uniqueSuffix("notice-read"), type: "private" },
  })).channel;
  await requestAsToken(page, fixture.bob.token, `/channels/${privateChannel.id}/members`, {
    method: "POST", body: { userId: fixture.alice.id },
  });
  const getNotices = async () => (await requestAsToken(page, fixture.alice.token, "/activity")).items.filter((item) => item.channelId === privateChannel.id);
  expect((await getNotices()).find((item) => item.kind === "channel_add")?.unread).toBe(true);
  await page.goto("/activity");
  await expect.poll(async () => (await getNotices()).find((item) => item.kind === "channel_add")?.unread).toBe(false);
  await page.goto("/saved");
  const target = (await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST", body: { channelId: privateChannel.id, body: `Private @${fixture.alice.username}` },
  })).message;
  await expectUnread(page, target.id, true);
  await requestAsToken(page, fixture.bob.token, `/channels/${privateChannel.id}/members/${fixture.alice.id}`, { method: "DELETE" });
  expect(await activity(page, target.id)).toBeUndefined();
  expect((await getNotices()).find((item) => item.kind === "channel_remove")?.unread).toBe(true);
  await page.goto("/activity");
  await expect.poll(async () => (await getNotices()).find((item) => item.kind === "channel_remove")?.unread).toBe(false);
});
