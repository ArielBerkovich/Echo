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

test("renames a group DM and keeps the custom name after refresh", async ({ page }) => {
  const usernameSuffix = String(Date.now()).slice(-6);
  const third = await registerUser(page, {
    username: `rename.third${usernameSuffix}`,
    displayName: "Rename Third",
  });
  await onboard(page, third);
  const created = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userIds: [fixture.bob.id, third.user.id] },
  });
  const customName = `qa-group-${usernameSuffix}`;

  await page.goto(`/home/dms/${created.channel.id}`);
  await page.getByTestId("channel-members").click();
  const members = page.getByTestId("members-panel");
  await members.getByRole("button", { name: "Rename group DM" }).click();
  await members.getByRole("textbox", { name: "Group DM name" }).fill(customName);
  await members.getByRole("button", { name: "Save" }).click();

  await expect(page.getByTestId("channel-title")).toHaveText(customName);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/home/dms/${created.channel.id}$`));
  await expect(page.getByTestId("channel-title")).toHaveText(customName);
});

test("converts a group DM into a private channel", async ({ page }) => {
  const usernameSuffix = String(Date.now()).slice(-6);
  const third = await registerUser(page, {
    username: `convert.third${usernameSuffix}`,
    displayName: "Convert Third",
  });
  await onboard(page, third);
  const created = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userIds: [fixture.bob.id, third.user.id] },
  });
  const channelName = `qa-convert-${usernameSuffix}`;

  await page.goto(`/home/dms/${created.channel.id}`);
  await page.getByTestId("channel-members").click();
  const members = page.getByTestId("members-panel");
  await members.getByRole("button", { name: "Convert to private channel" }).click();
  await members.getByRole("textbox", { name: "New private channel name" }).fill(channelName);
  await members.getByRole("button", { name: "Convert", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/channels/${created.channel.id}$`));
  await expect(page.getByTestId("channel-title")).toContainText(channelName);
  await expect(page.getByTestId("channel-members")).toBeVisible();
});
