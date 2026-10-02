import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
});

test.afterEach(async ({ page }) => {
  if (!fixture) return;
  const response = await requestAsToken(page, fixture.alice.token, `/scheduled?channelId=${fixture.generalChannel.id}`);
  for (const scheduled of response.scheduled || []) {
    await requestAsToken(page, fixture.alice.token, `/scheduled/${scheduled.id}`, { method: "DELETE" });
  }
});

test("can cancel a scheduled message and undo the cancellation", async ({ page }) => {
  const body = `Scheduled undo flow ${uniqueSuffix("message")}`;
  await requestAsToken(page, fixture.alice.token, "/scheduled", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body,
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });

  await page.reload();
  const banner = page.getByRole("button", { name: /View 1 scheduled message/ });
  await expect(banner).toBeVisible();
  await banner.click();

  const modal = page.getByRole("dialog", { name: "Scheduled messages" });
  await expect(modal).toContainText("Upcoming messages");
  await expect(modal).toContainText(body);
  await expect(modal.getByRole("button", { name: "Cancel scheduled message", exact: true })).toBeVisible();

  await modal.getByRole("button", { name: "Cancel scheduled message", exact: true }).click();
  await expect(modal).toContainText("Scheduled message canceled.");
  await expect(modal.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await expect(modal).not.toContainText(body);

  await modal.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(modal).toContainText(body);
  await expect(modal.getByRole("button", { name: "Cancel scheduled message", exact: true })).toBeVisible();
});

test("aligns the scheduled-message banner RTL in Hebrew", async ({ page }) => {
  await requestAsToken(page, fixture.alice.token, "/scheduled", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Scheduled RTL ${uniqueSuffix("message")}`,
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "rtl");
  const banner = page.locator(".scheduled-banner");
  await expect(banner).toBeVisible();
  await expect.poll(() => banner.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => banner.evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");
  await expect.poll(() => banner.locator(".scheduled-banner-copy").evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");
});
