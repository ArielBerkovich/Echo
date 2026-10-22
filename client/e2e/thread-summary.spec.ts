import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

test("thread summary renders Markdown safely and copies the original Markdown", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const summary = "## Latest status\n\n- Staging has been restored.\n- **Health checks** pass.\n\nA literal <script>alert(1)</script> is unsafe.";
  await page.route("**/api/config", route => route.fulfill({ json: { threadSummaries: true } }));
  await page.route("**/thread-summary", route => route.fulfill({ json: { summary, replyCount: 1, generatedAt: new Date().toISOString() } }));
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => { window.__summaryClipboard = text; } },
  }));
  const action = page.getByTestId(`message-${fixture.messages.threadRoot.id}-summarize-thread`);
  await page.getByTestId(`message-${fixture.messages.threadRoot.id}`).hover();
  await action.click();
  const panel = page.getByTestId("thread-summary-panel");
  const rendered = panel.locator(".thread-summary-markdown");
  await expect(rendered.getByRole("heading", { name: "Latest status" })).toBeVisible();
  await expect(rendered.locator("li")).toHaveCount(2);
  await expect(rendered.locator("strong")).toHaveText("Health checks");
  await expect(rendered.locator("script")).toHaveCount(0);
  await panel.locator(".summary-copy").click();
  await expect.poll(() => page.evaluate(() => window.__summaryClipboard)).toBe(summary);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.dataset.mode = "dark";
  });
  await expect(rendered).toHaveAttribute("dir", "auto");
  await expect(rendered).toBeVisible();
  await expect.poll(() => rendered.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.evaluate(() => { document.documentElement.dataset.mode = "light"; });
  await expect(rendered).toBeVisible();
  await expect(panel.locator(".summary-view-toggle, .summary-section, .thread-summary-sources")).toHaveCount(0);
});
