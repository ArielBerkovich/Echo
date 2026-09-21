import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture } from "./helpers.js";

test("group members can add people", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const created = await requestAsToken(page, fixture.alice.token, "/groups", {
    method: "POST",
    body: { name: `Product ${fixture.suffix}`, memberIds: [fixture.bob.id] },
  });
  const groupId = created.group.id;

  try {
    await expect(requestAsToken(page, fixture.alice.token, "/groups", {
      method: "POST",
      body: { name: created.group.name },
    })).rejects.toThrow("a group with that name already exists");

    await page.goto("/groups");
    const panel = page.getByTestId("groups-panel");
    await expect(panel).toContainText(created.group.name);
    await panel.getByRole("button", { name: new RegExp(created.group.name) }).click();
    await expect(panel.locator(".groups-panel-member").getByText(fixture.bob.displayName)).toBeVisible();
    await panel.getByRole("button", { name: "Add people" }).click();
    await expect(page.getByLabel("Search people to add")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(panel.getByRole("button", { name: "Manage" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Assign" })).toHaveCount(0);
  } finally {
    await requestAsToken(page, fixture.alice.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
  }
});
