import { expect, test } from "@playwright/test";
import { dmRow, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

async function createGroup(page, fixture, name, memberIds = [fixture.bob.id]) {
  const result = await requestAsToken(page, fixture.alice.token, "/groups", {
    method: "POST",
    body: { name, memberIds },
  });
  return result.group;
}

async function openBobProfile(page, fixture) {
  await page.goto("/");
  await page.getByTestId("rail-dms").click();
  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();
  await page.getByTestId("channel-title").click();
  return page.getByTestId("profile-modal");
}

test("profile lists only the groups the selected user belongs to", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const suffix = fixture.suffix.slice(-8);
  const bobGroup = await createGroup(page, fixture, `Bob team ${suffix}`);
  const anotherBobGroup = await createGroup(page, fixture, `Long profile group name ${suffix}`);
  const aliceOnlyGroup = await createGroup(page, fixture, `Alice only ${suffix}`, [fixture.alice.id]);

  try {
    const profile = await openBobProfile(page, fixture);
    const groupList = profile.locator(".profile-groups-list");
    await expect(groupList.getByRole("button")).toHaveCount(2);
    await expect(groupList.getByRole("button", { name: new RegExp(bobGroup.name) })).toBeVisible();
    await expect(groupList.getByRole("button", { name: new RegExp(anotherBobGroup.name) })).toBeVisible();
    await expect(groupList.getByRole("button", { name: new RegExp(aliceOnlyGroup.name) })).toHaveCount(0);
  } finally {
    for (const group of [bobGroup, anotherBobGroup, aliceOnlyGroup]) {
      await requestAsToken(page, fixture.alice.token, `/groups/${group.id}`, { method: "DELETE" }).catch(() => {});
    }
  }
});

test("clicking a profile group opens that group and long names stay within the modal", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const group = await createGroup(page, fixture, `VeryLongGroupName${fixture.suffix.slice(-8)}${"X".repeat(15)}`);

  try {
    await page.setViewportSize({ width: 320, height: 720 });
    const profile = await openBobProfile(page, fixture);
    const groupButton = profile.locator(".profile-groups-list").getByRole("button", { name: new RegExp(group.name) });
    await expect(groupButton).toBeVisible();
    const dimensions = await groupButton.evaluate((button) => {
      const name = button.querySelector(".profile-group-name");
      return { buttonWidth: button.clientWidth, buttonScrollWidth: button.scrollWidth, nameWidth: name.clientWidth, nameScrollWidth: name.scrollWidth };
    });
    expect(dimensions.buttonScrollWidth).toBeLessThanOrEqual(dimensions.buttonWidth);
    expect(dimensions.nameScrollWidth).toBeGreaterThan(dimensions.nameWidth);

    await groupButton.click();
    await expect(page.getByTestId("profile-modal")).toHaveCount(0);
    await expect(page.getByTestId("groups-panel").locator(".groups-detail-heading h2")).toHaveText(group.name);
  } finally {
    await requestAsToken(page, fixture.alice.token, `/groups/${group.id}`, { method: "DELETE" }).catch(() => {});
  }
});
