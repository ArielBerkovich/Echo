import { expect, test } from "@playwright/test";
import {
  channelRow,
  messageById,
  messageByText,
  requestAsToken,
  seedWorkspaceFixture,
  slug,
  uploadAsToken,
  railItem,
} from "./helpers.js";

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
  const presenceMessage = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Presence check ${Date.now()}`,
      externalKey: `presence-${slug(String(Date.now()))}`,
    },
  });

  await withAliceBobPages(browser, async ({ alicePage, bobPage, bob }) => {
    await channelRow(alicePage.page, "general").click();
    await messageById(alicePage.page, presenceMessage.message.id).locator(".author-btn").click();
    await expect(alicePage.page.getByTestId("profile-presence")).toContainText("Active");
    await alicePage.page.getByTestId("profile-close").click();

    await channelRow(bobPage.page, "general").click();

    const typing = `Typing ${Date.now()}`;
    await bobPage.page.getByTestId("composer-editor").fill(typing);
    await expect(alicePage.page.getByTestId("typing-indicator")).toContainText(
      `${bob.displayName} is typing`
    );
  });
});

test("bumps unread counts and reflects live edits and deletes", async ({ browser, page }) => {
  const { alice, bob, projectChannel } = fixture;
  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await channelRow(alicePage.page, projectChannel.name).click();
    await channelRow(bobPage.page, "general").click();

    const liveBody = `Realtime ${Date.now()}`;
    await bobPage.page.getByTestId("composer-editor").fill(liveBody);
    await bobPage.page.getByTestId("composer-editor").press("Enter");

    await expect(
      channelRow(alicePage.page, "general").locator(".unread-badge")
    ).toBeVisible();

    await channelRow(alicePage.page, "general").click();
    const liveMessage = messageByText(alicePage.page, liveBody).first();
    await expect(liveMessage).toBeVisible();

    const liveMessageOnBob = messageByText(bobPage.page, liveBody).first();
    await liveMessageOnBob.hover();
    await bobPage.page.getByTestId(/-actions$/).getByTitle("More message actions").click();
    await bobPage.page.getByRole("menuitem", { name: "Edit message" }).click();
    const editComposer = bobPage.page.getByTestId("composer-editor");
    await expect(bobPage.page.getByTestId("composer-editing")).toBeVisible();
    await expect(editComposer).toHaveText(liveBody);
    await editComposer.fill(`${liveBody} updated`);
    await bobPage.page.getByTestId("composer-send").click();
    await expect(liveMessage).toContainText("updated");
    await expect(liveMessage).toContainText("(edited)");

    const updatedLiveMessageOnBob = messageByText(bobPage.page, `${liveBody} updated`).first();
    await updatedLiveMessageOnBob.hover();
    await bobPage.page.getByTestId(/-actions$/).getByTitle("More message actions").click();
    await bobPage.page.getByRole("menuitem", { name: "Delete message" }).click();
    await bobPage.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(messageByText(alicePage.page, `${liveBody} updated`)).toHaveCount(0);
  });
});

test("recovers missed messages after a temporary server outage", async ({ browser, page }) => {
  const { alice, bob, generalChannel } = fixture;
  const alicePage = await newAuthedPage(browser, alice.token);

  try {
    await alicePage.page.goto("/");
    await channelRow(alicePage.page, generalChannel.name).click();
    await expect(alicePage.page.getByTestId("channel-view")).toBeVisible();

    await alicePage.context.setOffline(true);
    await expect(alicePage.page.getByTestId("connection-banner")).toContainText("Reconnecting to Echo");

    const missedBody = `Missed during restart ${Date.now()}`;
    await requestAsToken(page, bob.token, `/channels/${generalChannel.id}/messages`, {
      method: "POST",
      body: { body: missedBody },
    });

    await alicePage.context.setOffline(false);
    await expect(alicePage.page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 20_000 });
    await expect(messageByText(alicePage.page, missedBody)).toBeVisible();
    await expect.poll(() => alicePage.page.evaluate(() => localStorage.getItem("echo.token"))).toBe(alice.token);
  } finally {
    await alicePage.context.setOffline(false).catch(() => {});
    await alicePage.context.close();
  }
});

test("updates user search results after a display name change", async ({ browser, page }) => {
  const { alice } = fixture;
  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await bobPage.page.getByTestId("search-input").fill(alice.username);
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
    const input = bobPage.page.getByTestId("search-input");
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

test("updates a browsed channel when another member adds the current user", async ({ browser, page }) => {
  const { alice, bob } = fixture;
  await withAliceBobPages(browser, async ({ alicePage }) => {
    const channelName = `live-membership-${Date.now()}`;
    const created = await requestAsToken(page, bob.token, "/channels", {
      method: "POST",
      body: { name: channelName, type: "public" },
    });

    await alicePage.page.getByTestId("browse-channels").click();
    await alicePage.page.getByTestId("channel-browser-search").fill(channelName);
    const row = alicePage.page.getByTestId(`browse-channel-${channelName}`);
    await expect(row.getByRole("button", { name: `Join #${channelName}` })).toBeVisible();

    await requestAsToken(page, bob.token, `/channels/${created.channel.id}/members`, {
      method: "POST",
      body: { userId: alice.id },
    });

    await expect(row.getByRole("button", { name: `Open #${channelName}`, exact: true })).toBeVisible();
    await expect(row).toContainText("2 members");
  });
});

test("updates an open members panel when another user joins from Browse", async ({ browser, page }) => {
  const { alice, bob } = fixture;
  const channelName = `live-self-join-${Date.now()}`;
  await requestAsToken(page, bob.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });

  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await bobPage.page.getByTestId(`channel-row-${channelName}`).click();
    await bobPage.page.getByTestId("channel-members").click();
    const membersPanel = bobPage.page.getByTestId("members-panel");
    await expect(membersPanel).toBeVisible();
    await expect(membersPanel).not.toContainText(alice.displayName);

    await alicePage.page.getByTestId("browse-channels").click();
    await alicePage.page.getByTestId("channel-browser-search").fill(channelName);
    await alicePage.page
      .getByTestId(`browse-channel-${channelName}`)
      .getByRole("button", { name: `Join #${channelName}` })
      .click();

    await expect(membersPanel).toContainText(alice.displayName);
    await expect(membersPanel).toContainText("2 people");
  });
});

test("updates the typing indicator after a display name change", async ({ browser, page }) => {
  const { alice } = fixture;
  await withAliceBobPages(browser, async ({ alicePage, bobPage }) => {
    await channelRow(alicePage.page, "general").click();
    await channelRow(bobPage.page, "general").click();

    const updatedName = `${alice.displayName} Renamed`;
    await requestAsToken(page, alice.token, "/users/me", {
      method: "PATCH",
      body: { displayName: updatedName },
    });

    const typing = `Typing ${Date.now()}`;
    await alicePage.page.getByTestId("composer-editor").fill(typing);

    await expect(bobPage.page.getByTestId("typing-indicator")).toContainText(`${updatedName} is typing`);
  });
});

test("updates an open channel message avatar after a profile picture change", async ({ browser, page }) => {
  const { alice, bob } = fixture;
  await requestAsToken(page, alice.token, "/users/me", {
    method: "PATCH",
    body: { avatarKey: null },
  });
  const avatarMessage = await requestAsToken(page, alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Avatar check ${Date.now()}`,
      externalKey: `avatar-${slug(String(Date.now()))}`,
    },
  });

  await withAliceBobPages(browser, async ({ bobPage }) => {
    await channelRow(bobPage.page, "general").click();
    const message = messageById(bobPage.page, avatarMessage.message.id);
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
    await expect(bobPage.page.getByTestId("activity-header")).toBeVisible();
    await expect.poll(async () => {
      const activity = await requestAsToken(bobPage.page, bob.token, "/activity");
      return activity.items.some(
        (item) => item.kind === "channel_remove" && item.channelName === channelName
      );
    }, { timeout: 10_000 }).toBe(true);

    await bobPage.page.reload();
    await railItem(bobPage.page, "activity").click();
    await expect(
      bobPage.page.getByTestId("activity-item").filter({ hasText: `removed you from #${channelName}` })
    ).toBeVisible({ timeout: 10_000 });
  });
});
