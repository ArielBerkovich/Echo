import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await seedWorkspaceFixture(page);
  await page.route("**/api/config", route => route.fulfill({ json: { threadSummaries: true } }));
});

test("rephrases a draft, compares changes, and applies formatted output", async ({ page }) => {
  const draft = "hey please send the report and check the budget";
  const rewrite = "Please:\n\n- Send the **report**.\n- Check the budget.";
  let requestedDraft: unknown;
  await page.route("**/api/ai/rephrase", async route => {
    requestedDraft = route.request().postDataJSON().text;
    await route.fulfill({ json: { canRephrase: true, options: [{ key: "professional", text: rewrite }] } });
  });
  await page.goto("/channels/general");
  const editor = page.getByTestId("composer-editor");
  await editor.fill(draft);
  await page.getByTestId("composer-rephrase").click();
  const dialog = page.getByTestId("composer-rephrase-popover");
  await expect(dialog.getByRole("region", { name: "Before" })).toContainText(draft);
  await expect(dialog.getByRole("region", { name: "After" }).locator("ul li")).toHaveCount(2);
  await expect(dialog.getByRole("region", { name: "After" }).locator("strong")).toHaveText("report");
  await expect(dialog.locator("ins").first()).toBeVisible();
  expect(requestedDraft).toBe(draft);
  await dialog.getByRole("button", { name: "Use suggestion" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("strong")).toHaveText("report");
  await expect(editor).toContainText("Check the budget");
});

test("shows provider errors and retries without losing the draft", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/ai/rephrase", async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 502, json: { error: "Provider is unavailable." } });
    await route.fulfill({ json: { canRephrase: true, options: [{ key: "professional", text: "Please send the report." }] } });
  });
  await page.goto("/channels/general");
  const editor = page.getByTestId("composer-editor");
  await editor.fill("please send report");
  await page.getByTestId("composer-rephrase").click();
  const dialog = page.getByTestId("composer-rephrase-popover");
  await expect(dialog.getByRole("alert")).toContainText("Please try again");
  await expect(editor).toHaveText("please send report");
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("region", { name: "After" })).toContainText("Please send the report.");
  await dialog.getByRole("button", { name: "Close rephrase options" }).click();
  await expect(editor).toHaveText("please send report");
  expect(calls).toBe(2);
});


test("hides rephrasing when AI is disabled", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { threadSummaries: false } }));
  await page.goto("/channels/general");
  await expect(page.getByTestId("composer-editor")).toBeVisible();
  await expect(page.getByTestId("composer-rephrase")).toHaveCount(0);
});

test("cancelling a pending request keeps the original draft", async ({ page }) => {
  let release;
  const waitForRelease = new Promise<void>(resolve => { release = resolve; });
  let started;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/ai/rephrase", async route => {
    started();
    await waitForRelease;
    await route.fulfill({ json: { canRephrase: true, options: [{ key: "professional", text: "A late result." }] } }).catch(() => {});
  });
  await page.goto("/channels/general");
  const editor = page.getByTestId("composer-editor");
  await editor.fill("keep my draft");
  await page.getByTestId("composer-rephrase").click();
  await requestStarted;
  const dialog = page.getByTestId("composer-rephrase-popover");
  await expect(dialog.getByRole("status")).toBeVisible();
  const geometry = await dialog.locator(".composer-rephrase-ripple").evaluate(element => {
    const box = element.getBoundingClientRect();
    const rings = [...element.querySelectorAll("span")];
    return rings.map(ring => {
      ring.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 500; });
      const rect = ring.getBoundingClientRect();
      return { dx: rect.x + rect.width / 2 - (box.x + box.width / 2), dy: rect.y + rect.height / 2 - (box.y + box.height / 2), width: rect.width, height: rect.height };
    });
  });
  for (const ring of geometry) {
    expect(Math.abs(ring.dx)).toBeLessThan(0.1);
    expect(Math.abs(ring.dy)).toBeLessThan(0.1);
    expect(ring.width).toBeCloseTo(ring.height, 1);
  }
  await dialog.getByRole("button", { name: "Close rephrase options" }).click();
  release();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveText("keep my draft");
});


test("Enter applies the suggestion without sending it", async ({ page }) => {
  await page.route("**/api/ai/rephrase", route => route.fulfill({ json: { canRephrase: true, options: [{ key: "professional", text: "Please send the report." }] } }));
  await page.goto("/channels/general");
  const editor = page.getByTestId("composer-editor");
  await editor.fill("send report please");
  await page.getByTestId("composer-rephrase").click();
  const dialog = page.getByTestId("composer-rephrase-popover");
  await expect(dialog.getByRole("region", { name: "After" })).toContainText("Please send the report.");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveText("Please send the report.");
});
