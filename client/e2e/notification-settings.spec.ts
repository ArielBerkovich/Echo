import { expect, test } from "@playwright/test";
import { registerUser, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture;

async function installNotificationStub(page) {
  await page.addInitScript(() => {
    const notifications = [];
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      title;
      options;
      onclick = null;
      constructor(title, options) {
        this.title = title;
        this.options = options;
        notifications.push(this);
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: FakeNotification });
    Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
    window.__e2eNotifications = notifications;
  });
}

async function resetSettings(page) {
  await requestAsToken(page, fixture.alice.token, "/users/notification-settings", {
    method: "PUT",
    body: { defaults: "mentions" },
  });
  for (const id of [fixture.generalChannel.id, fixture.projectChannel.id, fixture.dmChannel.id]) {
    await requestAsToken(page, fixture.alice.token, "/users/notification-settings", {
      method: "PUT",
      body: { conversationId: id, rule: "default" },
    });
  }
  for (const token of [fixture.alice.token, fixture.bob.token]) {
    await requestAsToken(page, token, `/channels/${fixture.projectChannel.id}/threads/${fixture.messages.threadRoot.id}/follow`, {
      method: "PUT",
      body: { following: null },
    });
  }
}

async function sendAsBob(page, channelId, body, parentId = null) {
  return requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId, body, parentId },
  });
}

async function setConversationRule(page, conversationId, rule) {
  return requestAsToken(page, fixture.alice.token, "/users/notification-settings", {
    method: "PUT",
    body: { conversationId, rule },
  });
}

async function getThreadFollow(page, token, channelId, threadId) {
  return requestAsToken(page, token, `/channels/${channelId}/threads/${threadId}/follow`);
}

async function notificationCount(page) {
  return page.evaluate(() => window.__e2eNotifications.length);
}

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await resetSettings(page);
  await installNotificationStub(page);
});

test("global defaults control channel alerts", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.waitForTimeout(500);

  await sendAsBob(page, fixture.generalChannel.id, `ordinary default mention rule ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(0);

  await page.goto("/settings/preferences");
  const allMessages = page.getByRole("radio", { name: "All messages" });
  if (!(await allMessages.isChecked())) await allMessages.click();
  await expect(allMessages).toBeChecked();
  await expect.poll(async () => (await requestAsToken(page, fixture.alice.token, "/users/notification-settings")).defaults).toBe("all");
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.waitForTimeout(500);
  await sendAsBob(page, fixture.generalChannel.id, `ordinary global all rule ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(1);
});

test("conversation override beats the global default and mute keeps unread indicators", async ({ page }) => {
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByTestId("conversation-notifications").click();
  await page.getByRole("menuitemradio", { name: "All messages" }).click();
  await expect(page.getByText("Notification preference updated")).toBeVisible();
  await expect.poll(async () => (await requestAsToken(page, fixture.alice.token, "/users/notification-settings")).conversations[fixture.generalChannel.id]).toBe("all");
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.waitForTimeout(500);

  await sendAsBob(page, fixture.generalChannel.id, `ordinary override all ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(1);

  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.getByTestId("conversation-notifications").click();
  await page.getByRole("menuitemradio", { name: "Mute conversation" }).click();
  await expect(page.getByText("Notification preference updated")).toBeVisible();
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.waitForTimeout(500);
  await expect(page.getByTestId(`channel-row-general`)).not.toHaveClass(/unread/);

  await sendAsBob(page, fixture.generalChannel.id, `muted unread remains ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(0);
  await expect(page.getByTestId("channel-row-general")).toHaveClass(/unread/);
});

test("conversation overrides persist and can be reset from global settings", async ({ page }) => {
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await page.getByTestId("conversation-notifications").click();
  await page.getByRole("menuitemradio", { name: "Mute conversation" }).click();
  await page.reload();
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await expect(page.getByTestId("conversation-notifications")).toHaveAttribute("aria-label", "Notifications muted");

  await page.goto("/settings/preferences");
  const exception = page.locator(".notification-exception").filter({ hasText: "#general" });
  await expect(exception).toBeVisible();
  await exception.getByRole("button", { name: "Reset" }).click();
  await expect(exception).toHaveCount(0);

  const settings = await requestAsToken(page, fixture.alice.token, "/users/notification-settings");
  expect(settings.conversations[fixture.generalChannel.id]).toBeUndefined();
});

test("conversation notification menu closes when clicking outside", async ({ page }) => {
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await page.getByTestId("conversation-notifications").click();
  await expect(page.getByRole("menuitemradio", { name: "All messages" })).toBeVisible();

  await page.getByTestId("channel-title").click();
  await expect(page.getByRole("menuitemradio", { name: "All messages" })).toHaveCount(0);
  await expect(page.getByTestId("conversation-notifications")).toHaveAttribute("aria-expanded", "false");
});

test("direct messages notify by default while group DMs use the global rule", async ({ page }) => {
  const third = await registerUser(page, {
    username: `notify.group${Date.now()}`,
    displayName: "Notify Group",
  });
  await requestAsToken(page, third.token, "/users/me/onboarded", { method: "POST" });
  const group = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userIds: [fixture.bob.id, third.user.id] },
  });
  await requestAsToken(page, fixture.alice.token, "/users/notification-settings", {
    method: "PUT",
    body: { defaults: "mentions" },
  });

  await page.goto(`/dms/${group.channel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();

  await sendAsBob(page, fixture.dmChannel.id, `direct message default ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(1);

  await page.goto(`/dms/${fixture.dmChannel.id}`);
  await page.getByTestId("conversation-notifications").click();
  await page.getByRole("menuitemradio", { name: "Mute conversation" }).click();
  await expect(page.getByText("Notification preference updated")).toBeVisible();
  await expect.poll(() => notificationCount(page)).toBe(0);
  await sendAsBob(page, fixture.dmChannel.id, `muted direct message ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(0);

  await sendAsBob(page, group.channel.id, `ordinary group DM ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(0);
  await sendAsBob(page, group.channel.id, `@${fixture.alice.username} group mention ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(1);
});

test("clicking channel and DM notifications opens their conversations", async ({ page }) => {
  await requestAsToken(page, fixture.alice.token, "/users/notification-settings", {
    method: "PUT",
    body: { defaults: "all" },
  });
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.waitForTimeout(500);

  const channelMessage = await sendAsBob(page, fixture.generalChannel.id, `open channel notification ${Date.now()}`);
  const dmMessage = await sendAsBob(page, fixture.dmChannel.id, `open DM notification ${Date.now()}`);
  await expect.poll(() => notificationCount(page)).toBe(2);

  await page.evaluate((channelId) => window.__e2eNotifications.find((n) => n.options?.tag === channelId)?.onclick?.(), fixture.generalChannel.id);
  await expect(page).toHaveURL(new RegExp(`/channels/${fixture.generalChannel.id}\\?message=${channelMessage.message.id}$`));
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect(page.locator(`[data-mid="${channelMessage.message.id}"]`)).toHaveClass(/flash/);

  await page.evaluate((channelId) => window.__e2eNotifications.find((n) => n.options?.tag === channelId)?.onclick?.(), fixture.dmChannel.id);
  await expect(page).toHaveURL(new RegExp(`/dms/${fixture.dmChannel.id}\\?message=${dmMessage.message.id}$`));
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect(page.locator(`[data-mid="${dmMessage.message.id}"]`)).toHaveClass(/flash/);
});

test("thread follow can be toggled, persists after reload, and is per-user", async ({ page }) => {
  const rootId = fixture.messages.threadRoot.id;
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.getByTestId(`message-${rootId}-reply-count`).click();
  const toggle = page.getByTestId("thread-follow-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(page.getByText("Thread notification preference updated")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await getThreadFollow(page, fixture.alice.token, fixture.projectChannel.id, rootId)).following).toBe(true);
  expect((await getThreadFollow(page, fixture.bob.token, fixture.projectChannel.id, rootId)).following).toBe(false);

  await page.reload();
  await page.getByTestId(`message-${rootId}-reply-count`).click();
  await expect(page.getByTestId("thread-follow-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("thread-follow-toggle").click();
  await expect.poll(async () => (await getThreadFollow(page, fixture.alice.token, fixture.projectChannel.id, rootId)).following).toBe(false);
});

test("starting a thread and replying to one automatically follows it", async ({ page }) => {
  const started = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.projectChannel.id, body: `Thread Alice started ${Date.now()}` },
  });
  await expect.poll(async () => (await getThreadFollow(page, fixture.alice.token, fixture.projectChannel.id, started.message.id)).following).toBe(true);

  const rootId = fixture.messages.threadRoot.id;
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.getByTestId(`message-${rootId}-reply-count`).click();
  const replyBody = `Alice joins thread ${Date.now()}`;
  await page.getByTestId("thread-panel").getByTestId("composer-editor").fill(replyBody);
  await page.getByTestId("thread-panel").getByTestId("composer-send").click();
  await expect(page.locator(".thread-panel .message").filter({ hasText: replyBody })).toBeVisible();
  await expect.poll(async () => (await getThreadFollow(page, fixture.alice.token, fixture.projectChannel.id, rootId)).following).toBe(true);
});

test("replies in a followed thread notify through a muted channel and jump to the reply", async ({ page }) => {
  const channelId = fixture.projectChannel.id;
  const rootId = fixture.messages.threadRoot.id;
  await setConversationRule(page, channelId, "mute");
  await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/threads/${rootId}/follow`, {
    method: "PUT",
    body: { following: true },
  });
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.waitForTimeout(500);

  const reply = await sendAsBob(page, channelId, `Followed thread reply ${Date.now()}`, rootId);
  await expect.poll(() => notificationCount(page)).toBe(1);
  await page.evaluate((id) => window.__e2eNotifications.find((notification) => notification.options?.tag === id)?.onclick?.(), channelId);
  await expect(page).toHaveURL(new RegExp(`/channels/${channelId}\\?message=${reply.message.id}&thread=${rootId}$`));
  await expect(page.locator(`[data-mid="${reply.message.id}"]`)).toHaveClass(/flash/);
});

test("unfollowed thread replies stay muted with their conversation", async ({ page }) => {
  const channelId = fixture.projectChannel.id;
  const rootId = fixture.messages.threadRoot.id;
  await setConversationRule(page, channelId, "mute");
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.waitForTimeout(500);

  await sendAsBob(page, channelId, `Unfollowed thread reply ${Date.now()}`, rootId);
  await expect.poll(() => notificationCount(page)).toBe(0);
});

test("turning off a followed thread stops later replies but keeps direct mentions", async ({ page }) => {
  const channelId = fixture.projectChannel.id;
  const rootId = fixture.messages.threadRoot.id;
  await setConversationRule(page, channelId, "all");
  await page.goto(`/channels/${channelId}`);
  await page.getByTestId(`message-${rootId}-reply-count`).click();
  const toggle = page.getByTestId("thread-follow-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await sendAsBob(page, channelId, `Followed thread reply ${Date.now()}`, rootId);
  await expect.poll(() => notificationCount(page)).toBe(1);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await getThreadFollow(page, fixture.alice.token, channelId, rootId)).muted).toBe(true);
  await sendAsBob(page, channelId, `Muted thread reply ${Date.now()}`, rootId);
  await expect.poll(() => notificationCount(page)).toBe(1);

  await sendAsBob(page, channelId, `@${fixture.alice.username} muted thread mention ${Date.now()}`, rootId);
  await expect.poll(() => notificationCount(page)).toBe(2);
});

test("a mention in an unfollowed thread still notifies under mentions-only settings", async ({ page }) => {
  const channelId = fixture.projectChannel.id;
  const rootId = fixture.messages.threadRoot.id;
  await requestAsToken(page, fixture.alice.token, "/users/notification-settings", {
    method: "PUT",
    body: { defaults: "mentions" },
  });
  await page.goto(`/channels/${fixture.generalChannel.id}`);
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await page.waitForTimeout(500);

  await sendAsBob(page, channelId, `@${fixture.alice.username} unfollowed thread mention ${Date.now()}`, rootId);
  await expect.poll(() => notificationCount(page)).toBe(1);
});
