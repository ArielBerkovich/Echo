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

async function openForwardDialog(page: Page) {
  await page.goto("/");
  const source = messageById(page, fixture.messages.searchHit.id);
  await expect(source).toBeVisible({ timeout: 15_000 });
  await source.hover();
  const forward = page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`);
  await expect(forward).toBeVisible();
  await forward.click({ force: true });
  await expect(page.getByTestId("forward-modal")).toBeVisible();
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

  test("sends a message containing only a custom emoji", async ({ page }) => {
    await page.goto("/");
    const editor = page.getByTestId("composer-editor");
    await page.getByTestId("composer-emoji-toggle").click();
    await selectGitEmoji(emojiPicker(page));
    await expectGitEmojiInComposer(editor);

    await page.getByTestId("composer-send").click();
    await expect(editor.locator(`img.custom-emoji[alt=":${GIT_PULL_REQUEST}:"]`)).toHaveCount(0);
    await expect(page.locator(`img.custom-emoji[alt=":${GIT_PULL_REQUEST}:"]`).last()).toBeVisible();
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
    await openForwardDialog(page);

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

  test("localizes the reaction and full emoji pickers in Hebrew", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
    await page.goto("/");
    const message = messageById(page, fixture.messages.searchHit.id);
    await expect(message).toBeVisible();
    await message.hover();
    await page.getByTestId(`message-${fixture.messages.searchHit.id}-add-reaction-action`).click();

    const quickPicker = page.getByRole("dialog", { name: "בחירת תגובה" });
    const moreEmojis = quickPicker.getByRole("button", { name: /עוד אימוג׳ים/ });
    await expect(moreEmojis).toBeVisible();
    await expect(moreEmojis.locator("span")).toHaveText("←");
    await moreEmojis.click();

    const picker = page.locator(".reaction-picker-full .emoji-popup-wrap");
    await expect(picker).toHaveAttribute("dir", "rtl");
    await expect(picker.locator("em-emoji-picker")).toHaveCSS("direction", "rtl");
    await expect(picker.locator('input[type="search"]')).toHaveAttribute("placeholder", "חיפוש");
    expect(await picker.locator('input[type="search"]').evaluate((input) => getComputedStyle(input).direction)).toBe("rtl");
    const recentCategoryLabels = await picker.locator("em-emoji-picker").evaluate((host) =>
      Array.from(host.shadowRoot.querySelectorAll("*"))
        .filter((element) => element.textContent?.trim() === "אחרונים")
        .map((element) => ({
          direction: getComputedStyle(element).direction,
          textAlign: getComputedStyle(element).textAlign,
        }))
    );
    expect(recentCategoryLabels.length).toBeGreaterThan(0);
    expect(recentCategoryLabels.every(({ direction, textAlign }) => direction === "rtl" && textAlign === "right")).toBe(true);
    const categoryTabEdges = await picker.locator("em-emoji-picker").evaluate((host) => {
      const titles = new Set(["סמיילי ואנשים", "חיות וטבע", "מזון ומשקאות", "אחרונים", "פעילויות", "טיולים ומקומות", "אובייקטים", "סמלים", "דגלים"]);
      const tabs = Array.from(host.shadowRoot.querySelectorAll("button[title]"))
        .filter((button) => titles.has(button.title));
      if (tabs.length < 2) return null;
      return { firstLeft: tabs[0].getBoundingClientRect().left, lastLeft: tabs.at(-1).getBoundingClientRect().left };
    });
    expect(categoryTabEdges).not.toBeNull();
    expect(categoryTabEdges.firstLeft).toBeGreaterThan(categoryTabEdges.lastLeft);
    const categoryNav = picker.locator("em-emoji-picker").locator("#nav");
    await expect(categoryNav).toHaveAttribute("dir", "rtl");
    await picker.locator('button[title="חיות וטבע"]').click();
    await expect.poll(() => picker.locator("em-emoji-picker").evaluate((host) => {
      const selected = host.shadowRoot.querySelector('#nav button[aria-selected]');
      const underline = host.shadowRoot.querySelector("#nav .bar");
      if (!selected || !underline) return Number.POSITIVE_INFINITY;
      const selectedRect = selected.getBoundingClientRect();
      const underlineRect = underline.getBoundingClientRect();
      return Math.abs((selectedRect.left + selectedRect.right) / 2 - (underlineRect.left + underlineRect.right) / 2);
    })).toBeLessThan(2);
    for (const category of ["סמיילי ואנשים", "חיות וטבע", "מזון ומשקאות", "פעילויות", "אובייקטים"]) {
      await expect(picker.locator(`button[title="${category}"]`)).toBeVisible();
    }
    const peopleCategory = picker.locator('button[title="אנשים"]');
    if (await peopleCategory.count()) {
      await expect(peopleCategory).toHaveCSS("direction", "rtl");
      await expect(peopleCategory).toHaveCSS("text-align", "right");
    }
  });
});
