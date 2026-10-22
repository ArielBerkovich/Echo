import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

test("adds a group's members to a channel from the members panel", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const suffix = uniqueSuffix("cg");
  const channelName = `group-channel-${suffix}`;
  const groupName = `Group ${suffix}`;
  const { channel } = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  let groupId: string | undefined;

  try {
    const { group } = await requestAsToken(page, fixture.alice.token, "/groups", {
      method: "POST",
      body: { name: groupName, memberIds: [fixture.bob.id] },
    });
    groupId = group.id;

    await page.goto(`/channels/${channel.id}`);
    await expect(page.getByTestId("channel-title")).toContainText(channelName);

    const setupCard = page.locator(".empty-state-setup");
    await expect(setupCard.getByTestId("empty-channel-add-group")).toBeVisible();
    const cardAddPeople = await setupCard.getByTestId("empty-channel-add-people").boundingBox();
    const cardAddGroup = await setupCard.getByTestId("empty-channel-add-group").boundingBox();
    expect(cardAddPeople).not.toBeNull();
    expect(cardAddGroup).not.toBeNull();
    expect(Math.abs(cardAddPeople.y - cardAddGroup.y)).toBeLessThan(1);

    const memberCountLayout = await page.getByTestId("channel-members").evaluate((button) => {
      const icon = button.querySelector("svg");
      const count = button.querySelector(".channel-members-count");
      if (!icon || !count) return null;
      const originalCount = count.textContent;
      count.textContent = "1000000";
      const iconBox = icon.getBoundingClientRect();
      const countBox = count.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const layout = {
        noOverlap: iconBox.right <= countBox.left,
        countFits: countBox.right <= buttonBox.right,
      };
      count.textContent = originalCount;
      return layout;
    });
    expect(memberCountLayout).toEqual({ noOverlap: true, countFits: true });

    await page.getByTestId("channel-members").click();
    const membersPanel = page.getByTestId("members-panel");
    await expect(membersPanel).toBeVisible();
    const addPeopleButton = membersPanel.getByRole("button", { name: "Add people to this channel" });
    const addGroupButton = membersPanel.getByRole("button", { name: "Add a group to this channel" });
    await expect(addPeopleButton).toBeVisible();
    await expect(addGroupButton).toBeVisible();
    const addPeopleBox = await addPeopleButton.boundingBox();
    const addGroupBox = await addGroupButton.boundingBox();
    expect(addPeopleBox).not.toBeNull();
    expect(addGroupBox).not.toBeNull();
    expect(Math.abs(addPeopleBox.y - addGroupBox.y)).toBeLessThan(1);

    await addPeopleButton.click();
    await expect(page.getByTestId("add-people-modal")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await addGroupButton.click();
    const dialog = page.locator(".add-group-channel-modal");
    await expect(dialog).toBeVisible();
    await dialog.locator(".add-group-channel-trigger").click();
    await dialog.getByRole("option", { name: new RegExp(groupName) }).click();

    const groupMembers = dialog.getByRole("list", { name: "Selected group members" });
    await expect(groupMembers.getByRole("listitem")).toHaveCount(2);
    await expect(groupMembers).toContainText(fixture.alice.displayName);
    await expect(groupMembers).toContainText(fixture.bob.displayName);
    await expect(groupMembers.getByRole("listitem").filter({ hasText: fixture.alice.displayName })).toContainText("Already in channel");

    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("Added 1 people.");
    await expect(dialog.getByRole("status")).toContainText("1 were already in the channel.");

    const updated = await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}`);
    expect(updated.channel.members).toHaveLength(2);
    expect(updated.channel.members).toContain(fixture.alice.id);
    expect(updated.channel.members).toContain(fixture.bob.id);
    await dialog.getByRole("button", { name: "Done" }).click();

    await membersPanel.getByRole("button", { name: "Close members" }).click();
    await page.getByTestId("channel-title").click();
    const details = page.getByTestId("channel-details-dialog");
    await details.getByRole("tab", { name: "Members" }).click();
    await expect(details.getByRole("button", { name: "Add a group to this channel" })).toBeVisible();
  } finally {
    if (groupId) await requestAsToken(page, fixture.alice.token, `/groups/${groupId}`, { method: "DELETE" }).catch(() => {});
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}`, { method: "DELETE" }).catch(() => {});
  }
});

test("virtualizes the full member list for large groups", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const members = Array.from({ length: 100 }, (_, index) => ({
    id: `virtual-member-${index + 1}`,
    username: `testuser${String(index + 1).padStart(3, "0")}`,
    displayName: `Test User ${String(index + 1).padStart(3, "0")}`,
    avatarUrl: null,
  }));

  await page.route("**/api/groups*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ groups: [{ id: "virtual-group", name: "Large Test Group", memberCount: members.length, members }] }),
  }));
  await page.goto(`/channels/${fixture.projectChannel.id}`);
  await page.getByTestId("channel-members").click();
  await page.getByTestId("members-panel").getByRole("button", { name: "Add a group to this channel" }).click();

  const dialog = page.locator(".add-group-channel-modal");
  await dialog.locator(".add-group-channel-trigger").click();
  const groupOption = dialog.getByRole("option", { name: "Large Test Group (100)" });
  const optionDirection = () => groupOption.evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }));
  expect(await optionDirection()).toEqual({ direction: "ltr", textAlign: "left" });
  await page.evaluate(() => { document.documentElement.dir = "rtl"; });
  expect(await optionDirection()).toEqual({ direction: "rtl", textAlign: "right" });
  await page.evaluate(() => { document.documentElement.dir = "ltr"; });
  await groupOption.click();

  const list = dialog.getByRole("list", { name: "Selected group members" });
  expect(await list.getByRole("listitem").count()).toBeLessThan(100);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  const lastMember = list.locator('[aria-posinset="100"]');
  await expect(lastMember).toContainText("Test User 100");
  await expect(lastMember).toHaveAttribute("aria-posinset", "100");
});
