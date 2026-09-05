import { expect, test } from "@playwright/test";
import { registerUser, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("selects an Add People result with ArrowDown and Enter", async ({ page }) => {
  const suffix = uniqueSuffix("add-people-keyboard")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-10)
    .toLowerCase()
    .replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)));
  const candidates = await Promise.all(
    ["One", "Two", "Three"].map((name) => registerUser(page, {
      username: `keyboard${suffix}.${name.toLowerCase()}`,
      displayName: `Keyboard${suffix} ${name}`,
    }))
  );

  await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
  await page.getByTestId("channel-title").press("Enter");
  await page.getByTestId("channel-details-dialog").getByRole("button", { name: "Add people to this channel" }).click();

  const addPeople = page.getByTestId("add-people-modal");
  const search = addPeople.getByTestId("add-people-search");
  await expect(search).toBeFocused();
  await search.fill(`keyboard${suffix}`);
  const rows = addPeople.locator(".person-row");
  await expect(rows).toHaveCount(candidates.length);

  await search.press("ArrowDown");
  await expect(rows.nth(1)).toHaveClass(/active/);
  await search.press("ArrowUp");
  await expect(rows.nth(0)).toHaveClass(/active/);
  await search.press("ArrowDown");
  await search.press("Enter");

  // Enter should add the highlighted result and remove it from the available
  // list. Currently AddPeopleModal has no keyboard selection state/handler.
  await expect(rows).toHaveCount(candidates.length - 1);
});
