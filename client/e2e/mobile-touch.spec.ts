import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("shows thread message actions after a real phone tap", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  await page.goto("/");
  const browseButton = page.getByTestId("browse-channels");
  const createButton = page.getByTestId("create-channel");
  const browseBox = await browseButton.boundingBox();
  const createBox = await createButton.boundingBox();
  expect(browseBox.width).toBe(createBox.width);
  expect(browseBox.height).toBe(createBox.height);
  await browseButton.tap();
  await expect(page.getByTestId("channel-browser")).toBeVisible();
  await page.getByTestId("rail-home").tap();
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await page.getByTestId(`channel-row-${fixture.projectChannel.name}`).tap();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTitle("Attach files").tap();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "mobile-touch.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await expect(page.locator('.pending-att.is-image img[alt="mobile-touch.png"]')).toBeVisible();

  const root = page.getByTestId(`message-${fixture.messages.threadRoot.id}`);
  await root.getByTestId(`message-${fixture.messages.threadRoot.id}-reply-count`).tap();
  const threadPanel = page.getByTestId("thread-panel");
  await expect(threadPanel).toBeVisible();
  const actions = page.getByTestId(`message-${fixture.messages.threadRoot.id}-actions`);
  await threadPanel.getByTestId("message-body").first().tap();
  await page.waitForTimeout(200);
  await expect(actions).toHaveCount(1);
  await expect(actions).toBeVisible();
  const actionPoint = await actions.boundingBox();
  const topElement = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-message-actions]") != null, {
    x: actionPoint.x + actionPoint.width / 2,
    y: actionPoint.y + actionPoint.height / 2,
  });
  expect(topElement).toBe(true);
  await threadPanel.getByTestId("thread-body").evaluate((element) => element.dispatchEvent(new Event("scroll", { bubbles: true })));
  await expect(actions).toHaveCount(0);
});

test("closes the message toolbar when opening its thread", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  await page.goto("/");
  await page.getByTestId(`channel-row-${fixture.projectChannel.name}`).tap();

  const root = page.getByTestId(`message-${fixture.messages.threadRoot.id}`);
  await root.tap();
  const actions = page.getByTestId(`message-${fixture.messages.threadRoot.id}-actions`);
  await expect(actions).toBeVisible();
  await actions.getByTitle("Reply in thread").tap({ force: true });
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await expect(actions).toHaveCount(0);
});
