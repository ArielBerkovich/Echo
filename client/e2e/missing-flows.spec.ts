import { expect, test } from "@playwright/test";
import {
  channelRow,
  messageById,
  messageByText,
  openLocalAuth,
  registerUser,
  requestAsToken,
  seedToken,
  seedWorkspaceFixture,
  slug,
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

async function rawApi(page, token, path, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return page.request.fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    data: options.body,
  });
}

test("enforces channel manager boundaries and deletes an empty owned channel", async ({ browser, page }) => {
  const name = `permissions-${uniqueSuffix("channel")}`.toLowerCase();
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name, type: "private" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });

  const promote = await rawApi(page, fixture.bob.token, `/channels/${created.channel.id}/managers`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  expect(promote.status()).toBe(403);
  const removeOwner = await rawApi(page, fixture.bob.token, `/channels/${created.channel.id}/members/${fixture.alice.id}`, {
    method: "DELETE",
  });
  expect(removeOwner.status()).toBe(403);
  const deleteAsMember = await rawApi(page, fixture.bob.token, `/channels/${created.channel.id}`, { method: "DELETE" });
  expect(deleteAsMember.status()).toBe(403);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await seedToken(bobPage, fixture.bob.token);
  try {
    await bobPage.goto("/");
    await expect(bobPage.getByTestId(`channel-row-${slug(name)}`)).toBeVisible();

    await page.goto("/");
    await page.getByTestId(`channel-row-${slug(name)}`).click();
    await page.getByTestId("channel-title").click();
    const details = page.getByTestId("channel-details-dialog");
    await details.getByPlaceholder("Search members").fill(fixture.bob.username);
    await details.getByTestId(`channel-remove-${fixture.bob.id}`).click();
    await expect(details).not.toContainText(`@${fixture.bob.username}`);
    await expect(bobPage.getByTestId(`channel-row-${slug(name)}`)).toHaveCount(0);

    await details.getByRole("button", { name: "Close channel details" }).click();
    await page.getByRole("button", { name: "Leave channel" }).click();
    await page.getByRole("button", { name: "Delete channel" }).click();
    await expect(page.getByTestId(`channel-row-${slug(name)}`)).toHaveCount(0);
    const archived = await rawApi(page, fixture.alice.token, `/channels/${created.channel.id}`);
    expect(archived.status()).toBe(404);
  } finally {
    await bobContext.close();
  }
});

test("registers a new user, completes onboarding, sends a message, and restores the session", async ({ browser }) => {
  const letters = Date.now().toString(36).replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)));
  const firstName = `Flow${letters}`.slice(0, 24);
  const username = `${firstName.toLowerCase()}.tester`;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/");
    await openLocalAuth(page);
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByLabel("First name").fill(firstName);
    await page.getByLabel("Last name").fill("Tester");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Password", { exact: true }).fill("Password1");
    await page.getByLabel("Confirm password").fill("Password1");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Welcome to Echo 👋")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Skip tour" }).click();
    const body = `First message ${uniqueSuffix("signup")}`;
    await page.getByTestId("composer-editor").fill(body);
    await page.getByTestId("composer-editor").press("Enter");
    await expect(messageByText(page, body)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("echo.token"))).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId("rail-settings")).toBeVisible();
    await expect(page.getByTestId("rail-account-name")).toContainText(firstName);
    await expect(messageByText(page, body)).toBeVisible();
    await expect(page.getByText("Welcome to Echo 👋")).toHaveCount(0);

    const login = await page.request.post("/api/auth/login", { data: { username, password: "Password1" } });
    expect(login.ok()).toBeTruthy();
  } finally {
    await context.close();
  }
});

test("changes a local user's password and invalidates the old credential", async ({ browser, page }) => {
  const suffix = uniqueSuffix("password").replace(/[^a-z0-9]/gi, "").slice(-12);
  const username = `password.user${suffix}`;
  const user = await registerUser(page, { username, displayName: "Password User" });
  await requestAsToken(page, user.token, "/users/me/onboarded", { method: "POST" });

  const context = await browser.newContext();
  const settingsPage = await context.newPage();
  await seedToken(settingsPage, user.token);
  try {
    await settingsPage.goto("/");
    await settingsPage.getByTestId("rail-settings").click();
    const form = settingsPage.getByTestId("change-password-form");
    await form.getByTestId("current-password").fill("WrongPassword1");
    await form.getByTestId("new-password").fill("Password2");
    await form.getByTestId("confirm-new-password").fill("Password2");
    await form.getByTestId("change-password-submit").click();
    await expect(settingsPage.getByTestId("settings-page")).toContainText("current password is incorrect");

    await form.getByTestId("current-password").fill("Password1");
    await form.getByTestId("change-password-submit").click();
    await expect(settingsPage.getByTestId("settings-page")).toContainText("Password updated ✓");
  } finally {
    await context.close();
  }

  const oldLogin = await page.request.post("/api/auth/login", { data: { username, password: "Password1" } });
  expect(oldLogin.status()).toBe(401);
  const newLogin = await page.request.post("/api/auth/login", { data: { username, password: "Password2" } });
  expect(newLogin.ok()).toBeTruthy();
});

test("hides password settings for an SSO-authenticated user", async ({ page }) => {
  await seedToken(page, fixture.alice.token);
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, user: { ...body.user, canChangePassword: false } },
    });
  });

  await page.goto("/");
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("sso-password-settings")).toBeVisible();
  await expect(page.getByTestId("change-password-form")).toHaveCount(0);
});

test("configures one personal mention webhook from Settings", async ({ page }) => {
  await seedToken(page, fixture.alice.token);
  await page.goto("/");
  await page.getByTestId("rail-settings").click();
  const webhookLoaded = page.waitForResponse((response) => response.url().includes("/api/mention-webhook") && response.request().method() === "GET");
  await page.getByRole("button", { name: "Webhooks" }).click();
  await webhookLoaded;

  const settings = page.getByTestId("mention-webhook-settings");
  await settings.getByTestId("mention-webhook-url").fill("https://hooks.example.test/alice");
  await settings.getByTestId("mention-webhook-save").click();
  await expect(settings).toContainText("Saved ✓");
  await expect(settings.getByTestId("mention-webhook-secret")).toHaveValue(/.+/);
  await expect(settings).toContainText("Before accepting an event");
  await expect(settings).toContainText("user_mentioned");
  await expect(settings).toContainText("direct_message");
  await expect(settings.getByTestId("mention-webhook-copy-secret")).toHaveText("Copy");

  const first = await requestAsToken(page, fixture.alice.token, "/mention-webhook");
  expect(first.webhook).toMatchObject({ url: "https://hooks.example.test/alice", enabled: true });

  await settings.getByTestId("mention-webhook-url").fill("https://hooks.example.test/alice-v2");
  await settings.getByTestId("mention-webhook-save").click();
  const updated = await requestAsToken(page, fixture.alice.token, "/mention-webhook");
  expect(updated.webhook).toMatchObject({ id: first.webhook.id, url: "https://hooks.example.test/alice-v2", enabled: true });

  const bobView = await requestAsToken(page, fixture.bob.token, "/mention-webhook");
  expect(bobView.webhook).toBeNull();
});

test("creates, delivers through, lists, and revokes an incoming webhook", async ({ page }) => {
  await page.goto("/");
  await channelRow(page, "general").click();
  const hookName = uniqueSuffix("webhook");
  const create = await rawApi(page, fixture.alice.token, "/webhooks", {
    method: "POST",
    body: { name: hookName, channelId: fixture.generalChannel.id },
  });
  expect(create.status()).toBe(201);
  const { webhook, token } = await create.json();

  const key = uniqueSuffix("webhook-idem");
  const delivered = await rawApi(page, "", `/webhooks/${token}`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: { title: "Webhook deploy", status: "success" },
  });
  expect(delivered.status()).toBe(201);
  const deliveredBody = await delivered.json();
  // Incoming webhooks persist a message but do not promise a websocket event
  // to the current browser session. Refresh the channel before asserting the
  // persisted delivery so this test is deterministic under parallel E2E load.
  await page.reload();
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect(messageById(page, deliveredBody.message.id)).toContainText("Webhook deploy");
  const retry = await rawApi(page, "", `/webhooks/${token}`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: { title: "Should not duplicate" },
  });
  expect((await retry.json()).message.id).toBe(deliveredBody.message.id);

  const listed = await requestAsToken(page, fixture.alice.token, "/webhooks");
  expect(listed.webhooks.some((item) => item.id === webhook.id && item.name === hookName)).toBe(true);
  const removed = await rawApi(page, fixture.alice.token, `/webhooks/${webhook.id}`, { method: "DELETE" });
  expect(removed.ok()).toBeTruthy();
  const revoked = await rawApi(page, "", `/webhooks/${token}`, { method: "POST", body: { body: "late" } });
  expect(revoked.status()).toBe(404);
});

test("defaults desktop notifications on, filters events, and navigates when one is clicked", async ({ page }) => {
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
  await page.goto("/settings");
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await expect(page.getByText("On ✓")).toBeVisible();
  await page.evaluate(() => { window.__e2eNotifications.length = 0; });
  await page.getByTestId("rail-home").click();

  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `ordinary ${Date.now()}`, externalKey: uniqueSuffix("ordinary") },
  });
  await expect.poll(() => page.evaluate(() => window.__e2eNotifications.length)).toBe(0);
  const mentionText = `notify @${fixture.alice.username} ${Date.now()}`;
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: mentionText, externalKey: uniqueSuffix("notify") },
  });
  await expect.poll(() => page.evaluate(() => window.__e2eNotifications.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__e2eNotifications[0]?.title)).toContain("Mention from");

  await page.getByRole("button", { name: "DMs" }).click();
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.dmChannel.id, body: `notification dm ${Date.now()}`, externalKey: uniqueSuffix("notify-dm") },
  });
  await expect.poll(() => page.evaluate(() => window.__e2eNotifications.length)).toBe(2);
  await page.evaluate(() => window.__e2eNotifications[0].onclick?.());
  await expect(page.getByTestId("channel-title")).toContainText("general");

  await page.getByTestId("rail-settings").click();
  await page.getByTestId("notification-toggle").click();
  await expect(page.getByText("On ✓")).toHaveCount(0);
});

test("opens, zooms, and downloads authenticated attachments", async ({ page }) => {
  const image = (await uploadAsToken(page, fixture.alice.token, {
    name: "lightbox.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  })).attachments[0];
  const file = (await uploadAsToken(page, fixture.alice.token, {
    name: "download.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("protected attachment", "utf8"),
  })).attachments[0];
  const sent = await rawApi(page, fixture.alice.token, `/channels/${fixture.generalChannel.id}/messages`, {
    method: "POST",
    body: { body: `Attachment controls ${Date.now()}`, attachments: [image, file] },
  });
  const { message } = await sent.json();

  await page.goto("/");
  const row = messageById(page, message.id);
  await expect(row).toBeVisible();
  await row.getByTestId(`image-attachment-${image.key}`).click();
  const lightbox = page.getByTestId("attachment-lightbox");
  await expect(lightbox).toBeVisible();
  await expect(lightbox).toContainText(fixture.alice.displayName);
  await expect(lightbox).toContainText("lightbox.png");

  const zoomIn = lightbox.getByRole("button", { name: "Zoom in" });
  const zoomOut = lightbox.getByRole("button", { name: "Zoom out" });
  await expect(zoomOut).toBeDisabled();

  await lightbox.locator(".lightbox-img").click();
  await expect(lightbox.getByTestId("lightbox-zoom-label")).toHaveText("250%");
  await lightbox.locator(".lightbox-img").click();
  await expect(lightbox.getByTestId("lightbox-zoom-label")).toHaveText("100%");

  await zoomIn.click();
  await expect(lightbox.getByTestId("lightbox-zoom-label")).toHaveText("150%");
  await page.keyboard.down("Control");
  await page.keyboard.press("=");
  await page.keyboard.up("Control");
  await expect(lightbox.getByTestId("lightbox-zoom-label")).toHaveText("200%");
  for (let i = 0; i < 4; i += 1) await zoomIn.click();
  await expect(lightbox.getByTestId("lightbox-zoom-label")).toHaveText("400%");
  await expect(zoomIn).toBeDisabled();
  await zoomOut.click();
  await expect(lightbox.getByTestId("lightbox-zoom-label")).toHaveText("350%");

  const imageDownload = page.waitForEvent("download");
  await lightbox.getByTestId("lightbox-download").click();
  await expect((await imageDownload).suggestedFilename()).toBe("lightbox.png");
  await page.keyboard.press("Escape");
  await expect(lightbox).not.toBeVisible();

  const fileDownload = page.waitForEvent("download");
  await row.getByTestId(`file-attachment-${file.key}`).click();
  await expect((await fileDownload).suggestedFilename()).toBe("download.bin");
  const anonymous = await page.request.get(`/api/files/${file.key}`);
  expect(anonymous.status()).toBe(401);
});

test("saves and unsaves a message entirely through message actions", async ({ page }) => {
  const body = `Save from UI ${uniqueSuffix("saved")}`;
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body, externalKey: uniqueSuffix("saved-message") },
  });
  await page.goto("/");
  const message = messageById(page, created.message.id);
  await message.hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Save for later" }).click();

  await page.getByTestId("rail-saved").click();
  const saved = page.getByTestId("saved-item").filter({ hasText: body });
  await expect(saved).toBeVisible();
  await saved.click();
  await expect(messageById(page, created.message.id)).toBeInViewport();
  await messageById(page, created.message.id).hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Remove from saved" }).click();
  await page.getByTestId("rail-saved").click();
  await expect(page.getByTestId("saved-item").filter({ hasText: body })).toHaveCount(0);
});

test("paginates search results, hides inaccessible messages, and surfaces request failures", async ({ page }) => {
  const keyword = `pageable${Date.now()}`;
  for (let index = 0; index < 22; index += 1) {
    await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.generalChannel.id,
        body: `${keyword} result ${index}`,
        externalKey: `${keyword}-${index}`,
      },
    });
  }
  const hidden = await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST",
    body: { name: `hidden-search-${uniqueSuffix("private")}`, type: "private" },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: hidden.channel.id, body: `${keyword} must stay private`, externalKey: uniqueSuffix("hidden") },
  });

  await page.goto("/");
  await page.getByTestId("search-input").fill(keyword);
  await page.getByTestId("search-input").press("Enter");
  await expect(page.getByTestId("search-result")).toHaveCount(20);
  await page.getByTestId("search-load-more").click();
  await expect(page.getByTestId("search-result")).toHaveCount(22);
  await expect(page.getByTestId("search-results")).not.toContainText("must stay private");

  await page.route("**/api/search/messages?q=forced-failure*", (route) =>
    route.fulfill({ status: 500, json: { error: "forced search failure" } })
  );
  await page.getByTestId("search-results-clear").click();
  await page.getByTestId("search-input").fill("forced-failure");
  await page.getByTestId("search-input").press("Enter");
  await expect(page.getByTestId("search-results")).toContainText("Search failed");
  await expect(page.getByTestId("search-results")).toContainText("Something went wrong on our end");
});

test("supports a core messaging, attachment, search, and settings flow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const usersResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/users" && response.request().method() === "GET");
  await page.goto("/");
  await usersResponse;
  await page.getByTestId("channel-row-general").click();
  const body = `Mobile flow ${uniqueSuffix("mobile")}`;
  await page.getByTestId("composer-editor").fill(body);
  await page.getByTitle("Attach files").click();
  await page.getByTestId("composer-attachments").setInputFiles({
    name: "mobile.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await page.getByTestId("composer-send").click();
  await expect(messageByText(page, body)).toBeVisible();
  await expect(messageByText(page, body).locator('img[alt="mobile.png"]')).toBeVisible();
  await expect(page.getByTestId("composer-editor")).toBeFocused();

  await expect(page.getByTestId("search-input")).toBeVisible();
  await page.getByTestId("search-input").fill(body);
  await page.getByTestId("search-input").press("Enter");
  await expect(page.getByTestId("search-result").filter({ hasText: body })).toBeVisible();
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
});
