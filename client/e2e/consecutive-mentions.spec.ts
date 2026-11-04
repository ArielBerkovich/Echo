import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

for (const language of ["en", "he"]) {
  for (const selection of ["click", "keyboard"]) {
    test(`sends consecutive mentions on one line (${language}, ${selection})`, async ({ page }) => {
      const fixture = await seedWorkspaceFixture(page);
      await page.goto("/channels/general");
      await page.getByTestId("rail-settings").click();
      await page.getByRole("button", { name: "Preferences", exact: true }).click();
      await page.getByTestId("settings-language").selectOption(language);
      await page.goto("/channels/general");

      const editor = page.getByTestId("composer-editor");
      const prefix = `Consecutive mentions ${language} ${selection} ${Date.now()} `;
      await editor.fill(prefix);
      for (const user of [fixture.alice, fixture.bob]) {
        // The composer inserts its own space and direction marker after selection.
        // Type the next trigger immediately to reproduce issue #320.
        await editor.pressSequentially(`@${user.username}`);
        const option = page.locator(".mention-item").filter({ hasText: `@${user.username}` }).first();
        await expect(option).toBeVisible();
        if (selection === "click") await option.click();
        else await editor.press("Enter");
      }
      await expect(editor.locator("[data-user-mention]")).toHaveCount(2);
      await expect(editor.locator("p")).toHaveCount(1);
      await page.getByTestId("composer-send").click();
      const message = page.locator(".message").filter({ hasText: prefix.trim() }).last();
      for (const user of [fixture.alice, fixture.bob]) {
        await expect(message.locator(`[data-mention="${user.username}"]`)).toHaveText(`@${user.displayName}`);
      }
    });
  }
}
