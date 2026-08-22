import { expect, type Locator, type Page, test } from "@playwright/test";
import { dmRow, messageById, railItem, registerUser, requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

function forwardModal(page: Page) {
  return page.getByTestId("forward-modal");
}

function destinationByLabel(modal: Locator, label: string) {
  return modal.locator(".forward-destination-row").filter({ hasText: label }).first();
}

async function openForwardDialog(page: Page) {
  await page.goto("/");
  const source = messageById(page, fixture.messages.searchHit.id);
  await expect(source).toBeVisible();
  await source.hover();
  const forward = page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`);
  await expect(forward).toBeVisible();
  await forward.click({ force: true });
  await expect(forwardModal(page)).toBeVisible();
}

async function channelMessages(page: Page, channelId: string) {
  const result = await requestAsToken(page, fixture.alice.token, `/channels/${channelId}/messages`);
  return result.messages;
}

async function expectForwardedWithNote(page: Page, channelId: string, note: string) {
  await expect.poll(async () => {
    const messages = await channelMessages(page, channelId);
    return messages.some((message) => message.forwardNote === note);
  }).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test.describe("forwarding", () => {
  test("previews the source and keeps the note optional", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    await expect(modal).toContainText(fixture.messages.searchHit.body);
    await expect(modal).toContainText("Original message");
    await expect(modal.getByTestId("forward-note-field")).toContainText("Note");
    await expect(modal.getByTestId("forward-note-field").getByRole("button", { name: "Add a note" })).toHaveAttribute("aria-expanded", "false");
    await expect(modal.getByTestId("composer-editor")).toHaveCount(0);
    await expect(modal.locator(".forward-result-group-label")).toHaveText("Recent conversations");
    await expect(modal.getByTestId("forward-send-selected")).toBeDisabled();
  });

  test("shows recent destinations before searching and expands the optional note on demand", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    await expect(destinationByLabel(modal, fixture.projectChannel.name)).toBeVisible();
    await modal.getByRole("button", { name: "Add a note" }).click();
    await expect(modal.getByTestId("composer-editor")).toHaveAttribute("data-placeholder", "Add context for the recipient…");
    await expect(modal.getByRole("button", { name: "Hide note" })).toHaveAttribute("aria-expanded", "true");
  });

  test("keeps Enter in the note editor from sending to its synthetic channel", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const note = "Forward context";
    await modal.getByRole("button", { name: "Add a note" }).click();
    await modal.getByTestId("composer-editor").fill(note);
    await modal.getByTestId("composer-editor").press("Enter");

    await modal.getByTestId("forward-search").fill(fixture.projectChannel.name);
    await destinationByLabel(modal, fixture.projectChannel.name).click();
    await modal.getByTestId("forward-send-selected").click();

    await expect(modal).toBeHidden();
    await expectForwardedWithNote(page, fixture.projectChannel.id, note);
  });

  test("renders mentions in the forwarded note and keeps Hebrew notes left-aligned", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const note = `שלום @${fixture.bob.username}`;
    await modal.getByRole("button", { name: "Add a note" }).click();
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

    await expect(modal).toContainText("Search everyone");
    await expect(modal.locator('.forward-destination-copy strong').first()).toBeVisible();
    await expect(modal.locator(".forward-destination-row").filter({ hasText: fixture.projectChannel.name })).toHaveCount(0);
    const bobTarget = destinationByLabel(modal, fixture.bob.displayName);
    await expect(bobTarget.locator(".avatar")).toBeVisible();
    await expect(bobTarget).toBeVisible();
    await bobTarget.click();
    await expect(send).toHaveText("Forward to 1");

    await search.fill("");
    await expect(modal.locator(".forward-destination-list")).toBeVisible();
    await expect(modal.locator(".forward-result-group-label")).toHaveText("Recent conversations");
    await expect(modal.locator(".forward-chip")).toContainText(fixture.bob.displayName);
    await expect(send).toHaveText("Forward to 1");
  });

  test("selects multiple targets and forwards the same note to all", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");
    const note = `Forward note ${Date.now()}`;
    const sourceTitle = await page.getByTestId("channel-title").innerText();
    await modal.getByRole("button", { name: "Add a note" }).click();
    await modal.getByTestId("composer-editor").fill(note);

    await search.fill(fixture.bob.displayName);
    await destinationByLabel(modal, fixture.bob.displayName).click();

    await search.fill(fixture.projectChannel.name);
    const projectTarget = destinationByLabel(modal, fixture.projectChannel.name);
    await expect(projectTarget).toBeVisible();
    await projectTarget.click();

    const send = modal.getByTestId("forward-send-selected");
    await expect(send).toHaveText("Forward to 2");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(modal).toBeHidden();

    await expectForwardedWithNote(page, fixture.projectChannel.id, note);
    await expectForwardedWithNote(page, fixture.dmChannel.id, note);
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

  test("keeps the send action visible while the recipient list owns scrolling", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const list = modal.locator(".forward-destination-list");
    const actions = modal.locator(".forward-actions");
    await modal.getByTestId("forward-search").fill(fixture.bob.displayName);
    await expect(list).toBeVisible();
    await expect(actions).toBeVisible();

    const layout = await page.evaluate(() => {
      const list = document.querySelector(".forward-destination-list");
      const actions = document.querySelector(".forward-actions");
      const modal = document.querySelector(".forward-modal");
      if (!list || !actions || !modal) throw new Error("forward layout not found");
      const listStyle = getComputedStyle(list);
      const listRect = list.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const modalRect = modal.getBoundingClientRect();
      return {
        listOverflowY: listStyle.overflowY,
        listBottom: listRect.bottom,
        actionsTop: actionsRect.top,
        actionsBottom: actionsRect.bottom,
        modalBottom: modalRect.bottom,
        viewportBottom: window.innerHeight,
      };
    });

    expect(layout.listOverflowY).toBe("auto");
    expect(layout.listBottom).toBeLessThanOrEqual(layout.actionsTop + 1);
    expect(layout.actionsBottom).toBeLessThanOrEqual(layout.modalBottom + 1);
    expect(layout.actionsBottom).toBeLessThanOrEqual(layout.viewportBottom + 1);
  });
});
