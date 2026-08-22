import { expect, test } from "@playwright/test";
import {
  enableClipboardStub,
  channelRow,
  dmRow,
  messageById,
  messageByText,
  openLocalAuth,
  railItem,
  requestAsToken,
  seedWorkspaceFixture,
} from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await enableClipboardStub(page);
});

async function openFreshGeneralMessage(page, key, body) {
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body,
      externalKey: `${key}-${fixture.suffix}`,
    },
  });
  await page.goto("/channels/general");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  const message = messageById(page, created.message.id);
  await expect(message).toBeVisible();
  return { id: created.message.id, message };
}

async function expectRailIndicatorAligned(page, view = "home") {
  const [indicatorBox, iconBox] = await Promise.all([
    page.getByTestId("rail-active-indicator").boundingBox(),
    page.getByTestId(`rail-${view}`).getByTestId("rail-icon").boundingBox(),
  ]);
  const centers = {
    indicator: indicatorBox ? indicatorBox.y + indicatorBox.height / 2 : 0,
    icon: iconBox ? iconBox.y + iconBox.height / 2 : 0,
  };
  expect(Math.abs(centers.indicator - centers.icon), JSON.stringify(centers)).toBeLessThan(1);
}

test("restores an authenticated session into the default channel", async ({ page }) => {
  const earlierChannel = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: `aaa-default-check-${fixture.suffix}`, type: "private" },
  });
  try {
    await page.goto("/");

    await expect(page.getByTestId("rail-brand")).toBeVisible();
    await expect(page.getByText("#general", { exact: true })).toBeVisible();
    await expect(page.getByTestId("composer-editor")).toBeVisible();
  } finally {
    await requestAsToken(page, fixture.alice.token, `/channels/${earlierChannel.channel.id}`, {
      method: "DELETE",
    });
  }
});

test("does not allow Echo images to start native drags", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByTestId("rail-brand").locator("img");
  await expect(logo).toBeVisible();

  const dragWasAllowed = await logo.evaluate((image) => {
    const event = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    return image.dispatchEvent(event);
  });

  expect(dragWasAllowed).toBe(false);
});

test("opens the workspace search pane with Ctrl+F", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("composer-editor")).toBeVisible();

  const searchInput = page.getByTestId("search-input");
  await expect(searchInput).not.toBeFocused();

  await page.keyboard.press("Control+f");

  await expect(searchInput).toBeFocused();
  await expect(page.getByTestId("search-hint")).toBeVisible();
});

test("preserves composer drafts per channel", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByTestId("composer-editor");
  const draft = `Draft for general ${fixture.suffix}`;
  await editor.fill(draft);

  await channelRow(page, fixture.projectChannel.name).click();
  await channelRow(page, "general").click();
  await expect(editor).toHaveText(draft);

  await page.reload();
  await expect(editor).toHaveText(draft);
  await expect(page.getByTestId("composer-send")).toBeEnabled();
  await page.getByTestId("composer-send-options").click();
  await expect(page.getByRole("button", { name: /Tomorrow/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Custom time…" })).toBeEnabled();
  await page.locator(".menu-overlay").click({ position: { x: 1, y: 1 } });

  const sent = `Sent once ${fixture.suffix}`;
  await editor.fill(sent);
  await page.getByTestId("composer-send").click();
  await expect(messageByText(page, sent)).toHaveCount(1);
});

test("supports direct workspace routes and browser history", async ({ page }) => {
  // Legacy ID links remain valid, but are replaced with the readable canonical URL.
  await page.goto(`/channels/${fixture.projectChannel.id}`);

  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
  await expect(page).toHaveURL(new RegExp(`/channels/${fixture.projectChannel.name}$`));
  await expectRailIndicatorAligned(page, "home");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(450);
  await expectRailIndicatorAligned(page, "home");
  await page.setViewportSize({ width: 1280, height: 720 });

  await railItem(page, "activity").click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(railItem(page, "activity")).toHaveClass(/active/);
  await page.waitForTimeout(450);
  await expectRailIndicatorAligned(page, "activity");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(450);
  await expectRailIndicatorAligned(page, "activity");
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/channels/${fixture.projectChannel.name}$`));
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

  await page.goto(`/dms/${fixture.bob.username}`);
  await expect(page).toHaveURL(new RegExp(`/dms/${fixture.bob.username}$`));
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
});

test("sign out clears the session and returns to login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click({ force: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await openLocalAuth(page);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("echo.token"))).resolves.toBeNull();
});

test("opens API reference from Settings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: "API" }).click();
  await expect(page.getByTestId("api-reference-page")).toBeVisible();

  await expect(page.getByText(/REST API/i)).toBeVisible();
  const apiContent = page.locator(".settings-content-api");
  const apiInner = apiContent.locator(".api-inner");
  const contentBox = await apiContent.boundingBox();
  const innerBox = await apiInner.boundingBox();
  const contentPaddingLeft = await apiContent.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft));
  expect(Math.abs(innerBox.x - contentBox.x - contentPaddingLeft)).toBeLessThanOrEqual(1);
});

test("browses, filters, and joins public channels while private channels stay invite-only", async ({ page }) => {
  const suffix = Date.now();
  const publicPrefix = `zz-discoverable-${suffix}`;
  const publicName = `${publicPrefix}-a`;
  const privateName = `invite-only-${suffix}`;
  for (const name of [publicName, `${publicPrefix}-b`, `${publicPrefix}-c`]) {
    await requestAsToken(page, fixture.bob.token, "/channels", {
      method: "POST",
      body: { name, type: "public" },
    });
  }
  const privateChannel = await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST",
    body: { name: privateName, type: "private" },
  });

  const privateJoin = await page.request.post(`/api/channels/${privateChannel.channel.id}/join`, {
    headers: { Authorization: `Bearer ${fixture.alice.token}` },
  });
  expect(privateJoin.status()).toBe(403);

  const firstPage = await requestAsToken(
    page,
    fixture.alice.token,
    `/channels?scope=all&catalog=1&q=${publicPrefix}&limit=2`
  );
  expect(firstPage.channels).toHaveLength(2);
  expect(firstPage.page.hasMore).toBe(true);
  expect(firstPage.channels.every((channel) => channel.members === undefined)).toBe(true);
  const secondPage = await requestAsToken(
    page,
    fixture.alice.token,
    `/channels?scope=all&catalog=1&q=${publicPrefix}&limit=2&cursor=${encodeURIComponent(firstPage.page.nextCursor)}`
  );
  expect(secondPage.channels).toHaveLength(1);
  expect(secondPage.page.hasMore).toBe(false);
  expect(new Set([...firstPage.channels, ...secondPage.channels].map((channel) => channel.id)).size).toBe(3);
  const legacyCatalog = await requestAsToken(page, fixture.alice.token, "/channels?scope=all");
  expect(Array.isArray(legacyCatalog.channels.find((channel) => channel.name === publicName)?.members)).toBe(true);

  await page.goto("/");
  await page.getByTestId("browse-channels").click();

  await expect(page.getByTestId("channel-browser")).toBeVisible();
  await expect(page.getByTestId("browse-channels")).toHaveClass(/active/);
  await expect(page.getByTestId("browse-channels")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("channel-row-general")).not.toHaveClass(/active/);
  await page.getByTestId(`channel-row-${fixture.projectChannel.name}`).click();
  await expect(page.getByTestId("channel-browser")).toBeHidden();
  await expect(page.getByText(`#${fixture.projectChannel.name}`, { exact: true }).first()).toBeVisible();

  await page.getByTestId("browse-channels").click();
  await expect(page.getByTestId("channel-browser")).toBeVisible();
  const browserSearch = page.getByTestId("channel-browser-search");
  await expect(browserSearch).not.toBeFocused();
  await browserSearch.fill(publicName);
  await expect.poll(() => browserSearch.evaluate((input) => getComputedStyle(input).boxShadow)).toBe("none");
  await page.getByTestId("channel-browser-search-clear").click();
  await expect(browserSearch).toBeFocused();
  await expect(browserSearch).toHaveValue("");
  await browserSearch.fill(publicName);
  const row = page.getByTestId(`browse-channel-${publicName}`);
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("No topic has been added yet.");
  await expect(row.getByRole("button", { name: `Join #${publicName}` })).toBeVisible();

  await row.getByRole("button", { name: `Join #${publicName}` }).click();
  await expect(row.getByRole("button", { name: `Open #${publicName}`, exact: true })).toBeVisible();
  await expect(page.getByTestId(`channel-row-${publicName}`)).toBeVisible();

  await row.getByRole("button", { name: `Open #${publicName}`, exact: true }).click();
  await expect(page.getByTestId("channel-browser")).toBeHidden();
  await expect(page.getByText(`#${publicName}`, { exact: true }).first()).toBeVisible();
});

test("keeps channel header actions inside the header when pinned panel is open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.goto("/");
  await page.getByText(fixture.projectChannel.name, { exact: true }).click();
  await expect(page.getByTestId("channel-topic")).toHaveCSS("text-align", "left");
  await page.getByRole("button", { name: "Pinned messages" }).click();

  await expect(page.getByTestId("pinned-panel")).toBeVisible();
  const header = await page.getByTestId("channel-header").boundingBox();
  const leave = await page.getByTestId("channel-leave").boundingBox();
  const bounds = {
    headerRight: header.x + header.width,
    leaveRight: leave.x + leave.width,
    documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
    viewportWidth: await page.evaluate(() => window.innerWidth),
  };

  expect(bounds.leaveRight).toBeLessThanOrEqual(bounds.headerRight + 1);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
});

test("aligns thread chrome with the conversation and labels replies clearly", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: `# ${fixture.projectChannel.name}` }).click();

  const root = messageById(page, fixture.messages.threadRoot.id);
  await root.hover();
  await page.getByTestId(/-actions$/).getByTitle("Reply in thread").click();

  const thread = page.getByTestId("thread-panel");
  await expect(thread).toBeVisible();
  await expect(thread.getByTestId("thread-context")).toHaveText(`in #${fixture.projectChannel.name}`);
  await expect(thread.getByTestId("composer-editor")).toHaveAttribute(
    "data-placeholder",
    "Reply to thread…"
  );
  await expect(thread.getByTestId("thread-reply-count")).toHaveText(/\d+ (?:reply|replies)/);

  const channelHeader = await page.getByTestId("channel-header").boundingBox();
  const threadHeader = await page.getByTestId("thread-header").boundingBox();
  const mainComposer = await page.getByTestId("composer").first().boundingBox();
  const threadComposer = await thread.getByTestId("composer").boundingBox();
  const offsets = {
    headerBottom: Math.abs(channelHeader.y + channelHeader.height - (threadHeader.y + threadHeader.height)),
    composerBottom: Math.abs(mainComposer.y + mainComposer.height - (threadComposer.y + threadComposer.height)),
  };

  expect(offsets.headerBottom).toBeLessThanOrEqual(1);
  expect(offsets.composerBottom).toBeLessThanOrEqual(1);
});

test("copies the raw markdown body from a message", async ({ page }) => {
  const { id, message } = await openFreshGeneralMessage(
    page,
    "copy-markdown",
    fixture.messages.formatted.body
  );

  await message.hover();
  const moreActions = page.getByTestId(`message-${id}-actions`).getByTitle("More message actions");
  await expect(moreActions).toBeVisible();
  await moreActions.click();
  await page.getByRole("menuitem", { name: "Copy message" }).click();

  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(fixture.messages.formatted.body);
});

test("quotes a message into the composer", async ({ page }) => {
  await page.goto(`/dms/${fixture.bob.username}`);
  const message = messageById(page, fixture.messages.dmMessage.id);
  await expect(message).toBeVisible();

  await message.hover();
  const moreActions = page.getByTestId(`message-${fixture.messages.dmMessage.id}-actions`).getByTitle("More message actions");
  await expect(moreActions).toBeVisible();
  await moreActions.click();
  const menu = page.getByRole("menu", { name: "Message actions" });
  await expect(menu.getByRole("menuitem", { name: "Quote message" })).toHaveCount(0);
  await page.locator(".menu-overlay").click({ position: { x: 1, y: 1 } });

  const quoteAction = page.getByTestId(`message-${fixture.messages.dmMessage.id}-actions`)
    .getByTestId(`message-${fixture.messages.dmMessage.id}-quote`);
  await expect(quoteAction).toBeVisible();
  await quoteAction.click();

  const editor = page.getByTestId("composer-editor");
  await expect(editor.locator("blockquote")).toContainText("Bob Builder said:");
  await expect(editor.locator("blockquote")).toContainText("Bob's DM hello");

  const reply = `How are you? ${fixture.suffix}`;
  await editor.type(reply);
  await page.getByTestId("composer-send").click();
  await expect(page.getByText(reply)).toBeVisible();

  const { messages } = await requestAsToken(
    page,
    fixture.alice.token,
    `/channels/${fixture.dmChannel.id}/messages`
  );
  const sent = messages.find((message) => message.body.includes(reply));
  expect(sent?.body).toContain(`> Bob Builder said:`);
  expect(sent?.body).toContain("Bob's DM hello");
  expect(sent?.body).toContain(reply);
});

test("pastes markdown into the composer as formatted content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("composer-editor")).toBeVisible();

  await page.getByTestId("composer-editor").focus();
  await page.evaluate((body) => {
    const editor = document.querySelector('[data-testid="composer-editor"]');
    const data = new DataTransfer();
    data.setData("text/plain", body);
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
  }, fixture.messages.formatted.body);

  const editor = page.getByTestId("composer-editor");
  await expect(editor.locator("h1")).toHaveText("Heading 1");
  await expect(editor.locator("strong")).toHaveText("Bold text");
  await expect(editor.locator("s, del")).toHaveText("Strikethrough text");
  await expect(editor.locator("pre code")).toContainText("formatted via API");
  await expect(editor.locator("blockquote")).toContainText("Quote line");
  await expect(editor.locator("li")).toContainText(["Bullet item", "Numbered item"]);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("Echo link");
});

test("serializes Tiptap content through the existing Markdown message contract", async ({ page }) => {
  await page.goto("/");
  const marker = `Tiptap contract ${Date.now()}`;
  const body = `# ${marker}\n\n**Bold** and ~~strike~~ with [a link](https://example.com)\n\n- List item\n\n\`\`\`js\nconst compatible = true;\n\`\`\``;
  const expectedBody = `# ${marker}\n\n**Bold** and ~~strike~~ with [a link](https://example.com)\n\n-   List item\n\n\`\`\`js\nconst compatible = true;\n\`\`\``;
  const editor = page.getByTestId("composer-editor");
  await editor.focus();
  await page.evaluate((markdown) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", markdown);
    document.querySelector('[data-testid="composer-editor"]').dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
  }, body);
  await page.getByTestId("composer-send").click();
  await expect(page.getByText(marker)).toBeVisible();

  const { messages } = await requestAsToken(
    page,
    fixture.alice.token,
    `/channels/${fixture.generalChannel.id}/messages`
  );
  expect(messages.find((message) => message.body.includes(marker))?.body).toBe(expectedBody);
});

test("opens Echo message links in the current tab and external links in a new tab", async ({ page }) => {
  const echoMessage = await openFreshGeneralMessage(
    page,
    "echo-link-menu",
    `[Echo message](/channels/${fixture.generalChannel.id}?message=${fixture.messages.formatted.id})`
  );
  const echoOpenLink = echoMessage.message.locator(".body a");
  await expect(echoOpenLink).not.toHaveAttribute("target", "_blank");
  await echoOpenLink.click();
  await expect(page).toHaveURL(new RegExp(`/channels/${fixture.generalChannel.name}\\?message=${fixture.messages.formatted.id}`));

  const externalMessage = await openFreshGeneralMessage(
    page,
    "external-link-menu",
    "[External link](https://example.com/echo-external-link)"
  );
  const externalOpenLink = externalMessage.message.locator(".body a");
  await expect(externalOpenLink).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await externalOpenLink.click();
  const popup = await popupPromise;
  expect(popup).toBeTruthy();
});

test("resets the composer placeholder after deleting the draft", async ({ page }) => {
  await page.goto("/");
  await channelRow(page, "general").click();
  const editor = page.getByTestId("composer-editor");

  await expect(editor).toHaveAttribute("data-placeholder", "Message #general");
  await expect(editor.locator("p.is-editor-empty")).toHaveCount(1);
  await editor.fill("temporary draft");
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");

  await expect(editor).toHaveText("");
  await expect(editor.locator("p.is-editor-empty")).toHaveCount(1);
});

test("clears message actions when leaving the message row but keeps them over the toolbar", async ({ page }) => {
  const { message } = await openFreshGeneralMessage(
    page,
    "message-actions",
    `Message actions ${fixture.suffix}`
  );

  await message.hover();
  const actions = page.getByTestId(/message-.*-actions/).first();
  await expect(actions).toBeVisible();

  const actionsBox = await actions.boundingBox();
  expect(actionsBox).not.toBeNull();
  await page.mouse.move(actionsBox.x + 8, actionsBox.y + 8);
  await expect(actions).toBeVisible();

  const messageBox = await message.boundingBox();
  const messagesBox = await page.getByTestId("messages").boundingBox();
  expect(messageBox).not.toBeNull();
  expect(messagesBox).not.toBeNull();
  await page.mouse.move(
    Math.min(messagesBox.x + messagesBox.width - 4, messageBox.x + messageBox.width + 80),
    messageBox.y + Math.min(8, messageBox.height / 2)
  );
  await expect(actions).toBeHidden();
});

test("keeps copy-and-paste message paragraphs flush with the composer", async ({ page }) => {
  const body = `Copy and paste ${fixture.suffix}`;
  const { message: source } = await openFreshGeneralMessage(page, "copy-paste", body);
  await source.hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Copy message" }).click();

  const editor = page.getByTestId("composer-editor");
  await editor.focus();
  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="composer-editor"]');
    const data = new DataTransfer();
    data.setData("text/plain", window.__copiedText || "");
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
  });

  await expect(editor.locator("p")).toHaveCount(1);
  await expect(editor).toContainText(body);
});

test("uses Enter for new list items and Shift+Enter for list line breaks", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByTestId("composer-editor");
  await expect(editor).toBeVisible();

  await editor.click();
  await page.getByTitle("Bulleted list").click();
  await page.keyboard.type("List item one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("List item two");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("After list");

  const items = editor.locator("ul > li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText("List item one");
  await expect(items.nth(1)).toHaveText("List item twoAfter list");
  await expect(items.nth(1).locator("br")).toHaveCount(1);
});

test("starts lists after existing composer text", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByTestId("composer-editor");
  await expect(editor).toBeVisible();

  for (const [title, listSelector] of [["Ordered list", "ol"], ["Bulleted list", "ul"]]) {
    await editor.fill("Regular text");
    await page.getByTitle(title).click();
    await page.keyboard.type("First item");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second item");

    await expect(editor.locator(":scope > p")).toHaveText("Regular text");
    await expect(editor.locator(`:scope > ${listSelector} > li`)).toHaveCount(2);
    await expect(editor.locator(`:scope > ${listSelector}`)).toContainText("First item");
    await expect(editor.locator(`:scope > ${listSelector}`)).toContainText("Second item");
  }
});

test("uses Shift+Enter for code newlines and Enter to exit the block", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByTestId("composer-editor");
  await expect(editor).toBeVisible();

  await editor.click();
  await page.getByTitle("Code block").click();
  await page.keyboard.type("const value = 1;");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("console.log(value);");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After code");

  await expect(editor.locator("pre code")).toContainText("const value = 1;");
  await expect(editor.locator("pre code")).toContainText("console.log(value);");
  await expect(editor.locator("p").filter({ hasText: "After code" })).toHaveText("After code");
});

test("updates composer formatting buttons immediately", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByTestId("composer-editor");
  await editor.click();

  for (const testId of ["composer-bold", "composer-italic", "composer-strikethrough", "composer-blockquote", "composer-code", "composer-code-block"]) {
    const button = page.getByTestId(testId);
    await button.click();
    await expect(button).toHaveClass(/active/);
    await button.click();
    await expect(button).not.toHaveClass(/active/);
  }
});

test("uses an empty quoted line to exit a blockquote", async ({ page }) => {
  await page.goto("/");

  const editor = page.getByTestId("composer-editor");
  await editor.click();
  await page.getByTitle("Blockquote").click();
  await page.keyboard.type("Quoted text");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After quote");

  await expect(editor.locator("blockquote")).toHaveText("Quoted text");
  await expect(editor.locator(":scope > p").filter({ hasText: "After quote" })).toHaveText("After quote");
});

test("sends multiple messages from the same composer", async ({ page }) => {
  await page.goto("/");
  await channelRow(page, "general").click();
  await expect(page.getByTestId("channel-title")).toContainText("general");

  const composer = page.getByTestId("composer-editor");
  await expect(composer).toBeVisible();

  const first = `Multi-send regression 1 ${Date.now()}`;
  const second = `Multi-send regression 2 ${Date.now()}`;

  await composer.fill(first);
  await composer.press("Enter");
  await expect(page.locator(".message").filter({ hasText: first })).toBeVisible({ timeout: 10_000 });

  await composer.fill(second);
  await composer.press("Enter");
  await expect(page.locator(".message").filter({ hasText: second })).toBeVisible({ timeout: 10_000 });
});

test("shows activity items and marks activity as read", async ({ page }) => {
  const markedRead = page.waitForResponse(
    (res) => res.url().includes("/api/activity/read") && res.request().method() === "POST"
  );

  await page.goto("/");
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Activity ping ${Date.now()}`,
      externalKey: `activity-${Date.now()}`,
    },
  });
  const activityRail = railItem(page, "activity");
  await expect(activityRail).toBeVisible();
  await activityRail.click();

  await expect(page.getByTestId("activity-header")).toContainText("Activity", { timeout: 15_000 });
  const activityItem = page.getByTestId("activity-item").first();
  await expect(activityItem).toBeVisible();
  await markedRead;
});

test("opens the exact message from Activity", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "activity", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();

  await expect(page.getByTestId("activity-header")).toBeVisible();
  const visibleMentionBody = fixture.messages.mention.body.replace(
    `@${fixture.alice.username}`,
    `@${fixture.alice.displayName}`
  );
  const mentionText = page.getByText(visibleMentionBody, { exact: false }).first();
  await expect(mentionText).toBeVisible();
  await mentionText.click();

  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect(messageById(page, fixture.messages.mention.id)).toBeVisible();
});

test("opens a public-channel mention even when the user is not in the channel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  const stamp = Date.now();
  const channelName = `public-activity-${stamp}`;
  const publicChannel = await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  const mentionBody = `Public activity mention ${stamp} @${fixture.alice.username}`;
  const visibleMentionBody = mentionBody.replace(
    `@${fixture.alice.username}`,
    `@${fixture.alice.displayName}`
  );
  const mention = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: publicChannel.channel.id,
      body: mentionBody,
      externalKey: `public-activity-mention-${stamp}`,
    },
  });

  await railItem(page, "activity").click();
  const activityEntry = page.getByText(visibleMentionBody, { exact: false }).first();
  await expect(activityEntry).toBeVisible();
  await activityEntry.click();

  await expect(page.getByTestId("channel-title")).toContainText(channelName);
  await expect(page.getByText(`You're previewing #${channelName}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Join channel" })).toBeVisible();
  await expect(messageById(page, mention.message.id)).toBeInViewport();
});

test("opens a thread activity item at the exact reply", async ({ page }) => {
  const stamp = Date.now();
  const threadMentionText = `Thread mention ${stamp}`;
  const reply = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      parentId: fixture.messages.threadRoot.id,
      body: `${threadMentionText} @${fixture.alice.username}`,
      externalKey: `thread-mention-${stamp}`,
    },
  });

  await page.goto("/");
  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "activity", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();

  await expect(page.getByTestId("activity-header")).toBeVisible();
  const activityItem = page.getByText(threadMentionText, { exact: false }).first();
  await expect(activityItem).toBeVisible();
  await activityItem.click();

  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await expect(messageById(page, reply.message.id)).toBeInViewport();
});

test("shows saved messages and removes one from saved", async ({ page }) => {
  const unsave = page.waitForResponse(
    (res) => res.url().includes("/api/saved/") && res.request().method() === "POST"
  );

  await page.goto("/");
  const savedBefore = await requestAsToken(page, fixture.alice.token, "/saved");
  if ((savedBefore.items || []).some((item) => item.id === fixture.messages.searchHit.id)) {
    await requestAsToken(page, fixture.alice.token, `/saved/${fixture.messages.searchHit.id}`, {
      method: "POST",
    });
  }
  await requestAsToken(page, fixture.alice.token, `/saved/${fixture.messages.searchHit.id}`, {
    method: "POST",
  });
  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "saved", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();

  await expect(page.getByTestId("saved-header")).toBeVisible();
  const savedItem = page.getByTestId("saved-item").filter({ hasText: fixture.messages.searchHit.body });
  await expect(savedItem).toBeVisible();
  await savedItem.click();
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect(messageById(page, fixture.messages.searchHit.id)).toBeInViewport();
  await page.goBack();
  await expect(page.getByTestId("saved-header")).toBeVisible();

  await page.getByTestId("saved-item").filter({ hasText: fixture.messages.searchHit.body }).locator('[data-testid^="saved-remove-"]').click();

  await expect(savedItem).toHaveCount(0);
  await unsave;
});

test("opens a profile from an @mention in a message", async ({ page }) => {
  const { message: mention } = await openFreshGeneralMessage(
    page,
    "profile-mention",
    `Profile mention @${fixture.alice.username}`
  );

  await mention.locator(".mention--me").click();

  await expect(page.getByTestId("profile-modal")).toBeVisible();
  await expect(page.getByTestId("profile-modal")).toContainText(fixture.alice.displayName);
  await expect(page.getByTestId("profile-modal")).toContainText(`@${fixture.alice.username}`);
});

test("opens a DM at the latest message when there is no unread history", async ({ page }) => {
  const selfDm = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userId: fixture.alice.id },
  });
  const selfChannelId = selfDm.channel.id;

  for (let i = 0; i < 6; i += 1) {
    await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: selfChannelId,
        body: `DM scroll seed ${i} ${Date.now()}`,
        externalKey: `dm-scroll-${i}-${Date.now()}`,
      },
    });
  }
  await requestAsToken(page, fixture.alice.token, `/channels/${selfChannelId}/read`, {
    method: "POST",
  });

  await page.goto("/");
  await page.getByRole("button", { name: "DMs" }).click();
  await page.getByTestId("dm-self-open").click();

  const scroller = page.getByTestId("messages");
  await expect.poll(async () => {
    return scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  }).toBeLessThanOrEqual(2);
});

test("opens unread DMs at the new divider instead of restoring the old position", async ({ page }) => {
  for (let i = 0; i < 24; i += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.dmChannel.id,
        body: `DM restore seed ${i} ${Date.now()}`,
        externalKey: `dm-restore-${i}-${Date.now()}`,
      },
    });
  }

  await page.goto("/");
  await page.getByRole("button", { name: "DMs" }).click();
  await expect(dmRow(page, fixture.bob.displayName)).toBeVisible();
  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();

  const scroller = page.getByTestId("messages");
  await expect(scroller).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el) => Math.max(0, el.scrollHeight - el.clientHeight))).toBeGreaterThan(180);
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 180);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await railItem(page, "home").click();
  await channelRow(page, "general").click();
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.dmChannel.id,
      body: `DM unread restore ${Date.now()}`,
      externalKey: `dm-unread-restore-${Date.now()}`,
    },
  });

  await page.getByRole("button", { name: "DMs" }).click();
  await expect(dmRow(page, fixture.bob.displayName)).toBeVisible();
  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();

  await expect(page.locator(".new-divider")).toBeVisible();
  await expect.poll(async () => {
    return scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  }).toBeGreaterThan(0);
});

test("searches messages with filters and displays results", async ({ page }) => {
  let requestedUrl = "";
  page.on("request", (request) => {
    if (request.url().includes("/api/search/messages")) requestedUrl = request.url();
  });

  await page.goto("/");
  const searchInput = page.getByTestId("search-input");
  await searchInput.fill(`Welcome in:general from:@${fixture.alice.username} has:link`);
  // Put the caret outside the filter token so Enter submits the complete
  // query instead of selecting an autocomplete suggestion.
  await searchInput.press("Home");
  await searchInput.press("Enter");

  await expect(page.getByTestId("search-results-header")).toContainText("Search");
  await expect(page.locator(".search-chip-from")).toContainText(`@${fixture.alice.username}`);
  await expect(page.getByText("in: #general")).toBeVisible();
  await expect(page.getByText("has: link")).toBeVisible();
  await expect(page.getByTestId("search-result")).toContainText(fixture.messages.searchHit.body);
  await expect(page.getByTestId("search-result").locator("mark")).toContainText("Welcome");
  await expect.poll(() => decodeURIComponent(requestedUrl)).toContain(
    `q=Welcome in:general from:@${fixture.alice.username} has:link`
  );
});

test("navigates grouped search results with the keyboard", async ({ page }) => {
  const uniqueSearchToken = fixture.messages.searchHit.body.match(/only-token-[^ ]+/)?.[0];
  expect(uniqueSearchToken).toBeTruthy();
  await page.goto(`/search?q=${encodeURIComponent(uniqueSearchToken)}`);

  const pane = page.getByTestId("search-results-pane");
  await expect(pane).toBeFocused();
  await expect(page.getByTestId("search-result").filter({ hasText: fixture.messages.searchHit.body })).toHaveCount(1);
  const result = page.getByTestId("search-result").filter({ hasText: fixture.messages.searchHit.body });
  await expect(result).toHaveClass(/active/);

  await pane.press("Enter");
  await expect(messageById(page, fixture.messages.searchHit.id)).toBeVisible();
});

test("clicking a search result jumps to and highlights that exact message", async ({ page }) => {
  const token = fixture.messages.searchHit.body.match(/only-token-[^ ]+/)?.[0];
  expect(token).toBeTruthy();
  await page.goto(`/search?q=${encodeURIComponent(token)}`);

  const result = page.getByTestId("search-result").filter({ hasText: fixture.messages.searchHit.body });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(new RegExp(`/channels/general\\?message=${fixture.messages.searchHit.id}`));
  await expect(messageById(page, fixture.messages.searchHit.id)).toHaveClass(/flash/);
});
