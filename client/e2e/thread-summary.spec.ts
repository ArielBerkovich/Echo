import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

test("thread summary displays plain text without sections or HTML rendering", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const summary = "The team discussed restoring staging.\n\nHealth checks now pass. <strong>This stays plain text.</strong>";
  await page.route("**/api/config", route => route.fulfill({ json: { threadSummaries: true } }));
  await page.route("**/thread-summary", route => route.fulfill({ json: { summary, replyCount: 1, generatedAt: new Date().toISOString() } }));
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  const action = page.getByTestId(`message-${fixture.messages.threadRoot.id}-summarize-thread`);
  await page.getByTestId(`message-${fixture.messages.threadRoot.id}`).hover();
  await action.click();
  const panel = page.getByTestId("thread-summary-panel");
  await expect(panel.locator(".thread-summary-plain-text")).toHaveText(summary);
  await expect(panel.locator(".thread-summary-plain-text strong")).toHaveCount(0);
  await expect(panel.locator(".summary-view-toggle, .summary-section, .thread-summary-sources")).toHaveCount(0);
});
