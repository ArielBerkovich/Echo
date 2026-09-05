import { expect, type Locator, type Page, test } from "@playwright/test";
import { messageById, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

const GIT_PULL_REQUEST = "git-pull-request";

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function selectGitEmoji(picker: Locator) {
  const search = picker.locator('input[type="search"]');
  await expect(search).toBeVisible();
  await search.fill("git pull request");

  const gitPullRequest = picker.locator(`button[title="${GIT_PULL_REQUEST}"]`);
  await expect(gitPullRequest).toBeVisible();
  await gitPullRequest.click();
}

async function expectGitEmojiInComposer(editor: Locator) {
  await expect(editor.locator(`img.custom-emoji[alt=":${GIT_PULL_REQUEST}:"]`)).toBeVisible();
}

function emojiPicker(page: Page) {
  return page.locator(".emoji-popup-wrap");
}

test.describe("custom emoji pickers", () => {
  test("inserts a Git emoji from the channel composer above message controls", async ({ page }) => {
    await page.goto("/");
    const editor = page.getByTestId("composer-editor");
    await page.getByTestId("composer-emoji-toggle").click();

    const picker = emojiPicker(page);
    await expect(picker).toBeVisible();

    // The picker is a body portal and must remain above floating message
    // controls while a message is hovered.
    const message = messageById(page, fixture.messages.searchHit.id);
    await message.hover();
    await expect(page.getByTestId(`message-${fixture.messages.searchHit.id}-actions`)).toBeVisible();
    await expect
      .poll(() => picker.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex, 10)))
      .toBeGreaterThan(1_000);

    await selectGitEmoji(picker);
    await expect(picker).toBeHidden();
    await expectGitEmojiInComposer(editor);
  });

  test("inserts a Git emoji into a new direct-message draft", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("start-dm").click();
    const modal = page.getByTestId("new-message-modal");
    await modal.getByTestId("new-message-search-input").fill(fixture.bob.username);
    await modal.getByTestId(`new-message-user-${fixture.bob.username}`).click();

    const editor = modal.getByTestId("composer-editor");
    await modal.getByTestId("composer-emoji-toggle").click();
    const picker = emojiPicker(page);
    await expect(picker.locator('input[type="search"]')).toBeFocused();

    await selectGitEmoji(picker);
    await expectGitEmojiInComposer(editor);
    await expect(modal).toBeVisible();
  });

  test("inserts a Git emoji into a forward note", async ({ page }) => {
    await page.goto("/");
    const source = messageById(page, fixture.messages.searchHit.id);
    await source.hover();
    await page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`).click({ force: true });

    const modal = page.getByTestId("forward-modal");
    const editor = modal.getByTestId("composer-editor");
    await expect(editor).toBeVisible();
    const emojiToggle = modal.getByTestId("composer-emoji-toggle");
    await expect(emojiToggle).toBeVisible();
    await emojiToggle.click();
    const picker = emojiPicker(page);
    await expect(picker.locator('input[type="search"]')).toBeFocused();

    await selectGitEmoji(picker);
    await expectGitEmojiInComposer(editor);
    await expect(modal).toBeVisible();
  });

  test("inserts a Git emoji into a thread reply", async ({ page }) => {
    await page.goto(`/channels/${fixture.projectChannel.name}`);
    const root = messageById(page, fixture.messages.threadRoot.id);
    await expect(root).toBeVisible();
    await root.hover();
    await page.getByTestId(`message-${fixture.messages.threadRoot.id}-reply`).click();

    const panel = page.getByTestId("thread-panel");
    const editor = panel.getByTestId("composer-editor");
    await panel.getByTestId("composer-emoji-toggle").click();
    const picker = emojiPicker(page);

    await selectGitEmoji(picker);
    await expectGitEmojiInComposer(editor);
  });

  test("adds a Git emoji from the full reaction picker", async ({ page }) => {
    await page.goto("/");
    const message = messageById(page, fixture.messages.searchHit.id);
    await message.hover();
    await page.getByTestId(`message-${fixture.messages.searchHit.id}-add-reaction-action`).click();
    await page.getByRole("dialog", { name: "Choose a reaction" })
      .getByRole("button", { name: /More emojis/ })
      .click();

    const picker = page.locator(".reaction-picker-full .emoji-popup-wrap");
    await selectGitEmoji(picker);

    const reaction = message.getByTestId(`message-${fixture.messages.searchHit.id}-reaction--git-pull-request-`);
    await expect(reaction.locator(`img.custom-emoji[alt=":${GIT_PULL_REQUEST}:"]`)).toBeVisible();
  });
});
