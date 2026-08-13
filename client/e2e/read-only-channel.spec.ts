import { expect, test } from "@playwright/test";
import {
  requestAsToken,
  seedToken,
  seedWorkspaceFixture,
  slug,
  uniqueSuffix,
} from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function rawApi(page, token, path, options: { method?: string; body?: unknown } = {}) {
  return page.request.fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: options.body,
  });
}

async function removeTestChannel(page, channelId) {
  await rawApi(page, fixture.alice.token, `/channels/${channelId}/members/${fixture.bob.id}`, {
    method: "DELETE",
  });
  await rawApi(page, fixture.alice.token, `/channels/${channelId}`, { method: "DELETE" });
}

test("creates a managers-only channel from advanced options and enforces posting access", async ({ browser, page }) => {
  const channelName = `readonly-create-${uniqueSuffix("channel")}`.toLowerCase();
  let channelId;
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();

  try {
    await page.goto("/");
    await page.getByTestId("create-channel").click();
    await page.getByTestId("create-channel-name").fill(channelName);
    await page.getByRole("button", { name: "Advanced options" }).click();
    const toggle = page.getByTestId("create-channel-readonly-toggle");
    await expect(toggle).not.toBeChecked();
    await page.locator("label.channel-readonly-toggle").click();
    await expect(toggle).toBeChecked();
    await page.getByTestId("create-channel-submit").click();

    await expect(page.getByTestId("channel-title")).toContainText(channelName);
    const created = await requestAsToken(page, fixture.alice.token, `/channels/by-name/${channelName}`);
    channelId = created.channel.id;
    expect(created.channel.readOnly).toBe(true);

    await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/members`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });
    const root = await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Managers-only thread root" },
    });

    await seedToken(bobPage, fixture.bob.token);
    await bobPage.goto("/");
    await bobPage.getByTestId(`channel-row-${slug(channelName)}`).click();
    await expect(bobPage.getByTestId("channel-readonly-notice")).toBeVisible();
    await expect(bobPage.getByTestId("composer-editor")).toHaveCount(0);

    const bobPost = await rawApi(page, fixture.bob.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Member post should be rejected" },
    });
    expect(bobPost.status()).toBe(403);
    const bobReply = await rawApi(page, fixture.bob.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Member reply should be rejected", parentId: root.message.id },
    });
    expect(bobReply.status()).toBe(403);

    const alicePost = await rawApi(page, fixture.alice.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Creator post should be accepted" },
    });
    expect(alicePost.status()).toBe(201);
    const aliceReply = await rawApi(page, fixture.alice.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Creator reply should be accepted", parentId: root.message.id },
    });
    expect(aliceReply.status()).toBe(201);

    await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/managers`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });
    await bobPage.reload();
    await expect(bobPage.getByTestId("composer-editor")).toBeVisible();

    const managerPost = await rawApi(page, fixture.bob.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Manager post should be accepted" },
    });
    expect(managerPost.status()).toBe(201);
    const managerReply = await rawApi(page, fixture.bob.token, `/channels/${channelId}/messages`, {
      method: "POST",
      body: { body: "Manager reply should be accepted", parentId: root.message.id },
    });
    expect(managerReply.status()).toBe(201);
  } finally {
    if (channelId) await removeTestChannel(page, channelId);
    await bobContext.close();
  }
});

test("toggles managers-only mode from channel details and persists after reload", async ({ browser, page }) => {
  const channelName = `readonly-settings-${uniqueSuffix("channel")}`.toLowerCase();
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  const channelId = created.channel.id;
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();

  try {
    await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/members`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });

    await page.goto("/");
    await page.getByTestId(`channel-row-${slug(channelName)}`).click();
    await page.getByTestId("channel-title").click();
    const details = page.getByTestId("channel-details-dialog");
    const toggle = details.getByTestId("channel-readonly-toggle");
    await expect(toggle).not.toBeChecked();
    await details.locator("label.channel-readonly-toggle").click();
    await expect(toggle).toBeChecked();
    await expect(details).toContainText("Only the channel creator and managers can post messages and replies.");
    await details.getByRole("button", { name: "Close channel details" }).click();

    await page.reload();
    await page.getByTestId("channel-title").click();
    await expect(page.getByTestId("channel-details-dialog").getByTestId("channel-readonly-toggle")).toBeChecked();

    await seedToken(bobPage, fixture.bob.token);
    await bobPage.goto(`/channels/${channelName}`);
    await expect(bobPage.getByTestId("channel-readonly-notice")).toBeVisible();
    await expect(bobPage.getByTestId("composer-editor")).toHaveCount(0);

    await page.getByTestId("channel-details-dialog").locator("label.channel-readonly-toggle").click();
    await expect(page.getByTestId("channel-details-dialog").getByTestId("channel-readonly-toggle")).not.toBeChecked();
    await bobPage.reload();
    await expect(bobPage.getByTestId("composer-editor")).toBeVisible();
  } finally {
    await removeTestChannel(page, channelId);
    await bobContext.close();
  }
});
