import { expect, test } from "@playwright/test";
import { seedToken, seedWorkspaceFixture } from "./helpers.js";

async function openMessageSoundPreferences(page) {
  const fixture = await seedWorkspaceFixture(page);
  await seedToken(page, fixture.alice.token);
  await page.goto("/settings/preferences");
  await expect(page.getByTestId("preferences-page")).toBeVisible();
  return fixture;
}

test.describe("message sound preferences", () => {
  test("shows None first and Bright pop before the other sounds", async ({ page }) => {
    await openMessageSoundPreferences(page);

    await expect(page.locator(".message-sound-option")).toHaveText([
      /None/,
      /Bright pop/,
      /Short alert/,
      /Clear ding/,
      /Soft chime/,
      /Warm bell/,
    ]);
    await expect(page.locator('input[type="radio"][value="soft-chime"]')).toBeChecked();
    await expect(page.locator('input[type="radio"][value="none"]')).not.toBeChecked();
  });

  test("previews a selected sound and persists None", async ({ page }) => {
    await page.addInitScript(() => {
      window.__echoPlayedSounds = [];
      class TestAudio {
        src;
        volume = 1;
        constructor(src) { this.src = src; }
        play() { window.__echoPlayedSounds.push(this.src); return Promise.resolve(); }
        pause() {}
      }
      window.Audio = TestAudio;
    });
    await openMessageSoundPreferences(page);

    const brightPop = page.locator('input[type="radio"][value="bright-pop"]');
    await brightPop.check();
    await expect(brightPop).toBeChecked();
    await expect.poll(() => page.evaluate(() => window.__echoPlayedSounds.some((src) => src.includes("bright-pop")))).toBe(true);

    const none = page.locator('input[type="radio"][value="none"]');
    await none.check();
    await expect(none).toBeChecked();
    await expect(page.getByText("No preview")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("preferences-page")).toBeVisible();
    await expect(page.locator('input[type="radio"][value="none"]')).toBeChecked();
  });
});
