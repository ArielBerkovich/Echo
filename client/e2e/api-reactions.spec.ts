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
