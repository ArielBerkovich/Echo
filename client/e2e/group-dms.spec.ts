import { expect, test } from "@playwright/test";
import { registerUser, requestAsToken, seedWorkspaceFixture, slug } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function onboard(page, auth) {
  await requestAsToken(page, auth.token, "/users/me/onboarded", { method: "POST" });
}

test("opens a group DM by ID, shows members, and updates its name after adding someone", async ({ page }) => {
  const usernameSuffix = String(Date.now()).slice(-6);
  const third = await registerUser(page, {
    username: `group.third${usernameSuffix}`,
    displayName: "Group Third",
  });
  const fourth = await registerUser(page, {
    username: `group.fourth${usernameSuffix}`,
    displayName: "Group Fourth",
  });
  await onboard(page, third);
  await onboard(page, fourth);

  const created = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userIds: [fixture.bob.id, third.user.id] },
  });
  const group = created.channel;
  const initialLabel = `${fixture.bob.displayName}, ${third.user.displayName}`;
  const updatedLabel = `${initialLabel}, ${fourth.user.displayName}`;

  await page.goto(`/dms/${group.id}`);
  await expect(page).toHaveURL(new RegExp(`/dms/${group.id}$`));
  await expect(page.getByTestId("channel-title")).toContainText(initialLabel);

  await page.getByTestId("channel-members").click();
  const members = page.getByTestId("members-panel");
  await expect(members).toContainText("3 people in this group DM");
  await expect(members).toContainText(fixture.alice.displayName);
  await expect(members).toContainText(fixture.bob.displayName);
  await expect(members).toContainText(third.user.displayName);

  await members.getByRole("button", { name: "+ Add people" }).click();
  const addPeople = page.getByTestId("add-people-modal");
  await addPeople.getByTestId("add-people-search").fill(fourth.user.username);
  await expect(addPeople).toContainText(fourth.user.displayName);
  await addPeople.getByTestId(`add-people-add-${fourth.user.username}`).click();
  await addPeople.getByTestId("add-people-done").click();

  await expect(members).toContainText("4 people in this group DM");
  await expect(members).toContainText(fourth.user.displayName);
  await expect(page.getByTestId("channel-title")).toContainText(updatedLabel);
  await expect(page.getByTestId(`dm-row-${slug(updatedLabel)}`)).toBeVisible();
});

test("keeps legacy group-DM links working and canonicalizes them to the ID", async ({ page }) => {
  const usernameSuffix = String(Date.now()).slice(-6);
  const third = await registerUser(page, {
    username: `legacy.third${usernameSuffix}`,
    displayName: "Legacy Third",
  });
  await onboard(page, third);

  const created = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userIds: [fixture.bob.id, third.user.id] },
  });
  const legacyLabel = `${fixture.bob.displayName}, ${third.user.displayName}`;

  await page.goto(`/dms/${encodeURIComponent(legacyLabel)}`);
  await expect(page).toHaveURL(new RegExp(`/dms/${created.channel.id}$`));
  await expect(page.getByTestId("channel-title")).toContainText(legacyLabel);
});
