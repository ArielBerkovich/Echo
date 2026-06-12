import { expect, test } from "@playwright/test";
import { loginAndSeedToken, resetScenario } from "./helpers.js";

async function newAuthedPage(browser, username, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAndSeedToken(page, username, password);
  return { context, page };
}

test("shows presence and typing across sessions", async ({ browser, page }) => {
  await resetScenario(page, "workspace");

  const alice = await newAuthedPage(browser, "alice", "Password1");
  const bob = await newAuthedPage(browser, "bob", "Password1");

  try {
    await alice.page.goto("/");
    await bob.page.goto("/");

    await alice.page.locator(".message").filter({ hasText: "Heads up @alice" }).locator(".author-btn").click();
    await expect(alice.page.locator(".profile-modal .profile-presence")).toContainText("Active");
    await alice.page.locator(".profile-modal .profile-close").click();

    await alice.page.locator(".channel-row").filter({ hasText: "general" }).click();
    await bob.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const typing = `Typing ${Date.now()}`;
    await bob.page.locator(".composer-editor").fill(typing);
    await expect(alice.page.locator(".typing-indicator")).toContainText("Bob Builder is typing");
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});

test("bumps unread counts and reflects live edits and deletes", async ({ browser, page }) => {
  await resetScenario(page, "workspace");

  const alice = await newAuthedPage(browser, "alice", "Password1");
  const bob = await newAuthedPage(browser, "bob", "Password1");

  try {
    await alice.page.goto("/");
    await bob.page.goto("/");

    await alice.page.locator(".channel-row").filter({ hasText: "project-alpha" }).click();
    await bob.page.locator(".channel-row").filter({ hasText: "general" }).click();

    const liveBody = `Realtime ${Date.now()}`;
    await bob.page.locator(".composer-editor").fill(liveBody);
    await bob.page.locator(".composer-editor").press("Enter");

    await expect(
      alice.page.locator(".channel-row").filter({ hasText: "general" }).locator(".unread-badge")
    ).toBeVisible();

    await alice.page.locator(".channel-row").filter({ hasText: "general" }).click();
    const liveMessage = alice.page.locator(".message").filter({ hasText: liveBody }).first();
    await expect(liveMessage).toBeVisible();

    await bob.page.locator(".message").filter({ hasText: liveBody }).hover();
    await bob.page.locator(".message").filter({ hasText: liveBody }).getByTitle("Edit message").click();
    await bob.page.locator(".msg-edit-input").fill(`${liveBody} updated`);
    await bob.page.locator(".msg-edit-actions .btn-primary").click();
    await expect(liveMessage).toContainText("updated");
    await expect(liveMessage).toContainText("(edited)");

    await bob.page.locator(".message").filter({ hasText: `${liveBody} updated` }).hover();
    await bob.page.locator(".message").filter({ hasText: `${liveBody} updated` }).getByTitle("Delete message").click();
    await bob.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(alice.page.locator(".message").filter({ hasText: `${liveBody} updated` })).toHaveCount(0);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
