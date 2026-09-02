import { expect, type Locator, type Page, test } from "@playwright/test";
import { dmRow, messageById, railItem, registerUser, requestAsToken, seedWorkspaceFixture, uniqueSuffix, uploadAsToken } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

function forwardModal(page: Page) {
  return page.getByTestId("forward-modal");
}

function destinationByLabel(modal: Locator, label: string) {
  return modal.locator(".forward-destination-row").filter({ hasText: label }).first();
}

async function openForwardDialog(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  const source = messageById(page, fixture.messages.searchHit.id);
  await expect(source).toBeVisible({ timeout: 15_000 });
  await source.hover();
  const forward = page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`);
  await expect(forward).toBeVisible();
  await forward.click({ force: true });
  await expect(forwardModal(page)).toBeVisible();
}

async function tabTo(page: Page, locator: Locator) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Could not reach locator with Tab");
}

async function expectForwardedWithNote(page: Page, channelId: string, note: string) {
  await expect
    .poll(async () => {
      const result = await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/messages?forwardNote=${encodeURIComponent(note)}`);
      return result.messages.some((message) => message.forwardNote === note);
    }, { timeout: 45_000 })
    .toBeTruthy();
}

async function expectForwardedToBobDm(page: Page, note: string) {
  await expect.poll(async () => {
    const visibleDms = await requestAsToken(page, fixture.alice.token, "/dms");
    const directDms = visibleDms.conversations.filter((conversation) => conversation.memberCount === 2);
    for (const conversation of directDms) {
      const result = await requestAsToken(
        page,
        fixture.alice.token,
        `/channels/${conversation.id}/messages?forwardNote=${encodeURIComponent(note)}`
      );
      if (result.messages.some((message) => message.forwardNote === note)) return true;
    }
    return false;
  }, { timeout: 45_000 }).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test.describe("forwarding", () => {
  test("keeps the note emoji picker inside the viewport", async ({ page }) => {
    await openForwardDialog(page);
    const modal = forwardModal(page);
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

  test("inserts an emoji into the forward note and closes the picker", async ({ page }) => {
    await openForwardDialog(page);
    const modal = forwardModal(page);
    const editor = modal.getByTestId("composer-editor");
    await modal.getByTestId("composer-emoji-toggle").click();

    const picker = page.locator(".emoji-popup-wrap.is-viewport-positioned");
    await expect(picker).toBeVisible();
    await picker.locator('button[aria-label="😀"]').first().click();

    await expect(picker).toBeHidden();
    await expect(editor).toContainText("😀");
    await expect(modal).toBeVisible();
  });

  test("opens the message reaction picker and focuses emoji choices by keyboard", async ({ page }) => {
    await page.goto("/");
    const source = messageById(page, fixture.messages.searchHit.id);
    const addReaction = page.getByTestId(`message-${fixture.messages.searchHit.id}-add-reaction-action`);
    await source.focus();
    await expect(addReaction).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(addReaction).toBeFocused();
    await page.keyboard.press("Enter");

    const picker = page.getByRole("dialog", { name: "Choose a reaction" });
    await expect(picker).toBeVisible();
    const firstEmoji = picker.getByRole("button", { name: "React with thumbs up" });
    await expect(firstEmoji).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
  });

  test("opens and forwards with a note using only the keyboard", async ({ page }) => {
    await page.goto("/");
    const source = messageById(page, fixture.messages.searchHit.id);
    const forward = page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`);
    const modal = forwardModal(page);
    await source.focus();
    await expect(forward).toBeVisible();
    await page.keyboard.press("Enter");
    await tabTo(page, forward);
    await page.keyboard.press("Space");

    await expect(modal).toBeVisible();
    const search = modal.getByTestId("forward-search");
    await search.pressSequentially(fixture.projectChannel.name);
    await search.press("Enter");
    await search.press("Tab");
    const note = modal.getByTestId("composer-editor");
    await expect(note).toBeFocused();
    await note.pressSequentially("Keyboard-only forward note");
    const send = modal.getByTestId("forward-send-selected");
    await tabTo(page, send);
    await page.keyboard.press("Enter");
    await expectForwardedWithNote(page, fixture.projectChannel.id, "Keyboard-only forward note");
  });

  test("prioritizes recipient selection with compact source context", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    await expect(page.getByRole("dialog")).toHaveAccessibleName("Forward to");
    await expect(modal.locator(".forward-source-card")).toContainText(fixture.messages.searchHit.body);
    await expect(modal.locator(".forward-result-group-label")).toHaveCount(0);
    await expect(modal.getByTestId("composer-editor")).toHaveAttribute("data-placeholder", "Add context for the recipient…");
    await expect(modal.locator(".composer")).toBeVisible();
    await expect(modal.getByTestId("forward-send-selected")).toBeDisabled();

    await expect(modal.getByTestId("forward-send-selected")).toBeVisible();
  });

  test("searches destinations and keeps the note composer available", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    await modal.getByTestId("forward-search").fill(fixture.projectChannel.name);
    await expect(destinationByLabel(modal, fixture.projectChannel.name)).toBeVisible();
    await modal.getByTestId("composer-editor").click();
    await expect(modal.locator(".forward-destination-list")).toHaveCount(0);
  });

  test("does not show an empty recipient error before or after selection", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");
    await expect(modal.locator(".people-empty")).toHaveCount(0);

    const firstDestination = modal.locator(".forward-destination-row").first();
    if (await firstDestination.count()) {
      await firstDestination.click();
      await expect(modal.locator(".people-empty")).toHaveCount(0);
    }

    await search.fill("no-such-recipient");
    await expect(modal.locator(".people-empty")).toContainText("No recipients match");
    await search.fill("");
    await expect(modal.locator(".people-empty")).toHaveCount(0);
  });

  test("closes only the file preview when forwarding a message with a file", async ({ page }) => {
    const attachment = (await uploadAsToken(page, fixture.alice.token, {
      name: "forward-preview.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"forwarded":true}', "utf8"),
    })).attachments[0];
    const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.generalChannel.id,
        body: `Forward file preview ${uniqueSuffix("message")}`,
        attachments: [attachment],
      },
    });

    await page.goto("/");
    const source = messageById(page, created.message.id);
    await expect(source).toBeVisible();
    await source.hover();
    const forward = page.getByTestId(`message-${created.message.id}-forward`);
    await expect(forward).toBeVisible();
    await forward.click({ force: true });

    const modal = forwardModal(page);
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Open full-screen preview of forward-preview.json" }).click();
    const viewer = page.getByRole("dialog", { name: "Preview forward-preview.json" });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Close preview" }).click();
    await expect(viewer).toBeHidden();
    await expect(modal).toBeVisible();
  });

  test("does not show browser-local recents in the forward picker", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(({ userId, recent }) => {
      localStorage.setItem(`echo.recentSearches.user.${userId}`, JSON.stringify([recent]));
    }, {
      userId: fixture.alice.id,
      recent: {
        type: "channel",
        id: fixture.projectChannel.id,
        name: fixture.projectChannel.name,
      },
    });
    await page.reload();

    await openForwardDialog(page);
    const modal = forwardModal(page);
    await expect(modal.locator(".forward-destination-list")).toHaveCount(0);
  });

  test("moves from recipient search to the note composer with Tab", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");
    await search.fill(fixture.projectChannel.name);
    await search.press("Enter");
    await search.press("Tab");

    await expect(modal.locator(".forward-chip")).toContainText(fixture.projectChannel.name);
    await expect(modal.getByTestId("composer-editor")).toBeFocused();
    await expect(modal.getByTestId("forward-send-selected")).toBeEnabled();
  });

  test("forwards a plain-text note", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const note = "Forward context";
    await modal.getByTestId("composer-editor").fill(note);

    await modal.getByTestId("forward-search").fill(fixture.projectChannel.name);
    await destinationByLabel(modal, fixture.projectChannel.name).click();
    await modal.getByTestId("forward-send-selected").click();

    await expect(modal).toBeHidden();
    await expectForwardedWithNote(page, fixture.projectChannel.id, note);
  });

  test("does not offer editing for a forwarded message", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    await modal.getByTestId("forward-search").fill(fixture.projectChannel.name);
    await destinationByLabel(modal, fixture.projectChannel.name).click();
    await modal.getByTestId("forward-send-selected").click();
    await expect(modal).toBeHidden();

    await page.goto(`/channels/${fixture.projectChannel.name}`);
    const forwarded = page.locator(".message").filter({ has: page.locator(".forwarded-message-card") }).last();
    await expect(forwarded).toBeVisible();
    const messageId = (await forwarded.getAttribute("data-testid"))?.replace("message-", "");
    if (!messageId) throw new Error("forwarded message test id was missing");

    await forwarded.focus();
    const actions = page.getByTestId(`message-${messageId}-actions`);
    await expect(actions).toBeVisible();
    await actions.getByTestId(`message-${messageId}-more`).click();
    const menu = page.getByRole("menu", { name: "Message actions" });
    await expect(menu.getByRole("menuitem", { name: "Edit message" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Delete message" })).toBeVisible();
  });

  test("preserves Hebrew notes when forwarding", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const note = `שלום @${fixture.bob.username}`;
    const noteEditor = modal.getByTestId("composer-editor");
    await noteEditor.fill(note);
    await expect(modal.locator(".mention-popup")).toBeVisible();
    await modal.locator(".mention-item").filter({ hasText: fixture.bob.displayName }).click();

    const expectedNote = `שלום @${fixture.bob.username}`;
    await modal.getByTestId("forward-search").fill(fixture.projectChannel.name);
    await destinationByLabel(modal, fixture.projectChannel.name).click();
    await modal.getByTestId("forward-send-selected").click();
    await expect(modal).toBeHidden();

    const forwardedNote = page.locator(".forward-note").filter({ hasText: "שלום" }).last();
    await expect(forwardedNote).toBeVisible();
    await expect(forwardedNote.locator(`[data-mention="${fixture.bob.username}"]`)).toHaveText(
      `@${fixture.bob.displayName}`
    );
    await expect(forwardedNote).toHaveAttribute("dir", "auto");
    await expect(forwardedNote).toHaveCSS("text-align", "left");
    await expectForwardedWithNote(page, fixture.projectChannel.id, expectedNote);
  });

  test("searches all people and preserves the target selection", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");
    const send = modal.getByTestId("forward-send-selected");
    await search.fill(fixture.bob.displayName);

    await expect(modal.locator(".forward-result-group-label")).toHaveText("People and direct messages");
    await expect(modal.locator('.forward-destination-copy strong').first()).toBeVisible();
    await expect(modal.locator(".forward-destination-row").filter({ hasText: fixture.projectChannel.name })).toHaveCount(0);
    const bobTarget = destinationByLabel(modal, fixture.bob.displayName);
    await expect(bobTarget.locator(".avatar")).toBeVisible();
    await expect(bobTarget).toBeVisible();
    await bobTarget.click();
    await expect(send).toBeEnabled();

    await search.fill("");
    await expect(modal.locator(".forward-destination-list")).toHaveCount(0);
    await expect(modal.locator(".forward-chip")).toContainText(fixture.bob.displayName);
    await expect(send).toBeEnabled();
  });

  test("selects multiple targets and forwards the same note to all", async ({ page }) => {
    test.setTimeout(150_000);
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");
    const note = `Forward note ${Date.now()}`;
    const sourceTitle = await page.getByTestId("channel-title").innerText();
    const noteEditor = modal.getByTestId("composer-editor");
    await noteEditor.fill(note);
    await expect(noteEditor).toContainText(note);

    await search.fill(fixture.bob.displayName);
    await destinationByLabel(modal, fixture.bob.displayName).click();
    await expect(modal.locator(".forward-chip").filter({ hasText: fixture.bob.displayName })).toBeVisible();

    await search.fill(fixture.projectChannel.name);
    const projectTarget = destinationByLabel(modal, fixture.projectChannel.name);
    await expect(projectTarget).toBeVisible();
    await projectTarget.click();
    await expect(modal.locator(".forward-chip").filter({ hasText: fixture.projectChannel.name })).toBeVisible();

    const send = modal.getByTestId("forward-send-selected");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(modal).toBeHidden();

    const currentProject = await requestAsToken(
      page,
      fixture.alice.token,
      `/channels/by-name/${encodeURIComponent(fixture.projectChannel.name)}`
    );
    await expectForwardedWithNote(page, currentProject.channel.id, note);
    await expectForwardedToBobDm(page, note);
    await expect(page.getByTestId("channel-title")).toHaveText(sourceTitle);
  });

  test("adds newly contacted recipients to the DM list after forwarding", async ({ page }) => {
    const suffix = uniqueSuffix("forward-dms").replace(/[^a-z0-9]/gi, "").slice(-16);
    const recipients = await Promise.all([
      registerUser(page, { username: `forward.one${suffix}`, displayName: "Forward One" }),
      registerUser(page, { username: `forward.two${suffix}`, displayName: "Forward Two" }),
    ]);

    await openForwardDialog(page);
    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");

    for (const recipient of recipients) {
      await search.fill(recipient.user.username);
      await destinationByLabel(modal, recipient.user.displayName).click();
    }

    await modal.getByTestId("forward-send-selected").click();
    await expect(modal).toBeHidden();
    await railItem(page, "dms").click();

    for (const recipient of recipients) {
      await expect(dmRow(page, recipient.user.displayName)).toBeVisible();
    }
  });

  test("opens a newly contacted recipient after a single forward", async ({ page }) => {
    const suffix = uniqueSuffix("forward-single").replace(/[^a-z0-9]/gi, "").slice(-16);
    const recipient = await registerUser(page, {
      username: `forward.solo${suffix}`,
      displayName: "Forward Solo",
    });

    await openForwardDialog(page);
    const modal = forwardModal(page);
    await modal.getByTestId("forward-search").fill(recipient.user.username);
    await destinationByLabel(modal, recipient.user.displayName).click();
    await modal.getByTestId("forward-send-selected").click();

    await expect(modal).toBeHidden();
    await expect(page.getByTestId("channel-title")).toContainText(recipient.user.displayName);
    await expect(dmRow(page, recipient.user.displayName)).toBeVisible();
  });

  test("keeps the composer send action visible while the recipient list owns scrolling", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const list = modal.locator(".forward-destination-list");
    const send = modal.getByTestId("forward-send-selected");
    await modal.getByTestId("forward-search").fill(fixture.bob.displayName);
    await expect(list).toBeVisible();
    await expect(send).toBeVisible();
  });
});
