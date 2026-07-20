import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, slug, uploadAsToken, railItem } from "./helpers.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8/5+hHgAHggJ/PFvdcQAAAABJRU5ErkJggg==",
  "base64"
);

let fixture;

async function newAuthedPage(browser, token) {
  const context = await browser.newContext();
  await context.addInitScript((value) => {
    localStorage.setItem("echo.token", value);
  }, token);
  const page = await context.newPage();
  return { context, page };
}

async function withAliceBobPages(browser, fn) {
  const { alice, bob } = fixture;
  const alicePage = await newAuthedPage(browser, alice.token);
  const bobPage = await newAuthedPage(browser, bob.token);

  try {
    await alicePage.page.goto("/");
    await bobPage.page.goto("/");
    await fn({ alicePage, bobPage, alice, bob });
  } finally {
    await alicePage.context.close();
    await bobPage.context.close();
  }
}

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("shows presence and typing across sessions", async ({ browser, page }) => {
  await withAliceBobPages(browser, async ({ alicePage, bobPage, alice, bob }) => {
    await alicePage.page
      .locator(".message")
      .filter({ hasText: `Heads up @${alice.username}` })
      .locator(".author-btn")
      .click();
    await expect(alicePage.page.locator(".profile-modal .profile-presence")).toContainText("Active");
    await alicePage.page.locator(".profile-modal .profile-close").click();

    await alicePage.page.locator(".channel-row").filter({ hasText: "general" }).click();
    await bobPage.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const typing = `Typing ${Date.now()}`;
    await bobPage.page.locator(".composer-editor").fill(typing);
    await expect(alicePage.page.locator(".typing-indicator")).toContainText(
      `${bob.displayName} is typing`
    );
  });
});

test("bumps unread counts and reflects live edits and deletes", async ({ browser, page }) => {
  const { alice, bob, projectChannel } = fixture;
  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await alicePage.page.locator(".channel-row").filter({ hasText: projectChannel.name }).click();
    await bobPage.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const liveBody = `Realtime ${Date.now()}`;
    await bobPage.page.locator(".composer-editor").fill(liveBody);
    await bobPage.page.locator(".composer-editor").press("Enter");

    await expect(
      alicePage.page.locator(".channel-row").filter({ hasText: "general" }).locator(".unread-badge")
    ).toBeVisible();

    await alicePage.page.locator(".channel-row").filter({ hasText: "general" }).click();
    const liveMessage = alicePage.page.locator(".message").filter({ hasText: liveBody }).first();
    await expect(liveMessage).toBeVisible();

    const liveMessageOnBob = bobPage.page.locator(".message").filter({ hasText: liveBody }).first();
    await liveMessageOnBob.hover();
    await bobPage.page.locator('[data-message-actions="true"]').getByTitle("More message actions").click();
    await bobPage.page.getByRole("menuitem", { name: "Edit message" }).click();
    await bobPage.page.locator(".msg-edit-input").fill(`${liveBody} updated`);
    await bobPage.page.locator(".msg-edit-actions .btn-primary").click();
    await expect(liveMessage).toContainText("updated");
    await expect(liveMessage).toContainText("(edited)");

    const updatedLiveMessageOnBob = bobPage.page
      .locator(".message")
      .filter({ hasText: `${liveBody} updated` })
      .first();
    await updatedLiveMessageOnBob.hover();
    await bobPage.page.locator('[data-message-actions="true"]').getByTitle("More message actions").click();
    await bobPage.page.getByRole("menuitem", { name: "Delete message" }).click();
    await bobPage.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(alicePage.page.locator(".message").filter({ hasText: `${liveBody} updated` })).toHaveCount(0);
  });
});

test("recovers missed messages after a temporary server outage", async ({ browser, page }) => {
  const { alice, bob, generalChannel } = fixture;
  const alicePage = await newAuthedPage(browser, alice.token);

  try {
    await alicePage.page.goto("/");
    await alicePage.page.locator(".channel-row").filter({ hasText: generalChannel.name }).click();
    await expect(alicePage.page.locator(".channel-view")).toBeVisible();

    await alicePage.context.setOffline(true);
    await expect(alicePage.page.locator(".connection-banner")).toContainText("reconnecting");

    const missedBody = `Missed during restart ${Date.now()}`;
    await requestAsToken(page, bob.token, `/channels/${generalChannel.id}/messages`, {
      method: "POST",
      body: { body: missedBody },
    });

    await alicePage.context.setOffline(false);
    await expect(alicePage.page.locator(".connection-banner")).toHaveCount(0, { timeout: 20_000 });
    await expect(alicePage.page.locator(".message").filter({ hasText: missedBody })).toBeVisible();
    await expect.poll(() => alicePage.page.evaluate(() => localStorage.getItem("echo.token"))).toBe(alice.token);
  } finally {
    await alicePage.context.setOffline(false).catch(() => {});
    await alicePage.context.close();
  }
});

test("updates user search results after a display name change", async ({ browser, page }) => {
  const { alice } = fixture;
  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await bobPage.page.locator(".search-input").fill(alice.username);
    const row = bobPage.page.getByTestId(`search-user-${slug(alice.username)}`);
    await expect(row).toContainText(alice.displayName);

    const updatedName = `${alice.displayName} Renamed`;
    await requestAsToken(page, alice.token, "/users/me", {
      method: "PATCH",
      body: { displayName: updatedName },
    });

    await expect(row).toContainText(updatedName);
  });
});

test("shows newly created public channels in search without refresh", async ({ browser, page }) => {
  const { alice } = fixture;
  await withAliceBobPages(browser, async ({ bobPage }) => {
    const channelName = `live-search-${Date.now()}`;
    const input = bobPage.page.locator(".search-input");
    await input.fill(channelName);

    const row = bobPage.page.getByTestId(`search-channel-${slug(channelName)}`);
    await expect(row).toHaveCount(0);

    await requestAsToken(page, alice.token, "/channels", {
      method: "POST",
      body: { name: channelName, type: "public" },
    });

    await expect(row).toBeVisible();
  });
});

test("updates the typing indicator after a display name change", async ({ browser, page }) => {
  const { alice } = fixture;
  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await alicePage.page.locator(".channel-row").filter({ hasText: "general" }).click();
    await bobPage.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const updatedName = `${alice.displayName} Renamed`;
    await requestAsToken(page, alice.token, "/users/me", {
      method: "PATCH",
      body: { displayName: updatedName },
    });

    const typing = `Typing ${Date.now()}`;
    await alicePage.page.locator(".composer-editor").fill(typing);

    await expect(bobPage.page.locator(".typing-indicator")).toContainText(`${updatedName} is typing`);
  });
});

test("updates an open channel message avatar after a profile picture change", async ({ browser, page }) => {
  const { alice, bob } = fixture;
  await withAliceBobPages(browser, async ({ bobPage }) => {
    const message = bobPage.page.getByTestId(`message-${fixture.messages.formatted.id}`);
    await expect(message).toBeVisible();
    await expect(message.locator(".avatar-img")).toHaveCount(0);

    const { attachments } = await uploadAsToken(page, alice.token, {
      name: "live-avatar.png",
      mimeType: "image/png",
      buffer: ONE_BY_ONE_PNG,
    });
    await requestAsToken(page, alice.token, "/users/me", {
      method: "PATCH",
      body: { avatarKey: attachments[0].key },
    });

    await expect(message.locator(".avatar-img")).toBeVisible();
    await expect(message.locator(".avatar-img")).toHaveAttribute("src", /^blob:/);
  });
});

test("shows a private-channel removal in Activity", async ({ browser, page }) => {
  const { alice, bob } = fixture;
  const channelName = `private-removal-${Date.now()}`;
  const created = await requestAsToken(page, alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "private" },
  });
  await requestAsToken(page, alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: bob.id },
  });

  await withAliceBobPages(browser, async ({ bobPage }) => {
    await requestAsToken(page, alice.token, `/channels/${created.channel.id}/members/${bob.id}`, {
      method: "DELETE",
    });

    await railItem(bobPage.page, "activity").click();
    await expect(
      bobPage.page.getByTestId("activity-item").filter({ hasText: `removed you from #${channelName}` })
    ).toBeVisible();
  });
});
