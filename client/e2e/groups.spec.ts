import { expect, test } from "@playwright/test";
import { messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("opens the groups workspace and shows Echo members", async ({ page }) => {
  await page.route("**/api/groups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [{ provider: "rhsso", id: "design-group", name: "Design", path: "/Design" }] }),
    });
  });
  await page.route(/\/api\/groups\/rhsso\/design-group(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        group: { provider: "rhsso", id: "design-group", name: "Design", path: "/Design" },
        members: [
          { id: "directory-alice", username: "alice", displayName: "Alice Directory", echoUser: { id: fixture.alice.id, username: fixture.alice.username, displayName: fixture.alice.displayName } },
          { id: "directory-only", username: "external", displayName: "External User", echoUser: null },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByTestId("sidebar-more").click();
  await page.getByTestId("open-groups").click();
  await expect(page).toHaveURL(/\/groups$/);

  const panel = page.getByTestId("groups-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("pane-search")).toBeVisible();
  await expect(panel).toContainText("1 group");
  await panel.getByRole("button", { name: /Design/ }).click();
  await expect(panel).toContainText("Alice Directory");
  await expect(panel).not.toContainText("External User");
});

test("renders a group mention as a clickable pill that opens its group", async ({ page }) => {
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: "Please review with @group.rhsso.design-group",
      externalKey: `group-mention-${fixture.suffix}`,
    },
  });

  await page.route("**/api/groups", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ groups: [{ provider: "rhsso", id: "design-group", name: "Design", path: "/Design" }] }),
    });
  });
  await page.route(/\/api\/groups\/rhsso\/design-group(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ group: { provider: "rhsso", id: "design-group", name: "Design", path: "/Design" }, members: [] }),
    });
  });
  await page.route("**/api/channels/**/messages**", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.messages = payload.messages.map((message) => message.id === created.message.id
      ? { ...message, body: "Please review with @Design", mentionedGroups: [{ provider: "rhsso", id: "design-group", name: "Design", path: "/Design" }] }
      : message);
    await route.fulfill({
      status: response.status(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  await page.goto("/channels/general");
  const message = messageById(page, created.message.id);
  const groupMention = message.locator(".mention--group");
  await expect(groupMention).toHaveText("@Design");
  await expect(groupMention).toHaveAttribute("aria-label", "@Design, group");
  await expect(groupMention.locator("svg.mention-group-icon")).toBeVisible();
  await groupMention.click();
  await expect(page.getByTestId("groups-panel")).toBeVisible();
  await expect(page.getByTestId("groups-panel")).toContainText("Design");
});
