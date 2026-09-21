import { expect, test } from "@playwright/test";
import { requestAsToken, seedToken, seedWorkspaceFixture } from "./helpers.js";

test("members govern membership and the last member leaving deletes the group", async ({ page }) => {
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
    await page.getByRole("button", { name: "Close" }).click();

    await expect(panel.getByRole("button", { name: "Manage" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Assign" })).toHaveCount(0);

    await panel.getByRole("button", { name: "Leave group" }).click();
    await expect(page.getByRole("heading", { name: "Leave this group?" })).toBeVisible();
    await page.getByRole("button", { name: "Leave group", exact: true }).last().click();
    await expect(panel.getByRole("button", { name: "Add people" })).toHaveCount(0);

    await expect(requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members`, {
      method: "POST",
      body: { userId: fixture.alice.id },
    })).rejects.toThrow("group member only");
    await expect(requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members/${fixture.bob.id}`, {
      method: "DELETE",
    })).rejects.toThrow("group member only");

    await requestAsToken(page, fixture.bob.token, `/groups/${groupId}/members`, {
      method: "POST",
      body: { userId: fixture.alice.id },
    });
    await requestAsToken(page, fixture.bob.token, `/groups/${groupId}/members/${fixture.alice.id}`, {
      method: "DELETE",
    });

    await seedToken(page, fixture.bob.token);
    await page.reload();
    await panel.getByRole("button", { name: new RegExp(created.group.name) }).click();
    await panel.getByRole("button", { name: "Leave group" }).click();
    await expect(page.getByRole("heading", { name: "Delete this group?" })).toBeVisible();
    await page.getByRole("button", { name: "Leave and delete group", exact: true }).click();
    await expect(panel).not.toContainText(created.group.name);
  } finally {
    await requestAsToken(page, fixture.bob.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
  }
});
