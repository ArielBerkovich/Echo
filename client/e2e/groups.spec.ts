import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture } from "./helpers.js";

test("group owners can manage members, ownership, and channel associations", async ({ page }) => {
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

    await panel.getByRole("button", { name: "Manage" }).click();
    await expect(page.getByLabel("Transfer group ownership")).toBeVisible();
    await expect(page.getByLabel("Replacement owner before leaving group")).toBeVisible();
    await page.keyboard.press("Escape");

    await panel.getByRole("button", { name: "Assign" }).click();
    const channelRow = page.locator(".groups-channel-picker-row").filter({ hasText: fixture.generalChannel.name });
    await channelRow.getByRole("button", { name: "Assign" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(panel.getByText(fixture.generalChannel.name, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: `Remove #${fixture.generalChannel.name} from group` })).toBeVisible();
  } finally {
    await requestAsToken(page, fixture.alice.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
  }
});
