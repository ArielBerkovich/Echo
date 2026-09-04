import { expect, test } from "@playwright/test";
import { requestAsToken, seedToken, seedWorkspaceFixture, slug, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function createChannel(page, prefix, type = "public") {
  const name = `${prefix}-${uniqueSuffix("channel")}`;
  return (await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name, type },
  })).channel;
}

async function rawAsToken(page, token, path, options = {}) {
  return page.request.fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    data: options.body,
  });
}

async function deleteChannel(page, channelId) {
  await rawAsToken(page, fixture.alice.token, `/channels/${channelId}`, { method: "DELETE" });
}

test("blocks unjoined users from starring public and private channels", async ({ page, browser }) => {
  const publicChannel = await createChannel(page, "public-preview");
  const privateChannel = await createChannel(page, "private-preview", "private");
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await seedToken(bobPage, fixture.bob.token);

  try {
    await bobPage.goto(`/channels/${publicChannel.id}`);
    await expect(bobPage.getByRole("button", { name: "Join channel" })).toBeVisible();
    await expect(bobPage.getByTestId("channel-starred-toggle")).toHaveCount(0);

    const publicStar = await rawAsToken(page, fixture.bob.token, `/channels/${publicChannel.id}/star`, { method: "POST" });
    const privateStar = await rawAsToken(page, fixture.bob.token, `/channels/${privateChannel.id}/star`, { method: "POST" });
    expect(publicStar.status()).toBe(403);
    expect(privateStar.status()).toBe(403);
  } finally {
    await bobContext.close();
    await deleteChannel(page, publicChannel.id);
    await deleteChannel(page, privateChannel.id);
  }
});

test("clears a star on leave and does not restore it after rejoining", async ({ page }) => {
  const channel = await createChannel(page, "leave-reset");
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });

  try {
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/star`, { method: "POST" });
    await requestAsToken(page, fixture.bob.token, `/channels/${channel.id}/star`, { method: "POST" });
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/members/${fixture.bob.id}`, { method: "DELETE" });

    const bobStarsAfterRemoval = await requestAsToken(page, fixture.bob.token, "/users/vips");
    const aliceStarsAfterRemoval = await requestAsToken(page, fixture.alice.token, "/users/vips");
    expect(bobStarsAfterRemoval.channelIds).not.toContain(channel.id);
    expect(aliceStarsAfterRemoval.channelIds).toContain(channel.id);

    await requestAsToken(page, fixture.bob.token, `/channels/${channel.id}/join`, { method: "POST" });
    const bobStarsAfterRejoin = await requestAsToken(page, fixture.bob.token, "/users/vips");
    expect(bobStarsAfterRejoin.channelIds).not.toContain(channel.id);

    const bobStarAgain = await rawAsToken(page, fixture.bob.token, `/channels/${channel.id}/star`, { method: "POST" });
    expect(bobStarAgain.ok()).toBeTruthy();
  } finally {
    await rawAsToken(page, fixture.alice.token, `/channels/${channel.id}/members/${fixture.bob.id}`, { method: "DELETE" });
    await deleteChannel(page, channel.id);
  }
});

test("keeps the active channel open as a preview after leaving", async ({ page }) => {
  const channel = await createChannel(page, "active-leave");
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  try {
    await page.goto(`/channels/${channel.id}`);
    await expect(page.getByTestId("channel-title")).toContainText(channel.name);
    const previewUrl = page.url();
    await page.getByTestId("channel-leave").click();
    await expect(page.getByText("Choose a manager before leaving")).toBeVisible();
    await page.getByRole("button", { name: /Bob Builder/ }).click();
    await page.getByRole("button", { name: "Transfer & leave" }).click();

    await expect(page.getByTestId("channel-title")).toContainText(channel.name);
    await expect(page).toHaveURL(previewUrl);
    await expect(page.getByText(`You're previewing #${channel.name}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Join channel" })).toBeVisible();
    const previewFocusableOrder = await page.locator(".channel-main").evaluate((main) =>
      [...main.querySelectorAll("button, [href], input, select, textarea, [tabindex]")]
        .filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0)
        .map((element) => element.getAttribute("data-testid") || element.getAttribute("aria-label") || element.textContent?.trim())
    );
    expect(previewFocusableOrder[0]).toBe("join-channel");
    await expect(page.getByTestId("channel-starred-toggle")).toHaveCount(0);
    await expect(page.getByTestId("channel-leave")).toHaveCount(0);
    await expect(page.getByTestId("composer")).toHaveCount(0);

    const stars = await requestAsToken(page, fixture.alice.token, "/users/vips");
    expect(stars.channelIds).not.toContain(channel.id);
  } finally {
    await rawAsToken(page, fixture.alice.token, `/channels/${channel.id}/join`, { method: "POST" });
    await rawAsToken(page, fixture.alice.token, `/channels/${channel.id}/members/${fixture.bob.id}`, { method: "DELETE" });
    await deleteChannel(page, channel.id);
  }
});

test("removes a removed member's star live while preserving other stars and the preview URL", async ({ page, browser }) => {
  const removedChannel = await createChannel(page, "removed-live");
  const otherChannel = await createChannel(page, "other-star");
  await Promise.all([
    requestAsToken(page, fixture.alice.token, `/channels/${removedChannel.id}/members`, {
      method: "POST", body: { userId: fixture.bob.id },
    }),
    requestAsToken(page, fixture.alice.token, `/channels/${otherChannel.id}/members`, {
      method: "POST", body: { userId: fixture.bob.id },
    }),
  ]);
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await seedToken(bobPage, fixture.bob.token);

  try {
    await bobPage.goto(`/channels/${removedChannel.id}`);
    await expect(bobPage.getByTestId("channel-title")).toContainText(removedChannel.name);
    const previewUrl = bobPage.url();
    await expect(bobPage.getByTestId("channel-starred-toggle")).toBeVisible();
    await requestAsToken(bobPage, fixture.bob.token, `/channels/${removedChannel.id}/star`, { method: "POST" });
    await requestAsToken(bobPage, fixture.bob.token, `/channels/${otherChannel.id}/star`, { method: "POST" });
    await requestAsToken(page, fixture.alice.token, `/channels/${removedChannel.id}/star`, { method: "POST" });

    await requestAsToken(page, fixture.alice.token, `/channels/${removedChannel.id}/members/${fixture.bob.id}`, { method: "DELETE" });

    await expect(bobPage.getByTestId("channel-title")).toContainText(removedChannel.name);
    await expect(bobPage.getByText(`You're previewing #${removedChannel.name}`)).toBeVisible();
    await expect(bobPage.getByTestId("channel-starred-toggle")).toHaveCount(0);
    await expect(bobPage.getByTestId("composer")).toHaveCount(0);
    await expect(bobPage.getByTestId(`channel-row-${slug(removedChannel.name)}`)).toHaveCount(0);

    const bobStars = await requestAsToken(bobPage, fixture.bob.token, "/users/vips");
    const aliceStars = await requestAsToken(page, fixture.alice.token, "/users/vips");
    expect(bobStars.channelIds).not.toContain(removedChannel.id);
    expect(bobStars.channelIds).toContain(otherChannel.id);
    expect(aliceStars.channelIds).toContain(removedChannel.id);

    await bobPage.reload();
    await expect(bobPage.getByText(`You're previewing #${removedChannel.name}`)).toBeVisible();
    await expect(bobPage.getByTestId("channel-starred-toggle")).toHaveCount(0);
    await expect(bobPage).toHaveURL(previewUrl);

    await bobPage.getByRole("button", { name: "Join channel" }).click();
    await expect(bobPage.getByTestId("channel-starred-toggle")).toBeVisible();
    await expect(bobPage.getByTestId("channel-starred-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(bobPage.getByTestId("composer")).toBeVisible();
  } finally {
    await bobContext.close();
    await rawAsToken(page, fixture.alice.token, `/channels/${removedChannel.id}/members/${fixture.bob.id}`, { method: "DELETE" });
    await deleteChannel(page, removedChannel.id);
    await deleteChannel(page, otherChannel.id);
  }
});
