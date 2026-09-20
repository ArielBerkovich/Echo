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
    await page.goto("/groups");
    const panel = page.getByTestId("groups-panel");
    await expect(panel).toContainText(created.group.name);
    await panel.getByRole("button", { name: new RegExp(created.group.name) }).click();
    await expect(panel.locator(".groups-panel-member").getByText(fixture.bob.displayName)).toBeVisible();
    await expect(panel.getByLabel("Add member to group")).toBeVisible();
    await expect(panel.getByLabel("Assign channel to group")).toBeVisible();
    await expect(panel.getByLabel("Transfer group ownership")).toBeVisible();
    await expect(panel.getByLabel("Replacement owner before leaving group")).toBeVisible();

    await panel.getByLabel("Assign channel to group").selectOption(fixture.generalChannel.id);
    await panel.getByRole("button", { name: `Assign channel` }).click();
    await expect(panel.getByText(`#${fixture.generalChannel.name}`)).toBeVisible();
    await expect(panel.getByRole("button", { name: `Remove #${fixture.generalChannel.name} from group` })).toBeVisible();
  } finally {
    await requestAsToken(page, fixture.alice.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
  }
});
