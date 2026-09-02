import { expect, test } from "@playwright/test";
import { messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function openFreshMessage(page, key, body) {
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body,
      externalKey: `${key}-${fixture.suffix}`,
    },
  });

  // Navigate directly to the conversation so this interaction test is not
  // coupled to the responsive sidebar drawer state.
  await page.goto("/channels/general");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  const message = messageById(page, created.message.id);
  await expect(message).toBeVisible();
  return { id: created.message.id, message };
}

test("keeps a message active while hovering and opening its action menu", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "hover-actions",
    `Hover action buttons ${fixture.suffix}`
  );
  const actions = page.getByTestId(`message-${id}-actions`);

  await message.hover();
  await expect(actions).toBeVisible();
  await expect(actions.getByTestId(`message-${id}-quote`)).toHaveCount(0);

  await actions.getByTestId(`message-${id}-forward`).hover();
  await expect(message).toHaveClass(/actions-hovered/);

  await actions.getByTestId(`message-${id}-more`).click();
  await expect(message).toHaveClass(/menu-open/);

  const menu = page.getByRole("menu", { name: "Message actions" });
  await expect(menu.getByRole("menuitem", { name: "Copy message", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Quote message" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Forward message" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Copy message", exact: true }).hover();
  await expect(message).toHaveClass(/menu-open/);
});

test("supports arrow-key navigation in the message actions menu", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "keyboard-actions",
    `Keyboard action navigation ${fixture.suffix}`
  );
  await message.hover();
  const actions = page.getByTestId(`message-${id}-actions`);
  await actions.getByTestId(`message-${id}-more`).click();

  const menu = page.getByRole("menu", { name: "Message actions" });
  const items = menu.getByRole("menuitem");
  await expect(items.nth(0)).toBeFocused();
  await menu.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await menu.press("ArrowUp");
  await expect(items.nth(0)).toBeFocused();
});

test("keeps a message active through reaction selection", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "hover-reaction",
    `Hover reaction picker ${fixture.suffix}`
  );
  const actions = page.getByTestId(`message-${id}-actions`);

  await message.hover();
  await actions.getByTestId(`message-${id}-add-reaction-action`).click();

  const picker = page.getByRole("dialog", { name: "Choose a reaction" });
  await expect(picker).toBeVisible();
  await expect(message).toHaveClass(/reaction-open/);
  await expect(message).toHaveClass(/actions-hovered/);

  await picker.getByRole("button", { name: "React with thumbs up" }).click();
  await expect(picker).toBeHidden();
  await message.hover();
  await expect(message).toHaveClass(/actions-hovered/);
});

test("shows the intended quick reaction shortcuts", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "quick-reaction-shortcuts",
    `Quick reaction shortcuts ${fixture.suffix}`
  );
  await message.hover();
  await page.getByTestId(`message-${id}-actions`).getByTestId(`message-${id}-add-reaction-action`).click();

  const picker = page.getByRole("dialog", { name: "Choose a reaction" });
  await expect(picker.getByRole("button", { name: "React with check mark" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "React with git merge" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "React with git merge" }).getByAltText(":git-merge:")).toBeVisible();
  await expect(picker.getByRole("button", { name: "React with 😊" })).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "React with 😂" })).toHaveCount(0);
});

test("returns to compact reactions when the reaction button is clicked again", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "reaction-picker-reopen",
    `Reopen reaction picker ${fixture.suffix}`
  );
  await message.hover();
  const addReaction = page.getByTestId(`message-${id}-add-reaction-action`);
  await addReaction.click();

  const quickPicker = page.getByRole("dialog", { name: "Choose a reaction" });
  await quickPicker.getByRole("button", { name: /More emojis/ }).click();
  const fullPicker = page.locator(".reaction-picker-full");
  await expect(fullPicker).toBeVisible();
  const fullBox = await fullPicker.boundingBox();
  const viewport = page.viewportSize();
  expect(fullBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(fullBox!.x).toBeGreaterThanOrEqual(7);
  expect(fullBox!.x + fullBox!.width).toBeLessThanOrEqual(viewport!.width - 7);
  expect(fullBox!.y).toBeGreaterThanOrEqual(7);
  expect(fullBox!.y + fullBox!.height).toBeLessThanOrEqual(viewport!.height - 7);

  await addReaction.click();
  await expect(fullPicker).toBeHidden();
  await expect(quickPicker).toBeVisible();
  await expect(quickPicker.getByRole("button", { name: "React with thumbs up" })).toBeVisible();
});

test("switches from full reactions to one composer picker anchored by its button", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "reaction-to-composer-picker",
    `Switch emoji picker ${fixture.suffix}`
  );
  await message.hover();
  await page.getByTestId(`message-${id}-add-reaction-action`).click();
  await page.getByRole("dialog", { name: "Choose a reaction" })
    .getByRole("button", { name: /More emojis/ })
    .click();
  await expect(page.locator(".reaction-picker-full")).toBeVisible();

  const composerToggle = page.getByTestId("composer-emoji-toggle");
  await composerToggle.click();
  const composerPicker = page.locator("body > .emoji-popup-wrap.is-viewport-positioned");
  await expect(page.locator(".reaction-picker-full")).toBeHidden();
  await expect(composerPicker).toBeVisible();
  await expect(page.locator(".emoji-popup-wrap")).toHaveCount(1);
  await page.waitForTimeout(200);

  const pickerBox = await composerPicker.boundingBox();
  const toggleBox = await composerToggle.boundingBox();
  expect(pickerBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(toggleBox!.y - (pickerBox!.y + pickerBox!.height)).toBeGreaterThanOrEqual(7);
  expect(toggleBox!.y - (pickerBox!.y + pickerBox!.height)).toBeLessThanOrEqual(9);
});

test("selects an emoji from the full reaction picker", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "full-reaction-selection",
    `Full reaction selection ${fixture.suffix}`
  );
  await message.hover();
  await page.getByTestId(`message-${id}-add-reaction-action`).click();
  await page.getByRole("dialog", { name: "Choose a reaction" })
    .getByRole("button", { name: /More emojis/ })
    .click();

  const fullPicker = page.locator(".reaction-picker-full");
  await expect(fullPicker).toBeVisible();
  await fullPicker.locator('button[aria-label="😀"]').first().click();

  await expect(fullPicker).toBeHidden();
  await expect(message.locator(".reaction-emoji")).toContainText("😀");
});

test("keeps long-message actions below the channel header while scrolling", async ({ page }) => {
  await page.goto("/channels/general");
  await expect(page.getByTestId("channel-title")).toContainText("general");

  const message = messageById(page, fixture.messages.formatted.id);
  await expect(message).toBeVisible();
  const messages = page.getByTestId("messages");
  const header = page.getByTestId("channel-header");

  await messages.evaluate((container, messageId) => {
    const target = container.querySelector(`[data-testid="message-${messageId}"]`);
    const headerElement = document.querySelector('[data-testid="channel-header"]');
    if (!target || !headerElement) throw new Error("message header layout not found");
    const targetRect = target.getBoundingClientRect();
    const headerRect = headerElement.getBoundingClientRect();
    container.scrollTop += targetRect.top - headerRect.bottom + 20;
  }, fixture.messages.formatted.id);

  await message.hover();
  const actions = page.getByTestId(`message-${fixture.messages.formatted.id}-actions`);
  await expect(actions).toBeVisible();
  const actionsBox = await actions.boundingBox();
  const headerBox = await header.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(actionsBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`moves message hover state to the next message on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const first = await openFreshMessage(
      page,
      `hover-handoff-first-${viewport.name}`,
      `First hover handoff ${viewport.name} ${fixture.suffix}`
    );
    const second = await openFreshMessage(
      page,
      `hover-handoff-second-${viewport.name}`,
      `Second hover handoff ${viewport.name} ${fixture.suffix}`
    );

    await first.message.hover();
    await expect(first.message).toHaveClass(/actions-hovered/);
    await second.message.hover();

    await expect(second.message).toHaveClass(/actions-hovered/);
    await expect(first.message).not.toHaveClass(/actions-hovered/);
  });
}
