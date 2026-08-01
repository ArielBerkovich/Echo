import { expect, test } from "@playwright/test";
import {
  messageById,
  messageByText,
  registerUser,
  requestAsToken,
  seedToken,
  seedWorkspaceFixture,
  uniqueSuffix,
  uploadAsToken,
} from "./helpers.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8/5+hHgAHggJ/PFvdcQAAAABJRU5ErkJggg==",
  "base64"
);

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function rawApi(page, token, path, options: { method?: string; body?: unknown } = {}) {
  return page.request.fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: options.body,
  });
}

test("revokes private-channel attachment access when membership is removed", async ({ page }) => {
  const channel = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: `private-files-${uniqueSuffix("access")}`, type: "private" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  const attachment = (await uploadAsToken(page, fixture.alice.token, {
    name: "private-proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private channel evidence", "utf8"),
  })).attachments[0];
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.channel.id}/messages`, {
    method: "POST",
    body: { body: "Private attachment", attachments: [attachment] },
  });

  const beforeRemoval = await rawApi(page, fixture.bob.token, `/files/${attachment.key}`);
  expect(beforeRemoval.ok()).toBeTruthy();
  expect(await beforeRemoval.text()).toBe("private channel evidence");

  await requestAsToken(page, fixture.alice.token, `/channels/${channel.channel.id}/members/${fixture.bob.id}`, {
    method: "DELETE",
  });
  const afterRemoval = await rawApi(page, fixture.bob.token, `/files/${attachment.key}`);
  expect(afterRemoval.status()).toBe(403);
  await expect(afterRemoval.json()).resolves.toMatchObject({ error: "access denied" });
  expect((await rawApi(page, "", `/files/${attachment.key}`)).status()).toBe(401);
  expect((await rawApi(page, fixture.alice.token, `/files/${attachment.key}`)).ok()).toBeTruthy();
});

test("clears an invalidated session and returns to login without stale workspace content", async ({ browser, page }) => {
  const suffix = uniqueSuffix("expired").replace(/[^a-z0-9]/gi, "").slice(-12);
  const username = `session.user${suffix}`;
  const auth = await registerUser(page, { username, displayName: "Session User" });
  await requestAsToken(page, auth.token, "/users/me/onboarded", { method: "POST" });

  const context = await browser.newContext();
  const sessionPage = await context.newPage();
  await seedToken(sessionPage, auth.token);
  try {
    await sessionPage.goto("/");
    await expect(sessionPage.getByTestId("composer-editor")).toBeVisible();

    const invalidated = await rawApi(page, auth.token, "/users/me/password", {
      method: "PATCH",
      body: { currentPassword: "Password1", newPassword: "Password2" },
    });
    expect(invalidated.ok()).toBeTruthy();
    expect((await rawApi(page, auth.token, "/auth/me")).status()).toBe(401);

    await sessionPage.reload();
    await expect(sessionPage.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(sessionPage.getByTestId("composer-editor")).toHaveCount(0);
    await expect.poll(() => sessionPage.evaluate(() => localStorage.getItem("echo.token"))).toBeNull();
  } finally {
    await context.close();
  }
});

test("recovers failed uploads without losing the draft or duplicating the eventual message", async ({ page }) => {
  let uploadAttempts = 0;
  await page.route("**/api/uploads", async (route) => {
    uploadAttempts += 1;
    if (uploadAttempts === 1) {
      await route.fulfill({ status: 503, json: { error: "temporary upload failure" } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  const body = `Upload retry ${uniqueSuffix("mutation")}`;
  const editor = page.getByTestId("composer-editor");
  await editor.fill(body);
  const file = { name: "retry.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG };
  await page.getByTestId("composer-attachments").setInputFiles(file);
  await expect(page.locator(".channel-view .error")).toContainText("Something went wrong on our end");
  await expect(editor).toHaveText(body);
  await expect(page.locator(".pending-att")).toHaveCount(0);

  await page.getByTestId("composer-attachments").setInputFiles(file);
  await expect(page.locator('.pending-att img[alt="retry.png"]')).toBeVisible();
  await expect(page.locator(".pending-att.uploading")).toHaveCount(0);
  await page.getByTestId("composer-send").click();
  await expect(messageByText(page, body)).toHaveCount(1);
  await expect(messageByText(page, body).locator('img[alt="retry.png"]')).toBeVisible();
  expect(uploadAttempts).toBe(2);
});

test("preserves an offline send draft and sends it exactly once after reconnection", async ({ page }) => {
  await page.goto("/");
  const body = `Offline retry ${uniqueSuffix("mutation")}`;
  const editor = page.getByTestId("composer-editor");
  await editor.fill(body);

  await page.context().setOffline(true);
  try {
    await expect(page.getByTestId("connection-banner")).toContainText("Reconnecting to Echo");
    await page.getByTestId("composer-send").click();
    await expect(page.locator(".channel-view .error")).toContainText("Your draft is still here");
    await expect(editor).toHaveText(body);
    await expect(messageByText(page, body)).toHaveCount(0);

    await page.context().setOffline(false);
    await expect(page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId("composer-send").click();
    await expect(messageByText(page, body)).toHaveCount(1);
  } finally {
    await page.context().setOffline(false).catch(() => {});
  }
});

test("keeps a failed scheduled message editable and creates it once on retry", async ({ page }) => {
  let scheduleAttempts = 0;
  await page.route("**/api/scheduled", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    scheduleAttempts += 1;
    if (scheduleAttempts === 1) {
      await route.fulfill({ status: 503, json: { error: "temporary schedule failure" } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  const body = `Schedule retry ${uniqueSuffix("mutation")}`;
  await page.getByTestId("composer-editor").fill(body);
  await page.getByTestId("composer-send-options").click();
  await page.locator(".send-menu button").filter({ hasText: "Custom time…" }).click();
  const modal = page.locator(".modal").filter({ hasText: "Schedule message" });
  await expect(modal.locator(".schedule-input")).not.toHaveValue("");
  await modal.getByRole("button", { name: "Schedule" }).click();
  await expect(modal.locator(".schedule-error")).toContainText("Something went wrong on our end");
  await expect(page.getByTestId("composer-editor")).toHaveText(body);

  const scheduledResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/scheduled") &&
      response.request().method() === "POST" &&
      response.status() === 201
  );
  await modal.getByRole("button", { name: "Schedule" }).click();
  const scheduledResponse = await scheduledResponsePromise;
  const created = await scheduledResponse.json();
  expect(created.scheduled.body).toBe(body);
  expect(created.scheduled.id).toBeTruthy();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".scheduled-banner")).toContainText("1 scheduled message");
  expect(scheduleAttempts).toBe(2);
});

test("shows and permanently dismisses every supported Activity kind", async ({ browser, page }) => {
  const stamp = uniqueSuffix("activity");
  const mentionBody = `Mention ${stamp} @${fixture.alice.username}`;
  const broadcastBody = `Broadcast ${stamp} @everyone`;
  const rootBody = `Reaction root ${stamp}`;
  const threadRootBody = `Thread root ${stamp}`;

  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: mentionBody, externalKey: `${stamp}-mention` },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: broadcastBody, externalKey: `${stamp}-broadcast` },
  });
  const reactionRoot = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: rootBody, externalKey: `${stamp}-reaction-root` },
  });
  const threadRoot = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: threadRootBody, externalKey: `${stamp}-thread-root` },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      parentId: threadRoot.message.id,
      body: `Thread reply ${stamp}`,
      externalKey: `${stamp}-thread-reply`,
    },
  });

  const addedChannel = await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST",
    body: { name: `activity-added-${stamp}`, type: "private" },
  });
  await requestAsToken(page, fixture.bob.token, `/channels/${addedChannel.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.alice.id },
  });
  try {
    const removedChannel = await requestAsToken(page, fixture.bob.token, "/channels", {
      method: "POST",
      body: { name: `activity-removed-${stamp}`, type: "private" },
    });
    await requestAsToken(page, fixture.bob.token, `/channels/${removedChannel.channel.id}/members`, {
      method: "POST",
      body: { userId: fixture.alice.id },
    });
    await requestAsToken(page, fixture.bob.token, `/channels/${removedChannel.channel.id}/members/${fixture.alice.id}`, {
      method: "DELETE",
    });

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    await seedToken(bobPage, fixture.bob.token);
    try {
      await bobPage.goto("/");
      await bobPage.getByTestId("channel-row-general").click();
      const root = messageById(bobPage, reactionRoot.message.id);
      await root.hover();
      await bobPage.getByTestId(/-actions$/).getByTitle("Add reaction").click();
      await bobPage.getByRole("button", { name: "React with 👍" }).click();
    } finally {
      await bobContext.close();
    }

    const expectedKinds = ["mention", "broadcast", "reply", "reaction", "channel_add", "channel_remove"];
    await expect.poll(async () => {
      const activity = await requestAsToken(page, fixture.alice.token, "/activity");
      return expectedKinds.filter((kind) => activity.items.some((item) => item.kind === kind)).sort();
    }).toEqual([...expectedKinds].sort());

    await page.goto("/");
    await expect(page.getByTestId("rail-activity")).toBeVisible();
    await page.getByTestId("rail-activity").click();
    await expect(page.getByTestId("activity-header")).toBeVisible({ timeout: 10_000 });
    const targets = [
      page.getByTestId("activity-item").filter({ hasText: mentionBody }),
      page.getByTestId("activity-item").filter({ hasText: `Broadcast ${stamp}` }),
      page.getByTestId("activity-item").filter({ hasText: `Thread reply ${stamp}` }),
      page.getByTestId("activity-item").filter({ hasText: rootBody }),
      page.getByTestId("activity-item").filter({ hasText: addedChannel.channel.name }),
      page.getByTestId("activity-item").filter({ hasText: removedChannel.channel.name }),
    ];
    for (const target of targets) {
      await expect(target).toBeVisible();
      await target.getByRole("button", { name: "Delete activity" }).click();
      await expect(target).toHaveCount(0);
    }

    await page.reload();
    await expect(page.getByTestId("activity-header")).toBeVisible();
    await expect(page.getByText(stamp, { exact: false })).toHaveCount(0);
  } finally {
    await requestAsToken(
      page,
      fixture.bob.token,
      `/channels/${addedChannel.channel.id}/members/${fixture.alice.id}`,
      { method: "DELETE" }
    );
  }
});
