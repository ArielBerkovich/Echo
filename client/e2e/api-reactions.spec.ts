import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

// A valid 1x1 PNG, used to register a workspace custom emoji without relying
// on files checked into the test bundle.
const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

test("REST reactions support native and custom emoji and toggle cleanly", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const message = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `REST reaction ${uniqueSuffix()}` },
  });
  const messagePath = `/channels/${fixture.generalChannel.id}/messages/${message.message.id}/reactions`;

  const native = await requestAsToken(page, fixture.bob.token, messagePath, {
    method: "POST",
    body: { emoji: "👍" },
  });
  expect(native.added).toBe(true);
  expect(native.reactions).toEqual([{ emoji: "👍", users: [fixture.bob.id] }]);

  const customName = `api${Date.now().toString(36).slice(-8)}`;
  const customResponse = await page.request.post("/api/emojis", {
    headers: { Authorization: `Bearer ${fixture.alice.token}` },
    multipart: {
      name: customName,
      file: { name: `${customName}.png`, mimeType: "image/png", buffer: ONE_BY_ONE_PNG },
    },
  });
  expect(customResponse.ok()).toBe(true);

  const custom = await requestAsToken(page, fixture.bob.token, messagePath, {
    method: "POST",
    body: { emoji: `:${customName}:` },
  });
  expect(custom.added).toBe(true);
  expect(custom.reactions).toEqual([
    { emoji: "👍", users: [fixture.bob.id] },
    { emoji: `:${customName}:`, users: [fixture.bob.id] },
  ]);

  const removed = await requestAsToken(page, fixture.bob.token, messagePath, {
    method: "POST",
    body: { emoji: `:${customName}:` },
  });
  expect(removed.added).toBe(false);
  expect(removed.reactions).toEqual([{ emoji: "👍", users: [fixture.bob.id] }]);
});

test("REST reactions reject unknown custom emoji shortcodes", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const message = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `Unknown reaction ${uniqueSuffix()}` },
  });
  const response = await page.request.post(
    `/api/channels/${fixture.generalChannel.id}/messages/${message.message.id}/reactions`,
    {
      headers: { Authorization: `Bearer ${fixture.bob.token}` },
      data: { emoji: ":does-not-exist:" },
    }
  );
  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: "custom emoji :does-not-exist: not found" });
});

test("REST reactions support idempotent explicit set and unset", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const message = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `Explicit reaction ${uniqueSuffix()}` },
  });
  const path = `/channels/${fixture.generalChannel.id}/messages/${message.message.id}/reactions`;
  const set = await requestAsToken(page, fixture.bob.token, path, { method: "POST", body: { emoji: "✅", present: true } });
  expect(set).toMatchObject({ added: true, changed: true, present: true });
  const setAgain = await requestAsToken(page, fixture.bob.token, path, { method: "POST", body: { emoji: "✅", present: true } });
  expect(setAgain).toMatchObject({ added: false, changed: false, present: true });
  const unset = await requestAsToken(page, fixture.bob.token, path, { method: "POST", body: { emoji: "✅", present: false } });
  expect(unset).toMatchObject({ added: false, changed: true, present: false });
  const unsetAgain = await requestAsToken(page, fixture.bob.token, path, { method: "POST", body: { emoji: "✅", present: false } });
  expect(unsetAgain).toMatchObject({ added: false, changed: false, present: false });
});

test("REST reactions reject non-boolean present values", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const message = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `Invalid reaction ${uniqueSuffix()}` },
  });
  const response = await page.request.post(`/api/channels/${fixture.generalChannel.id}/messages/${message.message.id}/reactions`, {
    headers: { Authorization: `Bearer ${fixture.bob.token}` },
    data: { emoji: "✅", present: "true" },
  });
  expect(response.status()).toBe(400);
});

test("concurrent reaction updates preserve users and different emojis", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const message = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `Concurrent reaction ${uniqueSuffix()}` },
  });
  const path = `/channels/${fixture.generalChannel.id}/messages/${message.message.id}/reactions`;
  await Promise.all([
    requestAsToken(page, fixture.alice.token, path, { method: "POST", body: { emoji: "🧪", present: true } }),
    requestAsToken(page, fixture.bob.token, path, { method: "POST", body: { emoji: "🧪", present: true } }),
    requestAsToken(page, fixture.bob.token, path, { method: "POST", body: { emoji: "🚀", present: true } }),
  ]);
  const result = await requestAsToken(page, fixture.alice.token, path, { method: "POST", body: { emoji: "🧪", present: true } });
  expect(result.reactions).toEqual(expect.arrayContaining([
    { emoji: "🧪", users: expect.arrayContaining([fixture.alice.id, fixture.bob.id]) },
    { emoji: "🚀", users: [fixture.bob.id] },
  ]));
  expect(result.reactions.find((reaction) => reaction.emoji === "🧪").users).toHaveLength(2);
});
