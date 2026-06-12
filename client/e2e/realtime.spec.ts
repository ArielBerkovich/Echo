import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

let fixture;

async function newAuthedPage(browser, token) {
  const context = await browser.newContext();
  await context.addInitScript((value) => {
    localStorage.setItem("echo.token", value);
  }, token);
  const page = await context.newPage();
  return { context, page };
}

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("shows presence and typing across sessions", async ({ browser, page }) => {
  const { alice, bob } = fixture;

  const alicePage = await newAuthedPage(browser, alice.token);
  const bobPage = await newAuthedPage(browser, bob.token);

  try {
    await alicePage.page.goto("/");
    await bobPage.page.goto("/");

    await alicePage.page
      .locator(".message")
      .filter({ hasText: `Heads up @${alice.username}` })
      .locator(".author-btn")
      .click();
    await expect(alicePage.page.locator(".profile-modal .profile-presence")).toContainText("Active");
    await alicePage.page.locator(".profile-modal .profile-close").click();

    await alicePage.page.locator(".channel-row").filter({ hasText: "general" }).click();
    await bobPage.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const typing = `Typing ${Date.now()}`;
    await bobPage.page.locator(".composer-editor").fill(typing);
    await expect(alicePage.page.locator(".typing-indicator")).toContainText(
      `${bob.displayName} is typing`
    );
  } finally {
    await alicePage.context.close();
    await bobPage.context.close();
  }
});

test("bumps unread counts and reflects live edits and deletes", async ({ browser, page }) => {
  const { alice, bob, projectChannel } = fixture;

  const alicePage = await newAuthedPage(browser, alice.token);
  const bobPage = await newAuthedPage(browser, bob.token);

  try {
    await alicePage.page.goto("/");
    await bobPage.page.goto("/");

    await alicePage.page.locator(".channel-row").filter({ hasText: projectChannel.name }).click();
    await bobPage.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const liveBody = `Realtime ${Date.now()}`;
    await bobPage.page.locator(".composer-editor").fill(liveBody);
    await bobPage.page.locator(".composer-editor").press("Enter");

    await expect(
      alicePage.page.locator(".channel-row").filter({ hasText: "general" }).locator(".unread-badge")
    ).toBeVisible();

    await alicePage.page.locator(".channel-row").filter({ hasText: "general" }).click();
    const liveMessage = alicePage.page.locator(".message").filter({ hasText: liveBody }).first();
    await expect(liveMessage).toBeVisible();

    await bobPage.page.locator(".message").filter({ hasText: liveBody }).hover();
    await bobPage.page.locator(".message").filter({ hasText: liveBody }).getByTitle("Edit message").click();
    await bobPage.page.locator(".msg-edit-input").fill(`${liveBody} updated`);
    await bobPage.page.locator(".msg-edit-actions .btn-primary").click();
    await expect(liveMessage).toContainText("updated");
    await expect(liveMessage).toContainText("(edited)");

    await bobPage.page.locator(".message").filter({ hasText: `${liveBody} updated` }).hover();
    await bobPage.page.locator(".message").filter({ hasText: `${liveBody} updated` }).getByTitle("Delete message").click();
    await bobPage.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(alicePage.page.locator(".message").filter({ hasText: `${liveBody} updated` })).toHaveCount(0);
  } finally {
    await alicePage.context.close();
    await bobPage.context.close();
  }
});
