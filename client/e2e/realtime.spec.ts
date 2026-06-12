import { expect, test } from "@playwright/test";
import { channelRow, composer, loginAndSeedToken, messageByText, profileModal, resetScenario } from "./helpers.js";

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

    await messageByText(alice.page, "Heads up @alice").first().locator('[data-testid$="-author"]').click();
    await expect(profileModal(alice.page).locator(".profile-presence")).toContainText("Active");
    await profileModal(alice.page).getByTestId("profile-close").click();

    await channelRow(alice.page, "general").click();
    await channelRow(bob.page, "general").click();

    const typing = `Typing ${Date.now()}`;
    await composer(bob.page).fill(typing);
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

    await channelRow(alice.page, "project-alpha").click();
    await channelRow(bob.page, "general").click();

    const liveBody = `Realtime ${Date.now()}`;
    await composer(bob.page).fill(liveBody);
    await composer(bob.page).press("Enter");

    await expect(
      channelRow(alice.page, "general").locator(".unread-badge")
    ).toBeVisible();

    await channelRow(alice.page, "general").click();
    const liveMessage = messageByText(alice.page, liveBody).first();
    await expect(liveMessage).toBeVisible();

    await messageByText(bob.page, liveBody).first().hover();
    await messageByText(bob.page, liveBody).first().locator('[data-testid$="-edit"]').click();
    await bob.page.locator(".msg-edit-input").fill(`${liveBody} updated`);
    await bob.page.locator(".msg-edit-actions .btn-primary").click();
    await expect(liveMessage).toContainText("updated");
    await expect(liveMessage).toContainText("(edited)");

    await messageByText(bob.page, `${liveBody} updated`).first().hover();
    await messageByText(bob.page, `${liveBody} updated`).first().locator('[data-testid$="-delete"]').click();
    await bob.page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(messageByText(alice.page, `${liveBody} updated`)).toHaveCount(0);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
});
