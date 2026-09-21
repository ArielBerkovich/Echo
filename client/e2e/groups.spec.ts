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

test("Groups REST API validates names and exposes the membership lifecycle", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const name = `REST API ${fixture.suffix}`;
  const baseUrl = process.env.ECHO_E2E_BASE_URL || "http://127.0.0.1:5173";
  const unauthenticated = await page.request.get(`${baseUrl}/api/groups`);
  expect(unauthenticated.status()).toBe(401);
  const created = await requestAsToken(page, fixture.alice.token, "/groups", {
    method: "POST",
    body: { name, description: "API coverage", memberIds: [] },
  });
  const groupId = created.group.id;

  try {
    expect(created.group.name).toBe(name);
    expect(created.group.memberCount).toBe(1);
    expect(created.group.isMember).toBe(true);
    expect(created.group.currentUserRole).toBe("owner");

    const allGroups = await requestAsToken(page, fixture.alice.token, "/groups");
    expect(allGroups.groups.some((group) => group.id === groupId)).toBe(true);
    expect(allGroups.groups.find((group) => group.id === groupId).isMember).toBe(true);

    const group = await requestAsToken(page, fixture.alice.token, `/groups/${groupId}`);
    expect(group.group.id).toBe(groupId);
    expect(group.group.members.map((member) => member.id)).toContain(fixture.alice.id);

    const members = await requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members`);
    expect(members.members).toHaveLength(1);
    expect(members.members[0].id).toBe(fixture.alice.id);

    await expect(requestAsToken(page, fixture.alice.token, "/groups", {
      method: "POST",
      body: { name: `${name}_invalid` },
    })).rejects.toThrow("English letters");
    await expect(requestAsToken(page, fixture.alice.token, "/groups", {
      method: "POST",
      body: { name: `${name} שלום` },
    })).rejects.toThrow("English letters");
    await expect(requestAsToken(page, fixture.alice.token, "/groups", {
      method: "POST",
      body: { name: "A".repeat(41) },
    })).rejects.toThrow("English letters");
    await expect(requestAsToken(page, fixture.alice.token, "/groups", {
      method: "POST",
      body: { name },
    })).rejects.toThrow("already exists");
    await expect(requestAsToken(page, fixture.alice.token, "/groups/not-an-object-id")).rejects.toThrow("group not found");
    await expect(requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members`, {
      method: "POST",
      body: { userId: "not-an-object-id" },
    })).rejects.toThrow("valid user id");

    await expect(requestAsToken(page, fixture.bob.token, `/groups/${groupId}/members`)).rejects.toThrow("group member only");
    await expect(requestAsToken(page, fixture.bob.token, `/groups/${groupId}/members`, {
      method: "POST",
      body: { userId: fixture.alice.id },
    })).rejects.toThrow("group member only");

    const added = await requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });
    expect(added.group.memberCount).toBe(2);
    const duplicateAdd = await requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members`, {
      method: "POST",
      body: { userId: fixture.bob.id },
    });
    expect(duplicateAdd.group.memberCount).toBe(2);

    const bobMembers = await requestAsToken(page, fixture.bob.token, `/groups/${groupId}/members`);
    expect(bobMembers.members.map((member) => member.id)).toEqual(expect.arrayContaining([fixture.alice.id, fixture.bob.id]));

    const removed = await requestAsToken(page, fixture.bob.token, `/groups/${groupId}/members/${fixture.alice.id}`, {
      method: "DELETE",
    });
    expect(removed.group.memberCount).toBe(1);
    expect(removed.group.currentUserRole).toBe("owner");
    await expect(requestAsToken(page, fixture.alice.token, `/groups/${groupId}/members`)).rejects.toThrow("group member only");

    const left = await requestAsToken(page, fixture.bob.token, `/groups/${groupId}/leave`, { method: "POST" });
    expect(left.deleted).toBe(true);
    await expect(requestAsToken(page, fixture.alice.token, `/groups/${groupId}`)).rejects.toThrow("group not found");
  } finally {
    await requestAsToken(page, fixture.alice.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
    await requestAsToken(page, fixture.bob.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
  }
});
