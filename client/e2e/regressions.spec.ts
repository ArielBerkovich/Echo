import { expect, test } from "@playwright/test";
import {
  dmRow,
  railItem,
  openLocalAuth,
  registerUser,
  requestAsToken,
  seedWorkspaceFixture,
  slug,
  uniqueSuffix,
  uploadAsToken,
  messageByText,
} from "./helpers.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8/5+hHgAHggJ/PFvdcQAAAABJRU5ErkJggg==",
  "base64"
);

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function createScrollableChannel(page, prefix) {
  const channelName = `${prefix}-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  for (let index = 0; index < 28; index += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: created.channel.id,
        body: `${prefix} seed ${index} ${fixture.suffix}`,
        externalKey: `${prefix}-seed-${fixture.suffix}-${index}`,
      },
    });
  }
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/read`, {
    method: "POST",
  });
  return { channelName, channel: created.channel };
}

async function createImageChannel(page, prefix) {
  const channelName = `${prefix}-${fixture.suffix}`;
  const [{ channel }, { attachments }] = await Promise.all([
    requestAsToken(page, fixture.alice.token, "/channels", {
      method: "POST",
      body: { name: channelName, type: "public" },
    }),
    uploadAsToken(page, fixture.alice.token, {
      name: `${prefix}.png`,
      mimeType: "image/png",
      buffer: ONE_BY_ONE_PNG,
    }),
  ]);
  const attachment = { ...attachments[0], width: 320, height: 180 };
  const { message } = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: channel.id,
      body: `${prefix} message ${fixture.suffix}`,
      attachments: [attachment],
      externalKey: `${prefix}-message-${fixture.suffix}`,
    },
  });
  return { attachment, channel, channelName, message };
}

async function selectInterfaceLanguage(page, language, direction) {
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: /^(Preferences|העדפות)$/ }).click();
  await page.getByTestId("settings-language").selectOption(language);
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", direction);
}

test("shows a dot instead of a Home notification count", async ({ page }) => {
  await page.goto("/");

  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Home dot notification ${Date.now()}`,
      externalKey: `home-dot-${Date.now()}`,
    },
  });

  const badge = railItem(page, "home").locator(".rail-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveClass(/dot/);
  await expect(badge).toHaveText("");
});

test("does not offer DM removal in the dedicated DMs view", async ({ page }) => {
  await page.goto("/");
  await railItem(page, "dms").click({ force: true });
  await expect(page.getByTestId("sidebar")).toHaveClass(/dms-view/);

  const row = dmRow(page, fixture.bob.displayName);
  await expect(row).toBeVisible();
  await expect(row.locator(".dm-remove")).toHaveCount(0);
});

test("opens a Home sidebar DM without switching to the DMs view", async ({ page }) => {
  await page.goto("/");

  const homeDm = page.locator(".dm-item").filter({ hasText: fixture.bob.displayName }).first();
  await expect(homeDm).toBeVisible();
  await homeDm.locator(".dm-open").click();

  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect(railItem(page, "home")).toHaveClass(/active/);
  await expect(railItem(page, "dms")).not.toHaveClass(/active/);
  await expect(page.getByTestId("sidebar")).not.toHaveClass(/dms-view/);
  await expect(page.getByTestId("channel-row-general")).toBeVisible();
});

test("shows the shared search row alongside the Direct Messages view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await railItem(page, "dms").click({ force: true });
  await expect(page.getByTestId("sidebar")).toHaveClass(/dms-view/);
  await expect(page.getByTestId("workspace-search")).toBeVisible();
  await expect(page.getByTestId("dms-header")).toBeVisible();
});

test("opens the Home filter below the sidebar tools", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await railItem(page, "home").click();

  const filterToggle = page.getByTestId("sidebar-filter-toggle");
  await expect(filterToggle).toBeVisible();
  expect(await page.getByTestId("sidebar-filter").count()).toBe(0);
  const tools = await page.getByRole("group", { name: "Sidebar actions" }).boundingBox();
  expect(tools).not.toBeNull();

  await filterToggle.click();
  const sidebarFilter = await page.getByTestId("sidebar-filter").boundingBox();
  expect(sidebarFilter).not.toBeNull();
  expect(sidebarFilter.y).toBeGreaterThanOrEqual(tools.y + tools.height);
});

test("combines the Home unread filter with text search", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // Start from a deterministic read state, then create unread activity in a
  // channel, another channel, and the DM so the two filter dimensions can be
  // asserted independently.
  for (const channelId of [fixture.generalChannel.id, fixture.projectChannel.id, fixture.dmChannel.id]) {
    await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/read`, { method: "POST" });
  }
  const textFilter = fixture.projectChannel.name;
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `General unread ${fixture.suffix}`,
      externalKey: `unread-general-${fixture.suffix}`,
    },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body: `Project unread ${fixture.suffix}`,
      externalKey: `unread-project-${fixture.suffix}`,
    },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.dmChannel.id,
      body: `DM unread ${fixture.suffix}`,
      externalKey: `unread-dm-${fixture.suffix}`,
    },
  });

  await page.goto("/");

  const unreadToggle = page.getByTestId("sidebar-unread-toggle");
  await page.getByTestId("sidebar-filter-toggle").click();
  await expect(unreadToggle).toHaveAttribute("aria-pressed", "false");

  await unreadToggle.click();
  await expect(unreadToggle).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByTestId(`channel-row-${fixture.generalChannel.name}`)).toBeVisible();
  await expect(page.getByTestId(`channel-row-${fixture.projectChannel.name}`)).toBeVisible();
  await expect(page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`)).toBeVisible();

  await page.getByTestId("sidebar-filter").fill(textFilter);
  await expect(page.getByTestId(`channel-row-${fixture.projectChannel.name}`)).toBeVisible();
  await expect(page.getByTestId(`channel-row-${fixture.generalChannel.name}`)).toHaveCount(0);
  await expect(page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`)).toHaveCount(0);

  await page.getByTestId("sidebar-filter-all").click();
  await expect(unreadToggle).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("sidebar-filter").fill("");
  await expect(page.getByTestId(`channel-row-${fixture.projectChannel.name}`)).toBeVisible();
  await expect(page.getByTestId(`channel-row-${fixture.generalChannel.name}`)).toBeVisible();
  await expect(page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`)).toBeVisible();
});

test("opens regular search with the current channel scope", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

  await page.getByTestId("channel-search").click();

  await expect(page.getByTestId("search-input")).toHaveValue(`in:${fixture.projectChannel.name} `);
  await expect(page.getByTestId("search-input")).toBeFocused();
});

test("clears an unsubmitted channel search when navigating away", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

  await page.getByTestId("channel-search").click();
  await page.getByTestId("search-input").pressSequentially("incident");
  await expect(page.getByTestId("search-input")).toHaveValue(`in:${fixture.projectChannel.name} incident`);

  await page.getByTestId(`channel-row-${fixture.generalChannel.name}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
  await expect(page.getByTestId("search-input")).toHaveValue("");
});

test("keeps channel hashes before names in English and Hebrew search results", async ({ page }) => {
  const query = `search-direction-${fixture.suffix}`;
  await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `${query} result`,
      externalKey: `search-direction-${fixture.suffix}`,
    },
  });

  await page.goto("/");
  for (const language of ["en", "he"]) {
    await page.evaluate((nextLanguage) => localStorage.setItem("echo.language", nextLanguage), language);
    await page.goto("/");
    await page.getByTestId("search-input").fill(query);
    await page.getByTestId("search-input").press("Enter");

    const groupTitle = page.locator(".search-result-group-title").first();
    const where = page.locator(".activity-where").first();
    await expect(groupTitle).toHaveText("#general");
    await expect.poll(() => where.textContent().then((text) => text?.replace(/[\u2066-\u2069]/g, ""))).toBe(
      language === "en" ? "in #general" : "ב־#general"
    );
    await expect(groupTitle).not.toContainText("general#");
    await expect.poll(() => where.textContent().then((text) => text?.replace(/[\u2066-\u2069]/g, ""))).not.toContain("general#");
  }
});

test("aligns Hebrew in the composer and sent message", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  const hebrew = `שלום עולם ${fixture.suffix}`;
  const composer = page.getByTestId("composer-editor");

  await composer.fill(hebrew);
  await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).textAlign)).toBe("start");

  await page.getByTestId("composer-send").click();
  const message = messageByText(page, hebrew);
  await expect(message).toBeVisible();
  await expect.poll(() => message.getByTestId("message-body").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => message.getByTestId("message-body").evaluate((element) => getComputedStyle(element).textAlign)).toBe("start");
});

test("aligns Hebrew after a person mention in the English composer", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "ltr");
  const composer = page.getByTestId("composer-editor");
  await composer.fill(`@${fixture.bob.username}`);
  const suggestion = page.locator(".mention-item").filter({ hasText: fixture.bob.username });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await composer.pressSequentially(" שלום, זה טקסט בדיקה");

  await expect.poll(() => composer.evaluate((element) => {
    const paragraph = element.querySelector("p");
    return paragraph ? getComputedStyle(paragraph).direction : null;
  })).toBe("rtl");

  await selectInterfaceLanguage(page, "he", "rtl");
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  const rtlComposer = page.getByTestId("composer-editor");
  await rtlComposer.fill(`@${fixture.bob.username}`);
  const rtlSuggestion = page.locator(".mention-item").filter({ hasText: fixture.bob.username });
  await expect(rtlSuggestion).toBeVisible();
  await rtlSuggestion.click();
  await rtlComposer.pressSequentially(" English text after mention");
  await expect.poll(() => rtlComposer.evaluate((element) => {
    const paragraph = element.querySelector("p");
    return paragraph ? getComputedStyle(paragraph).direction : null;
  })).toBe("ltr");
  await selectInterfaceLanguage(page, "en", "ltr");
});

test("isolates names with trailing apostrophes in empty DMs in either interface direction", async ({ page }) => {
  const suffix = uniqueSuffix("dmname").replace(/[^a-z0-9]/gi, "").slice(-12);
  const recipient = await registerUser(page, {
    username: `recipient.user${suffix}`,
    displayName: "Recipient",
  });
  await requestAsToken(page, recipient.token, "/users/me", {
    method: "PATCH",
    body: { displayName: "שם בעברית'" },
  });
  const { channel } = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userId: recipient.user.id },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "en"));
  await page.goto(`/dms/${channel.id}`);
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "ltr");
  const emptyStateName = page.locator(".empty-state h3 bdi[dir=auto]");
  await expect(emptyStateName).toHaveText("שם בעברית'");
  await expect.poll(() => emptyStateName.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");

  await requestAsToken(page, recipient.token, "/users/me", {
    method: "PATCH",
    body: { displayName: "English Person'" },
  });
  await selectInterfaceLanguage(page, "he", "rtl");
  await page.goto(`/dms/${channel.id}`);
  await expect(emptyStateName).toHaveText("English Person'");
  await expect.poll(() => emptyStateName.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
  await selectInterfaceLanguage(page, "en", "ltr");
});

test("isolates message search author names with trailing apostrophes in either interface direction", async ({ page }) => {
  const suffix = uniqueSuffix("searchname").replace(/[^a-z0-9]/gi, "").slice(-12);
  const author = await registerUser(page, {
    username: `recipient.user${suffix}`,
    displayName: "Recipient",
  });
  await requestAsToken(page, author.token, "/users/me", {
    method: "PATCH",
    body: { displayName: "שם בעברית'" },
  });
  const { channel } = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userId: author.user.id },
  });
  const token = `authorname${suffix}`;
  await requestAsToken(page, author.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: { body: `Search author marker ${token}` },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "en"));
  const searchUrl = `/search?q=${encodeURIComponent(token)}`;
  await page.goto(searchUrl);
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "ltr");
  const authorName = page.getByTestId("search-result").filter({ hasText: token }).locator(".author bdi[dir=auto]");
  await expect(authorName).toHaveText("שם בעברית'");
  await expect.poll(() => authorName.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");

  await requestAsToken(page, author.token, "/users/me", {
    method: "PATCH",
    body: { displayName: "English Person'" },
  });
  await selectInterfaceLanguage(page, "he", "rtl");
  await page.goto(searchUrl);
  await expect(authorName).toHaveText("English Person'");
  await expect.poll(() => authorName.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
  await selectInterfaceLanguage(page, "en", "ltr");
});

test("uses the selected Hebrew language for the message layout", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId("settings-language").selectOption("he");
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "rtl");

  await page.getByTestId("rail-home").click();
  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
  await expect.poll(() => page.getByTestId("composer").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => page.locator(".message").first().evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await page.locator(".message").first().hover();
  await page.locator(".message-more-action").first().click();
  const rtlMessageMenu = page.locator(".msg-menu").last();
  await expect(rtlMessageMenu).toHaveAttribute("dir", "rtl");
  await expect.poll(() => rtlMessageMenu.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => rtlMessageMenu.getByRole("menuitem").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");

  const composer = page.getByTestId("composer-editor");
  await composer.fill("");
  await expect.poll(() => composer.locator("p").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => composer.locator("p").evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");
  await composer.fill("@");
  await expect(page.getByTestId("composer")).toHaveClass(/has-mention-empty/);
  await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");
  await composer.fill("שלום עולם @");
  await expect(page.locator(".mention-popup")).toHaveClass(/mention-popup-rtl/);
  await composer.fill("שלום עולם @א");
  await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await composer.fill("שלום @");
  await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).textAlign)).toBe("start");
  await composer.fill("@א");
  await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
});

test("starts a conversation from the Home Direct Messages button", async ({ page }) => {
  await page.goto("/");

  const dmSection = page.getByTestId("home-dm-section");
  const startButton = page.getByTestId("start-dm");
  await expect(startButton).toBeVisible();
  await expect(startButton).toHaveClass(/add-channel/);
  await expect(startButton).toHaveAttribute("aria-label", "New message");
  await expect(startButton.locator(".lucide-square-pen")).toBeVisible();

  await startButton.click();

  await expect(page.getByTestId("new-message-modal")).toBeVisible();
  const search = page.getByTestId("new-message-search-input");
  await search.focus();
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("placeholder", "Search people");

  await search.fill(fixture.bob.username);
  const bobResult = page.getByTestId(`new-message-user-${fixture.bob.username}`);
  await expect(bobResult).toBeVisible();
  await bobResult.click();
  const firstMessage = `Started from compose ${Date.now()}`;
  const modal = page.getByTestId("new-message-modal");
  await expect(modal.getByTestId("new-message-search-input")).toBeFocused();
  const composer = modal.getByTestId("composer-editor");
  await expect(composer).toHaveAttribute("contenteditable", "true");
  await composer.fill(firstMessage);
  await expect(composer).toHaveText(firstMessage);
  await modal.getByTestId("composer-send").click();

  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect(railItem(page, "dms")).toHaveClass(/active/);
  await expect(page.getByText(firstMessage, { exact: true })).toBeVisible();
});

test("shows an inactive Composer before choosing a new message recipient", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-dm").click();
  const modal = page.getByTestId("new-message-modal");
  await expect(modal.getByTestId("composer-editor")).toBeVisible();
  await expect(modal.getByTestId("composer-editor")).toHaveAttribute("contenteditable", "false");
  await expect(modal.getByTestId("composer-send")).toBeDisabled();
  await expect(modal.getByTestId("composer-send-options")).toHaveCount(0);
});

test("activates the Composer after selecting a new message recipient", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-dm").click();
  const modal = page.getByTestId("new-message-modal");
  await modal.getByTestId("new-message-search-input").fill(fixture.bob.username);
  await modal.getByTestId(`new-message-user-${fixture.bob.username}`).click();
  await expect(modal.getByTestId("composer-editor")).toHaveAttribute("contenteditable", "true");
  await expect(modal.getByTestId("composer-send-options")).toHaveCount(0);
});

test("moves from selected new-message recipients to the Composer with Tab", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-dm").click();
  const modal = page.getByTestId("new-message-modal");
  const search = modal.getByTestId("new-message-search-input");

  await search.fill(fixture.bob.username);
  await modal.getByTestId(`new-message-user-${fixture.bob.username}`).click();
  await expect(search).toBeFocused();
  await expect(modal.getByTestId("composer-editor")).toHaveAttribute("contenteditable", "true");

  await search.press("Tab");

  await expect(modal.getByTestId("composer-editor")).toBeFocused();
});

test("keeps the new-message emoji picker inside the viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-dm").click();
  const modal = page.getByTestId("new-message-modal");
  await modal.getByTestId("composer-emoji-toggle").click();

  const picker = page.locator(".emoji-popup-wrap.is-viewport-positioned");
  await expect(picker).toBeVisible();
  await expect(picker.locator('input[type="search"]')).toBeFocused();
  const box = await picker.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(7);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height - 7);
});

test("keeps the new-message draft while changing the recipient chip", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-dm").click();

  const modal = page.getByTestId("new-message-modal");
  const draft = `Draft survives recipient changes ${fixture.suffix}`;
  const search = modal.getByTestId("new-message-search-input");

  await search.fill(fixture.bob.username);
  const bobResult = modal.getByTestId(`new-message-user-${fixture.bob.username}`);
  await expect(bobResult).toBeVisible();
  await bobResult.click();
  await expect(modal.getByTestId("new-message-recipient")).toContainText(fixture.bob.displayName);

  const editor = modal.getByTestId("composer-editor");
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.fill(draft);

  const removeRecipient = modal.getByTestId("new-message-recipient").getByRole("button");
  await removeRecipient.click();
  await expect(modal.getByTestId("new-message-search-input")).toBeVisible();
  await expect(editor).toHaveText(draft);

  await search.fill(fixture.bob.username);
  await expect(bobResult).toBeVisible();
  await bobResult.click();
  await expect(modal.getByTestId("new-message-recipient")).toContainText(fixture.bob.displayName);
  await expect(editor).toHaveText(draft);
});

test("starts a new list after existing composer text", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByTestId("composer-editor").first();
  await editor.fill("Regular text");
  await page.getByTitle("Bulleted list").first().click();
  await page.keyboard.type("List item");
  await expect(editor.locator(":scope > p")).toHaveText("Regular text");
  await expect(editor).toContainText("List item");
  await expect(editor.locator(":scope > ul > li")).toHaveCount(1);
});

test("starts a conversation from the dedicated DMs button with the keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await railItem(page, "dms").click();

  const startButton = page.getByTestId("start-dm");
  await expect(startButton).toBeVisible();
  await expect(startButton).toHaveAttribute("title", "New message · ⌘/Ctrl+⇧M");

  await startButton.click();

  const search = page.getByTestId("new-message-search-input");
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("placeholder", "Search people");
  await search.fill(fixture.bob.username);
  await expect(page.getByTestId(`new-message-user-${fixture.bob.username}`)).toBeVisible();
  await search.press("Enter");
  const composer = page.getByTestId("new-message-modal").getByTestId("composer-editor");
  await composer.click();
  await expect(composer).toBeFocused();
  await composer.fill("Hello from the new message dialog");
  await page.getByTestId("composer-send").click();

  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect(railItem(page, "dms")).toHaveClass(/active/);
});

test("keeps the DM preview width stable when toggling Starred", async ({ page }) => {
  await page.goto("/dms");
  await expect(page.getByTestId("dms-header")).toBeVisible();

  const row = dmRow(page, fixture.bob.displayName);
  const preview = row.locator(".dm-preview");
  const before = await preview.boundingBox();
  expect(before).not.toBeNull();

  await row.locator(".dm-open").click();
  const starredToggle = page.getByTestId("dm-starred-toggle");
  const wasStarred = (await starredToggle.getAttribute("aria-pressed")) === "true";
  if (!wasStarred) {
    const starResponse = page.waitForResponse(
      (response) => response.url().includes("/api/users/") && response.url().endsWith("/vip") && response.request().method() === "POST"
    );
    await starredToggle.click();
    await expect((await starResponse).ok()).toBeTruthy();
  }
  await expect(starredToggle).toHaveAttribute("aria-pressed", "true");
  await railItem(page, "dms").click();

  const after = await dmRow(page, fixture.bob.displayName).locator(".dm-preview").boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);

  // Leave the fixture in its normal state for subsequent tests.
  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();
  const cleanupToggle = page.getByTestId("dm-starred-toggle");
  if (((await cleanupToggle.getAttribute("aria-pressed")) === "true") !== wasStarred) {
    await cleanupToggle.click();
  }
});

test("stars channels without changing their membership or name", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

  const toggle = page.getByTestId("channel-starred-toggle");
  if ((await toggle.getAttribute("aria-pressed")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  }

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`starred-channel-row-${slug(fixture.projectChannel.name)}`)).toBeVisible();

  const starred = await requestAsToken(page, fixture.alice.token, "/users/vips");
  expect(starred.channelIds).toContain(fixture.projectChannel.id);
  const channels = await requestAsToken(page, fixture.alice.token, "/channels");
  expect(channels.channels).toContainEqual(expect.objectContaining({
    id: fixture.projectChannel.id,
    name: fixture.projectChannel.name,
  }));

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`)).toBeVisible();
});

test("restores starred channels in the Starred section after reload", async ({ page }) => {
  await requestAsToken(page, fixture.alice.token, `/channels/${fixture.projectChannel.id}/star`, { method: "POST" });

  await page.goto("/");
  await expect(page.getByTestId(`starred-channel-row-${slug(fixture.projectChannel.name)}`)).toBeVisible();

  const channelRow = page.getByTestId(`starred-channel-row-${slug(fixture.projectChannel.name)}`);
  await channelRow.click({ force: true });
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name, { timeout: 15_000 });
  await expect(page.getByTestId("channel-starred-toggle")).toHaveAttribute("aria-pressed", "true");

  await requestAsToken(page, fixture.alice.token, `/channels/${fixture.projectChannel.id}/star`, { method: "POST" });
});

test("adds a channel-message author to Starred without opening a DM first", async ({ page }) => {
  const candidateSuffix = uniqueSuffix("starred").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  const candidate = await registerUser(page, {
    username: `victor.profile${candidateSuffix}`,
    displayName: "Victor Profile",
  });
  await requestAsToken(page, candidate.token, "/users/me/onboarded", { method: "POST" });

  const body = `Starred profile regression ${candidateSuffix}`;
  const { message } = await requestAsToken(page, candidate.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body,
      externalKey: `starred-profile-${candidateSuffix}`,
    },
  });

  const before = await requestAsToken(page, fixture.alice.token, "/dms");
  expect(before.conversations.some((conversation) => conversation.withUser.id === candidate.user.id)).toBeFalsy();

  const usersResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/users" && response.request().method() === "GET");
  await page.goto("/");
  await usersResponse;
  await page.getByTestId(`message-${message.id}-author`).click();

  const profile = page.getByTestId("profile-modal");
  await profile.getByTestId("profile-starred").click();
  await expect(profile.getByTestId("profile-starred")).toHaveAttribute("aria-label", "Remove from Starred");
  await profile.getByTestId("profile-close").click();

  await expect(page.getByTestId("starred-toggle")).toBeVisible();
  await expect(page.locator(".dm-item").filter({ hasText: candidate.user.displayName })).toBeVisible();

  const after = await requestAsToken(page, fixture.alice.token, "/dms");
  expect(after.conversations.some((conversation) => conversation.withUser.id === candidate.user.id)).toBeTruthy();

  await requestAsToken(page, fixture.alice.token, `/users/${candidate.user.id}/vip`, { method: "POST" });
});

test("keeps channel and user details dialogs on the neutral chat palette", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("channel-title").click();
  const details = page.getByTestId("channel-details-dialog");
  await expect(details).toBeVisible();

  const channelBackground = async (theme) => {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    return details.evaluate((element) => getComputedStyle(element).backgroundColor);
  };
  const chatSurface = () => page.locator(".chat-pane").evaluate((element) => getComputedStyle(element).getPropertyValue("--surface").trim());
  const expectedSurface = await chatSurface();
  const draculaBackground = await channelBackground("dracula");
  expect(await details.evaluate((element) => getComputedStyle(element).getPropertyValue("--surface").trim())).toBe(expectedSurface);
  expect(await channelBackground("nord")).toBe(draculaBackground);
  await details.getByRole("button", { name: "Close channel details" }).click();

  await page.addStyleTag({ content: ".message, .msg-actions button { transition: none !important; }" });
  const message = page.getByTestId(`message-${fixture.messages.threadRoot.id}`);
  await message.hover();
  const messageHoverBackground = async (theme) => {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    return message.evaluate((element) => getComputedStyle(element).backgroundColor);
  };
  expect(await messageHoverBackground("dracula")).toBe(await messageHoverBackground("nord"));
  const moreAction = page.getByTestId(`message-${fixture.messages.threadRoot.id}-more`);
  await moreAction.hover();
  const moreActionBackground = async (theme) => {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    return moreAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  };
  expect(await moreActionBackground("dracula")).toBe(await moreActionBackground("nord"));

  await page.getByTestId("search-input").fill("chat preview");
  const searchPreview = page.locator(".workspace-search .search-dropdown");
  await expect(searchPreview).toBeVisible();
  const searchPreviewBackground = async (theme) => {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    return searchPreview.evaluate((element) => getComputedStyle(element).backgroundColor);
  };
  expect(await searchPreviewBackground("dracula")).toBe(await searchPreviewBackground("nord"));

  await page.goto(`/dms/${fixture.dmChannel.id}`);
  await page.getByTestId(`message-${fixture.messages.dmMessage.id}-avatar`).click();
  const profile = page.getByTestId("profile-modal");
  await expect(profile).toBeVisible();
  const profileBackground = async (theme) => {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    return profile.evaluate((element) => getComputedStyle(element).backgroundColor);
  };
  expect(await profile.evaluate((element) => getComputedStyle(element).getPropertyValue("--surface").trim())).toBe(expectedSurface);
  expect(await profileBackground("dracula")).toBe(await profileBackground("nord"));
});

test("opens people and channels searched from Activity and Saved", async ({ page }) => {
  await page.goto("/");

  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "activity", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();
  await expect(page.getByTestId("activity-header")).toBeVisible();

  await page.getByTestId("search-input").fill(fixture.bob.username);
  await page.getByTestId(`search-user-${slug(fixture.bob.username)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);

  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "saved", convId: null, convType: null }));
  }, fixture.alice.id);
  // Legacy saved locations are the fallback at the root route. Explicit URLs
  // take precedence once navigation is represented by React Router.
  await page.goto("/");
  await expect(page.getByTestId("saved-header")).toBeVisible();

  await page.getByTestId("search-input").fill(fixture.projectChannel.name);
  await page.getByTestId(`search-channel-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
});

test("tracks conversations opened from the sidebar as recent", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((userId) => {
    localStorage.removeItem(`echo.recentSearches.user.${userId}`);
  }, fixture.alice.id);

  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await expect.poll(() => page.evaluate((userId) => {
    return JSON.parse(localStorage.getItem(`echo.recentSearches.user.${userId}`) || "[]")[0];
  }, fixture.alice.id)).toMatchObject({
    type: "channel",
    id: fixture.projectChannel.id,
    name: fixture.projectChannel.name,
  });

  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();
  await expect.poll(() => page.evaluate((userId) => {
    return JSON.parse(localStorage.getItem(`echo.recentSearches.user.${userId}`) || "[]")[0];
  }, fixture.alice.id)).toMatchObject({
    type: "user",
    id: fixture.bob.id,
    displayName: fixture.bob.displayName,
  });

  await page.reload();
  await page.getByTestId("search-input").click();
  await expect(page.getByText("Recent", { exact: true })).toBeVisible();
  await expect(page.getByTestId(`search-user-${slug(fixture.bob.displayName)}`)).toBeVisible();
  await expect(page.getByTestId(`search-channel-${slug(fixture.projectChannel.name)}`)).toBeVisible();
});

test("restores the last channel after visiting Saved and Activity", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

  await page.getByTestId("rail-saved").click();
  await expect(page.getByTestId("saved-header")).toBeVisible();
  await page.getByTestId("rail-activity").click();
  await expect(page.getByTestId("activity-header")).toBeVisible();
  await page.getByTestId("rail-home").click();

  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
});

test("keeps a DM scroll position when switching conversations and refreshing", async ({ page }) => {
  const charlie = await registerUser(page, {
    username: `scroll.dm${Date.now()}`,
    displayName: "Scroll DM",
  });
  await requestAsToken(page, charlie.token, "/users/me/onboarded", { method: "POST" });
  const secondDm = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userId: charlie.user.id },
  });

  for (const [channelId, senderToken] of [[fixture.dmChannel.id, fixture.bob.token], [secondDm.channel.id, charlie.token]]) {
    for (let index = 0; index < 36; index += 1) {
      await requestAsToken(page, senderToken, "/messages/upsert", {
        method: "POST",
        body: { channelId, body: `DM scroll seed ${index} ${fixture.suffix}` },
      });
    }
    await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/read`, { method: "POST" });
  }

  await page.goto("/");
  await expect(page.getByTestId("channel-view")).toBeVisible();
  const openDm = async (name) => {
    await page.getByTestId(`dm-open-${slug(name)}`).click();
    await expect(page.getByTestId("channel-view")).toBeVisible();
    await expect(page.getByTestId("channel-title")).toContainText(name);
  };
  const scroller = page.getByTestId("messages");

  await openDm(fixture.bob.displayName);
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await scroller.evaluate((element) => {
    element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) * 0.45);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const expectedTop = await scroller.evaluate((element) => element.scrollTop);

  await openDm(charlie.user.displayName);
  await openDm(fixture.bob.displayName);
  await expect.poll(() => scroller.evaluate((element, top) => Math.abs(element.scrollTop - top), expectedTop)).toBeLessThanOrEqual(2);

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
  await page.reload();
  await expect(page.getByTestId("channel-view")).toBeVisible();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
});

test("creates the channel creator as a manager and lets them promote a member", async ({ page }) => {
  const channelName = `manager-regression-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "private" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });

  await page.goto("/");
  const channel = page.getByTestId(`channel-row-${slug(channelName)}`);
  await expect(channel).toBeVisible();
  await channel.click();
  await page.locator(".ch-name-btn").click();

  const details = page.getByTestId("channel-details-dialog");
  await details.getByRole("tab", { name: "Members" }).click();
  await expect(details.locator(".channel-details-managers")).toContainText(fixture.alice.displayName);
  const bobRow = details.locator(".channel-details-person").filter({ hasText: fixture.bob.displayName });
  await bobRow.getByRole("button", { name: "Make manager" }).click();

  await expect(details.locator(".channel-details-managers")).toContainText(fixture.bob.displayName);
  await expect(bobRow).toContainText("Manager");
});

test("removes a channel from the sidebar after leaving it", async ({ page }) => {
  const channelName = `leave-sidebar-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/managers`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });

  await page.goto(`/channels/${created.channel.id}`);
  const row = page.getByTestId(`channel-row-${slug(channelName)}`);
  await page.getByTestId("channel-title").click();
  const details = page.getByTestId("channel-details-dialog");
  await details.getByRole("tab", { name: "Actions" }).click();
  await details.getByTestId("channel-leave").click();
  const leaveConfirmation = page.locator(".leave-channel-confirm-modal");
  await expect(leaveConfirmation).toBeVisible();
  const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  const leaveConfirmationBackground = async (theme) => {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    return leaveConfirmation.evaluate((element) => getComputedStyle(element).backgroundColor);
  };
  expect(await leaveConfirmationBackground("dracula")).toBe(await leaveConfirmationBackground("nord"));
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, originalTheme);
  await page.getByRole("button", { name: "Leave", exact: true }).click();

  await expect(row).toHaveCount(0);
});

test("shows only joined channels in the Channels section", async ({ page }) => {
  const channelName = `not-joined-${fixture.suffix}`;
  await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });

  await page.goto("/");
  await expect(page.getByTestId(`channel-row-${slug(channelName)}`)).toHaveCount(0);
  await page.getByTestId("search-input").fill(channelName);
  await expect(page.getByTestId(`search-channel-${slug(channelName)}`)).toBeVisible();
  await page.getByTestId("search-input").fill(`#${channelName}`);
  await expect(page.getByTestId(`search-channel-${slug(channelName)}`)).toBeVisible();
  await page.getByTestId(`search-channel-${slug(channelName)}`).click();
  await expect(page.getByRole("button", { name: "Join channel" })).toBeVisible();
  await expect(page.getByTestId("channel-leave")).toHaveCount(0);
});

test("removes archived channels from pane search", async ({ page }) => {
  const channelName = `archived-search-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });

  await page.goto("/");
  await page.getByTestId("search-input").fill(channelName);
  await expect(page.getByTestId(`search-channel-${slug(channelName)}`)).toBeVisible();

  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}`, {
    method: "DELETE",
  });

  await expect(page.getByTestId(`search-channel-${slug(channelName)}`)).toHaveCount(0);
});

test("switches channels without flashing stale messages while images load", async ({ page }) => {
  const seeded = await createImageChannel(page, "switch-image");
  let fileRequests = 0;
  let releaseImage;
  const imageGate = new Promise((resolve) => {
    releaseImage = resolve;
  });
  await page.route(`**${seeded.attachment.url}`, async (route) => {
    fileRequests += 1;
    await imageGate;
    await route.continue();
  });

  await page.goto(`/home/dms/${fixture.dmChannel.id}`);
  const staleMessage = page.getByTestId(`message-${fixture.messages.dmMessage.id}`);
  await expect(staleMessage).toBeVisible();
  await page.evaluate(
    ({ nextChannel, staleText }) => {
      (window as any).__staleTimelineSeen = false;
      const observer = new MutationObserver(() => {
        const title = document.querySelector('[data-testid="channel-title"]')?.textContent || "";
        const timeline = document.querySelector(".channel-main .messages")?.textContent || "";
        if (title.includes(nextChannel) && timeline.includes(staleText)) {
          (window as any).__staleTimelineSeen = true;
        }
      });
      const channelMain = document.querySelector(".channel-main");
      if (channelMain) observer.observe(channelMain, { childList: true, subtree: true, characterData: true });
      (window as any).__stopStaleTimelineObserver = () => observer.disconnect();
    },
    { nextChannel: seeded.channelName, staleText: fixture.messages.dmMessage.body }
  );

  const seededRow = page.getByTestId(`channel-row-${slug(seeded.channelName)}`);
  await expect(seededRow).toBeVisible();
  await seededRow.click();
  await expect(page.getByTestId("channel-title")).toContainText(seeded.channelName);
  await expect(page.getByTestId(`message-${seeded.message.id}`)).toBeVisible();
  await expect(staleMessage).toHaveCount(0);
  await expect(page.locator(".att-image.is-loading")).toBeVisible();
  await expect.poll(() => fileRequests).toBe(1);

  const before = await page.locator(".att-image").boundingBox();
  const beforeScrollTop = await page.getByTestId("messages").evaluate((el) => el.scrollTop);
  releaseImage();
  await expect(page.locator(`.att-image img[alt="${seeded.attachment.name}"]`)).toBeVisible();
  const after = await page.locator(".att-image").boundingBox();
  const afterScrollTop = await page.getByTestId("messages").evaluate((el) => el.scrollTop);

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterScrollTop - beforeScrollTop)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => (window as any).__staleTimelineSeen)).toBeFalsy();
  await page.evaluate(() => (window as any).__stopStaleTimelineObserver?.());
});

test("reuses protected attachment media when revisiting a channel", async ({ page }) => {
  const seeded = await createImageChannel(page, "cached-image");
  let fileRequests = 0;
  await page.route(`**${seeded.attachment.url}`, async (route) => {
    fileRequests += 1;
    await route.continue();
  });

  await page.goto("/");
  const channelRow = page.getByTestId(`channel-row-${slug(seeded.channelName)}`);
  await expect(channelRow).toBeVisible();
  await channelRow.click();
  await expect(channelRow).toHaveClass(/active/);
  await expect(page.getByTestId("channel-title")).toContainText(seeded.channelName);
  const message = page.getByTestId(`message-${seeded.message.id}`);
  await expect(message).toBeVisible();
  const image = message.locator(`.att-image img[alt="${seeded.attachment.name}"]`);
  await expect(image).toBeVisible();
  await expect.poll(() => fileRequests).toBe(1);

  await page.getByTestId("channel-row-general").click();
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await channelRow.click();
  await expect(page.getByTestId("channel-title")).toContainText(seeded.channelName);
  await expect(message).toBeVisible();
  await expect(image).toBeVisible();
  await expect.poll(() => fileRequests).toBe(1);
});

test("shows a compact scroll-to-latest control only when away from the bottom", async ({ page }) => {
  const { channelName } = await createScrollableChannel(page, "scroll-control");

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  const scroller = page.getByTestId("messages");
  await expect(scroller).toBeVisible();
  await expect(page.getByText("scroll-control seed 27", { exact: false })).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("new-messages-button")).toHaveCount(0);

  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 220);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const button = page.getByTestId("new-messages-button");
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", "Scroll to latest message");
  await expect(button.locator("svg.lucide-chevrons-down")).toHaveCount(1);

  const [buttonBox, scrollerBox] = await Promise.all([button.boundingBox(), scroller.boundingBox()]);
  expect(buttonBox).not.toBeNull();
  expect(scrollerBox).not.toBeNull();
  expect(buttonBox.width).toBeLessThanOrEqual(36);
  expect(buttonBox.height).toBeLessThanOrEqual(36);
  const rightGap = scrollerBox.x + scrollerBox.width - buttonBox.x - buttonBox.width;
  expect(rightGap).toBeGreaterThanOrEqual(0);
  expect(rightGap).toBeLessThanOrEqual(18);

  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(button).toHaveCount(0);
});

test("scroll-to-latest reports unread count and returns to the live edge", async ({ page }) => {
  const { channel, channelName } = await createScrollableChannel(page, "scroll-unread");

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  const scroller = page.getByTestId("messages");
  await expect(page.getByText("scroll-unread seed 27", { exact: false })).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 220);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const position = await scroller.evaluate((el) => el.scrollTop);
  const button = page.getByTestId("new-messages-button");
  await expect(button).toHaveAttribute("aria-label", "Scroll to latest message");

  for (const index of [0, 1]) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: channel.id,
        body: `Message while reading ${index} ${fixture.suffix}`,
        externalKey: `scroll-live-${fixture.suffix}-${index}`,
      },
    });
  }

  await expect(button).toHaveAttribute("aria-label", "Scroll to latest, 2 new messages");
  await expect(button.locator(".new-messages-count")).toHaveText("2");
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThanOrEqual(position - 2);
  await button.click();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expect(button).toHaveCount(0);
});

test("scrolls to the bottom after sending while reading older messages", async ({ page }) => {
  const channelName = `own-send-scroll-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  for (let i = 0; i < 28; i += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: created.channel.id,
        body: `Own send seed ${i} ${Date.now()}`,
        externalKey: `own-send-seed-${fixture.suffix}-${i}`,
      },
    });
  }

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  const scroller = page.getByTestId("messages");
  await expect(scroller).toBeVisible();
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 220);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  const body = `Own send scroll ${Date.now()}`;
  await page.getByTestId("composer-editor").fill(body);
  await page.getByTestId("composer-editor").press("Enter");

  await expect(page.locator(".message").filter({ hasText: body })).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("new-messages-button")).toHaveCount(0);
});

test("threads offer new replies while scrolled up and follow your own reply", async ({ page }) => {
  for (let i = 0; i < 24; i += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.projectChannel.id,
        parentId: fixture.messages.threadRoot.id,
        body: `Thread scroll seed ${i} ${Date.now()}`,
        externalKey: `thread-scroll-seed-${fixture.suffix}-${i}`,
      },
    });
  }

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await page.getByTestId(`message-${fixture.messages.threadRoot.id}-reply-count`).click();

  const scroller = page.getByTestId("thread-body");
  await expect(scroller).toBeVisible();
  await expect(page.getByText("Thread scroll seed 23", { exact: false })).toBeVisible();
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const position = await scroller.evaluate((el) => el.scrollTop);
  // A thread reply must not create a channel-level jump control while the
  // thread is the active reading surface.
  await expect(page.getByTestId("new-messages-button")).toHaveCount(0);

  const incomingBody = `Thread reply while reading ${Date.now()}`;
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      parentId: fixture.messages.threadRoot.id,
      body: incomingBody,
      externalKey: `thread-scroll-live-${fixture.suffix}`,
    },
  });

  const newRepliesButton = page.getByTestId("thread-new-messages-button");
  await expect(newRepliesButton).toHaveAttribute("aria-label", "Scroll to latest, 1 new message");
  await expect(newRepliesButton.locator(".new-messages-count")).toHaveText("1");
  await expect(newRepliesButton.locator("svg.lucide-chevrons-down")).toHaveCount(1);
  const buttonTop = (await newRepliesButton.boundingBox()).y;
  const composerTop = (await page.locator(".thread-panel .composer").boundingBox()).y;
  expect(buttonTop).toBeLessThan(composerTop);
  expect(buttonTop).toBeGreaterThan(composerTop - 100);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThanOrEqual(position - 2);
  await newRepliesButton.click();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const ownBody = `Own thread reply ${Date.now()}`;
  const composer = page.locator(".thread-panel .composer-editor");
  await composer.fill(ownBody);
  await composer.press("Enter");

  await expect(page.locator(".thread-panel .message").filter({ hasText: ownBody })).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expect(newRepliesButton).toHaveCount(0);
});

test("deleting a thread root removes it from chat and marks it deleted in the open thread", async ({ page }) => {
  const token = uniqueSuffix("delete-thread");
  const { message: root } = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.projectChannel.id, body: `Deletable thread root ${token}` },
  });
  const { message: reply } = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.projectChannel.id, parentId: root.id, body: `Deletable thread reply ${token}` },
  });
  const rootId = root.id;
  const replyId = reply.id;
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.getByTestId(`message-${rootId}-reply-count`).click();

  const panel = page.getByTestId("thread-panel");
  const rootMessage = panel.getByTestId(`message-${rootId}`);
  const replyMessage = panel.getByTestId(`message-${replyId}`);
  await expect(rootMessage).toBeVisible();
  await expect(replyMessage).toBeVisible();

  await rootMessage.hover();
  await page.getByTestId(`message-${rootId}-more`).click();
  await page.getByTestId(`message-${rootId}-delete`).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(panel.getByTestId("thread-root-deleted")).toHaveText("This message was deleted.");
  await expect(replyMessage).toBeVisible();
  await expect(panel.getByTestId("composer-editor")).toHaveCount(0);
  await expect(page.getByTestId(`message-${rootId}`)).toHaveCount(0);
});

test("top-level messages keep their jump control in the channel while a thread is open", async ({ page }) => {
  const channel = fixture.projectChannel;
  for (let i = 0; i < 24; i += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: channel.id,
        body: `Channel surface seed ${i} ${Date.now()}`,
        externalKey: `channel-surface-seed-${fixture.suffix}-${i}`,
      },
    });
  }
  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channel.name)}`).click();
  const channelScroller = page.getByTestId("messages");
  await page.getByTestId(`message-${fixture.messages.threadRoot.id}-reply-count`).click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await channelScroller.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: channel.id,
      body: `Top-level while thread open ${Date.now()}`,
      externalKey: `channel-surface-live-${fixture.suffix}`,
    },
  });
  await expect(page.getByTestId("new-messages-button")).toHaveAttribute(
    "aria-label",
    "Scroll to latest, 1 new message"
  );
  await expect(page.getByTestId("thread-new-messages-button")).toHaveCount(0);
});

test("thread replies do not create a channel new-message popup when the thread is closed", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("new-messages-button")).toHaveCount(0);
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      parentId: fixture.messages.threadRoot.id,
      body: `Closed thread reply ${Date.now()}`,
      externalKey: `closed-thread-live-${fixture.suffix}`,
    },
  });
  await expect(page.getByTestId("new-messages-button")).toHaveCount(0);
});

test("opens a saved message from a hidden DM", async ({ page }) => {
  const dmMessage = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.dmChannel.id,
      body: `Hidden DM saved ${fixture.suffix}`,
      externalKey: `hidden-dm-saved-${fixture.suffix}`,
    },
  });
  await requestAsToken(page, fixture.alice.token, `/saved/${dmMessage.message.id}`, { method: "POST" });
  await requestAsToken(page, fixture.alice.token, `/dms/${fixture.dmChannel.id}`, { method: "DELETE" });

  await page.goto("/");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await page.getByTestId("rail-saved").click();
  const savedItem = page.getByTestId("saved-item").filter({ hasText: dmMessage.message.body });
  await expect(savedItem).toBeVisible({ timeout: 15_000 });
  await savedItem.click();

  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect(page.getByTestId(`message-${dmMessage.message.id}`)).toBeVisible();
});

test("keeps a hidden DM visible after marking the other user Starred", async ({ page }) => {
  await requestAsToken(page, fixture.alice.token, `/dms/${fixture.dmChannel.id}`, { method: "DELETE" });
  const starredUsers = await requestAsToken(page, fixture.alice.token, "/users/vips");
  if (starredUsers.vipIds.includes(fixture.bob.id)) {
    await requestAsToken(page, fixture.alice.token, `/users/${fixture.bob.id}/vip`, { method: "POST" });
  }
  const starredResult = await requestAsToken(page, fixture.alice.token, `/users/${fixture.bob.id}/vip`, { method: "POST" });
  expect(starredResult.vip).toBeTruthy();

  const visibleDms = await requestAsToken(page, fixture.alice.token, "/dms");
  expect(
    visibleDms.conversations.some((conversation) => conversation.id === fixture.dmChannel.id),
    `expected visible DM ${fixture.dmChannel.id}`
  ).toBeTruthy();
  await page.goto("/");
  const starredDm = page.locator(".dm-item").filter({ hasText: fixture.bob.displayName }).first();
  await expect(starredDm).toBeVisible();
  await expect(page.getByTestId("starred-toggle")).toBeVisible();

  await requestAsToken(page, fixture.alice.token, `/users/${fixture.bob.id}/vip`, { method: "POST" });
});

test("shows a friendly message when login returns a server error", async ({ page }) => {
  const loginPage = await page.context().newPage();
  await loginPage.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal details" }) })
  );
  await loginPage.goto("/");
  await openLocalAuth(loginPage);

  await loginPage.getByLabel("Username").fill("someone");
  await loginPage.getByTestId("auth-password").fill("Password1");
  await loginPage.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(loginPage.locator(".error")).toContainText("We couldn't sign you in right now. Please try again in a moment.");
  await expect(loginPage.locator(".error")).not.toContainText("internal details");
  await loginPage.close();
});
