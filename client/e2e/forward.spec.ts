import { expect, type Locator, type Page, test } from "@playwright/test";
import { messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

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
  await page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`).click();
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
    await expect(modal.locator(".forward-note-field .forward-field-heading")).toContainText("Note");
    await expect(modal.locator("textarea")).toHaveAttribute("placeholder", /Add context/);
    await expect(modal.getByTestId("forward-send-selected")).toBeDisabled();
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
    await expect(modal.locator(".forward-destination-list")).toHaveCount(0);
    await expect(modal.locator(".forward-chip")).toContainText(fixture.bob.displayName);
    await expect(send).toHaveText("Forward to 1");
  });

  test("selects multiple targets and forwards the same note to all", async ({ page }) => {
    await openForwardDialog(page);

    const modal = forwardModal(page);
    const search = modal.getByTestId("forward-search");
    const note = `Forward note ${Date.now()}`;
    await modal.locator("textarea").fill(note);

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
