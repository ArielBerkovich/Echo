import { expect, test } from "@playwright/test";
import { requestAsToken, seedToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("sends an underscore username mention through the composer", async ({ page }) => {
  const directory = await requestAsToken(page, fixture.alice.token, "/users");
  const dev = (directory.users || []).find((user) => user.username.includes("_"));
  test.skip(!dev, "requires an existing RHSSO-backed username containing an underscore");
  await seedToken(page, fixture.alice.token);
  await page.goto("/channels/general");

  const editor = page.getByTestId("composer-editor");
  await editor.fill(`@${dev.username}`);
  const suggestion = page.locator(".mention-item").filter({ hasText: dev.username });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await page.getByTestId("composer-send").click();

  const message = page.locator(".message").filter({ has: page.locator(`[data-mention="${dev.username}"]`) }).last();
  await expect(message).toBeVisible();
  await expect(message.locator(`[data-mention="${dev.username}"]`)).toHaveText(`@${dev.displayName}`);
});

test("suggests and renders a public channel for a reader who has not joined", async ({ page, browser }) => {
  const channelName = `public-mention-${uniqueSuffix("channel").replace(/[^a-z0-9-]/gi, "").slice(-18)}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  const channel = created.channel;
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();

  try {
    await seedToken(bobPage, fixture.bob.token);
    await bobPage.goto("/channels/general");
    const editor = bobPage.getByTestId("composer-editor");
    await editor.fill(`#${channelName}`);
    const suggestion = bobPage.locator(".mention-item").filter({ hasText: `#${channelName}` });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(editor).toContainText(`#${channelName}`);

    const posted = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.generalChannel.id,
        body: `Alice tagged #${channelName}`,
        externalKey: uniqueSuffix("alice-channel-mention"),
      },
    });

    const sent = await requestAsToken(page, fixture.alice.token, `/channels/${fixture.generalChannel.id}/messages`);
    const message = sent.messages.find((item) => item.id === posted.message.id);
    expect(message?.mentionedChannels).toEqual([{ channelId: channel.id, name: channelName }]);

    const readerMessage = bobPage.locator(".message").filter({ has: bobPage.locator(`[data-channel-id="${channel.id}"]`) }).last();
    await expect(readerMessage.locator(`[data-channel-id="${channel.id}"]`)).toHaveText(`#${channelName}`);
    await readerMessage.locator(`[data-channel-id="${channel.id}"]`).click();
    await expect(bobPage.getByTestId("channel-title")).toContainText(channelName);
  } finally {
    await bobContext.close();
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}`, { method: "DELETE" });
  }
});

test("shows an unavailable message when a tagged channel is archived", async ({ page, browser }) => {
  const channelName = `archived-mention-${uniqueSuffix("channel").replace(/[^a-z0-9-]/gi, "").slice(-18)}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  const channel = created.channel;
  await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `Old link #${channelName}`, externalKey: uniqueSuffix("archived-tag") },
  });
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}`, { method: "DELETE" });
    await seedToken(bobPage, fixture.bob.token);
    await bobPage.goto("/channels/general");
    const tag = bobPage.locator(`[data-channel-id="${channel.id}"]`);
    await expect(tag).toBeVisible();
    await tag.click();
    await expect(bobPage.getByText("That channel is no longer available.")).toBeVisible();
  } finally {
    await bobContext.close();
  }
});
