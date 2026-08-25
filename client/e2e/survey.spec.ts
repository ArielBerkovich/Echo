import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
});

function surveyModal(page) {
  return page.getByTestId("survey-modal");
}

async function fillSurvey(page, { question, options, multiple = false }) {
  await page.getByTestId("composer-survey").click();
  const modal = surveyModal(page);
  const inputs = modal.locator("input.settings-input");
  await inputs.nth(0).fill(question);
  for (let index = 0; index < options.length; index += 1) {
    if (index >= 2) await modal.getByRole("button", { name: "Add option" }).click();
    await inputs.nth(index + 1).fill(options[index]);
  }
  const toggle = modal.getByRole("checkbox", { name: "Allow multiple selections" });
  if (multiple) await modal.locator(".survey-multiple-toggle").click();
  return modal;
}

test("creates a survey and lets the sender vote", async ({ page }) => {
  const question = `Where should we invest next ${uniqueSuffix("survey")}?`;
  const modal = await fillSurvey(page, {
    question,
    options: ["Product improvements", "Bug fixes"],
  });
  await expect(modal.getByRole("checkbox", { name: "Allow multiple selections" })).not.toBeChecked();
  await modal.getByRole("button", { name: "Send survey" }).click();

  const card = page.locator(".survey-card").filter({ hasText: question }).last();
  await expect(card).toBeVisible();
  await expect(card).toContainText("0 votes");
  await card.getByRole("button", { name: /Product improvements/ }).click();
  await expect(card.getByRole("button", { name: /Product improvements/ })).toHaveClass(/selected/);
  await expect(card).toContainText("1 vote");
  await expect(card).toContainText("100%");
});

test("uses a polished multiple-selection toggle and records multiple choices", async ({ page }) => {
  const question = `Which updates matter ${uniqueSuffix("survey")}?`;
  const modal = await fillSurvey(page, {
    question,
    options: ["Reliability", "Performance", "Accessibility"],
    multiple: true,
  });
  const toggle = modal.getByRole("checkbox", { name: "Allow multiple selections" });
  await expect(toggle).toBeChecked();
  await expect(modal.locator(".survey-multiple-toggle")).toContainText("On");
  await modal.getByRole("button", { name: "Send survey" }).click();

  const card = page.locator(".survey-card").filter({ hasText: question }).last();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Reliability/ }).click();
  await expect(card.getByRole("button", { name: /Performance/ })).toBeEnabled();
  await card.getByRole("button", { name: /Performance/ }).click();
  await expect(card.getByRole("button", { name: /Reliability/ })).toHaveClass(/selected/);
  await expect(card.getByRole("button", { name: /Performance/ })).toHaveClass(/selected/);
  await expect(card).toContainText("2 votes");
});
