import { expect, test } from "@playwright/test";
import { messageById, registerUser, requestAsToken, seedToken, seedWorkspaceFixture, slug, uniqueSuffix } from "./helpers.js";

const DEFAULT_ADMIN_PASSWORD = "Password1";

async function loginWorkspaceAdmin(page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD },
  });
  if (!response.ok()) return null;
  return response.json();
}

async function dismissWalkthrough(page) {
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour.waitFor({ state: "visible", timeout: 2_000 }).catch(() => {});
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
    await expect(page.locator(".wt-overlay")).toHaveCount(0);
  }
}

test.describe("user deprecation", () => {
  test("labels archived users throughout people pickers", async ({ page }) => {
    const fixture = await seedWorkspaceFixture(page);
    const admin = await loginWorkspaceAdmin(page);
    test.skip(!admin, "Set E2E_ADMIN_PASSWORD to run admin-only user deprecation coverage");
    const suffix = uniqueSuffix("archived-picker").replace(/[^a-z0-9]/gi, "").slice(-12);
    const archived = await registerUser(page, {
      username: `archived.picker${suffix}`,
      displayName: "Archived Picker",
    });
    const original = (await requestAsToken(page, admin.token, "/users")).users.find((user) => user.id === archived.user.id);
    let archivedByTest = false;

    try {
      await requestAsToken(page, admin.token, `/admin/users/${archived.user.id}/deprecated`, {
        method: "PATCH",
        body: { deprecated: true },
      });
      archivedByTest = true;
      await seedToken(page, fixture.alice.token);

      await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
      const composer = page.getByTestId("composer-editor");
      await composer.fill(`@${archived.user.username}`);
      const mention = page.locator(".mention-item").filter({ hasText: archived.user.displayName });
      await expect(mention.locator(".deprecated-label")).toHaveText("(archived)");

      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "New message" }).first().click();
      const newMessage = page.getByTestId("new-message-modal");
      const recipientSearch = newMessage.getByTestId("new-message-search-input");
      await recipientSearch.fill(archived.user.username);
      const recipient = newMessage.getByTestId(`new-message-user-${archived.user.username}`);
      await expect(recipient.locator(".deprecated-label")).toHaveText("(archived)");
      await recipient.click();
      await expect(newMessage.getByTestId("new-message-recipient").locator(".deprecated-label")).toHaveText("(archived)");
      await page.keyboard.press("Escape");

      await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
      await expect(page.getByTestId("channel-title")).toContainText("general");
      const source = messageById(page, fixture.messages.searchHit.id);
      await expect(source).toBeVisible();
      await source.hover();
      await page.getByTestId(`message-${fixture.messages.searchHit.id}-forward`).click({ force: true });
      const forward = page.getByTestId("forward-modal");
      const forwardSearch = forward.getByTestId("forward-search");
      await expect(forward).toBeVisible();
      await forwardSearch.fill(archived.user.displayName);
      const forwardRecipient = forward.locator(`#forward-destination-user-${archived.user.id}`);
      await expect(forwardRecipient).toContainText("(archived)");
      await forwardRecipient.click();
      await expect(forward.locator(".forward-selected-chips .forward-chip")).toContainText("(archived)");
      await page.keyboard.press("Escape");

      await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
      await page.getByTestId("channel-members").click();
      await page.getByRole("button", { name: /add people/i }).click();
      const channelPicker = page.getByTestId("add-people-modal");
      await channelPicker.getByTestId("add-people-search").fill(archived.user.username);
      await expect(channelPicker.locator(".person-row").getByText(archived.user.displayName).locator("xpath=..")
        .locator(".deprecated-label")).toHaveText("(archived)");
      await page.keyboard.press("Escape");

      await page.goto("/groups");
      await page.getByRole("button", { name: "Create group" }).click();
      const createGroup = page.locator(".groups-create-modal");
      await createGroup.locator("#create-group-member-search").fill(archived.user.username);
      const groupCandidate = createGroup.locator("#create-group-member-results .forward-destination-row");
      await expect(groupCandidate.locator(".deprecated-label")).toHaveText("(archived)");
      await groupCandidate.click();
      await expect(createGroup.locator(".forward-selected-chips .deprecated-label")).toHaveText("(archived)");
      await page.keyboard.press("Escape");

      const group = await requestAsToken(page, fixture.alice.token, "/groups", {
        method: "POST",
        body: { name: `Archived Picker ${suffix}`, memberIds: [] },
      });
      await page.goto("/groups");
      const groupsPanel = page.getByTestId("groups-panel");
      await groupsPanel.getByRole("button", { name: new RegExp(group.group.name) }).click();
      await groupsPanel.getByRole("button", { name: "Add people" }).click();
      const groupPicker = page.locator(".groups-picker-modal");
      await groupPicker.getByRole("searchbox", { name: "Search people to add" }).fill(archived.user.username);
      const groupPerson = groupPicker.locator(".groups-picker-row").filter({ hasText: archived.user.username });
      await expect(groupPerson.locator(".deprecated-label")).toHaveText("(archived)");
    } finally {
      if (archivedByTest) {
        await requestAsToken(page, admin.token, `/admin/users/${archived.user.id}/deprecated`, {
          method: "PATCH",
          body: { deprecated: !!original?.deprecated },
        });
      }
    }
  });

  test("admin can archive and restore a user, with search and realtime labels", async ({ browser, page }) => {
    const admin = await loginWorkspaceAdmin(page);
    test.skip(!admin, "Set E2E_ADMIN_PASSWORD to run admin-only user deprecation coverage");
    const fixture = await seedWorkspaceFixture(page);
    const target = fixture.bob;
    const original = (await requestAsToken(page, admin.token, "/users")).users.find((user) => user.id === target.id);
    expect(original).toBeTruthy();
    let deprecationChanged = false;

    const memberContext = await browser.newContext({ baseURL: process.env.ECHO_E2E_BASE_URL || "http://127.0.0.1:5173" });
    const memberPage = await memberContext.newPage();
    await seedToken(memberPage, fixture.alice.token);
    try {
      await seedToken(page, admin.token);
      await page.goto("/");
      await expect(page.getByTestId("composer-editor")).toBeVisible();
      await dismissWalkthrough(page);
      await memberPage.goto("/");
      await expect(memberPage.getByTestId("composer-editor")).toBeVisible();
      await dismissWalkthrough(memberPage);

      await page.getByTestId("rail-settings").click();
      await expect(page.getByTestId("admin-deprecation")).toBeVisible();
      await page.waitForTimeout(300);
      await page.getByTestId("admin-deprecation-search").fill(target.username);
      const row = page.getByTestId(`admin-deprecation-user-${target.username}`);
      await expect(row).toBeVisible();
      await page.screenshot({ path: "test-results/user-deprecation-admin-action.png", fullPage: true });
      await row.screenshot({ path: "test-results/user-deprecation-admin-action-row.png" });

      const invalidBody = await page.request.patch(`/api/admin/users/${target.id}/deprecated`, {
        headers: { Authorization: `Bearer ${admin.token}` }, data: { deprecated: "yes" },
      });
      expect(invalidBody.status()).toBe(400);
      const unauthenticated = await page.request.patch(`/api/admin/users/${target.id}/deprecated`, {
        data: { deprecated: true },
      });
      expect(unauthenticated.status()).toBe(401);
      const invalidId = await page.request.patch("/api/admin/users/not-an-id/deprecated", {
        headers: { Authorization: `Bearer ${admin.token}` }, data: { deprecated: true },
      });
      expect(invalidId.status()).toBe(404);
      const adminTarget = await page.request.patch(`/api/admin/users/${admin.user.id}/deprecated`, {
        headers: { Authorization: `Bearer ${admin.token}` }, data: { deprecated: true },
      });
      expect(adminTarget.status()).toBe(403);
      const updateResponsePromise = page.waitForResponse((response) => response.url().includes(`/api/admin/users/${target.id}/deprecated`));
      await row.getByRole("button", { name: "Archive user" }).click();
      const updateResponse = await updateResponsePromise;
      expect(updateResponse.status(), await updateResponse.text()).toBe(200);
      await expect(row).toContainText("(archived)");
      deprecationChanged = true;
      await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
      await page.screenshot({ path: "test-results/user-deprecation-admin-marked.png", fullPage: true });
      await row.screenshot({ path: "test-results/user-deprecation-admin-marked-row.png" });

      const directory = await requestAsToken(page, admin.token, "/users");
      expect(directory.users.find((user) => user.id === target.id)).toMatchObject({ deprecated: true, displayName: target.displayName });

      await memberPage.getByTestId("search-input").fill(target.username);
      const memberSearchResult = memberPage.getByTestId(`search-user-${slug(target.username)}`);
      await expect(memberSearchResult).toContainText("(archived)");
      await memberPage.screenshot({ path: "test-results/user-deprecation-member-search.png", fullPage: true });
      await memberSearchResult.screenshot({ path: "test-results/user-deprecation-member-search-result.png" });

      const denied = await memberPage.request.patch(`/api/admin/users/${target.id}/deprecated`, {
        headers: { Authorization: `Bearer ${fixture.alice.token}` },
        data: { deprecated: false },
      });
      expect(denied.status()).toBe(403);

      await row.getByRole("button", { name: "Restore" }).click();
      await expect(row).not.toContainText("(archived)");
      await expect(memberSearchResult).not.toContainText("(archived)");
      await memberPage.screenshot({ path: "test-results/user-deprecation-restored-search.png", fullPage: true });
      await memberSearchResult.screenshot({ path: "test-results/user-deprecation-restored-result.png" });
      const restored = await requestAsToken(page, admin.token, "/users");
      expect(restored.users.find((user) => user.id === target.id)?.deprecated).toBe(false);

      const longDisplayName = "Alexandria Catherine Montgomery-Fitzgerald von Hohenberg-Smith";
      try {
        await requestAsToken(page, fixture.bob.token, "/users/me", {
          method: "PATCH",
          body: { displayName: longDisplayName },
        });
        await expect(row).toContainText(longDisplayName);
        await row.getByRole("button", { name: "Archive user" }).click();
        await expect(row).toContainText("(archived)");
        await row.screenshot({ path: "test-results/user-archive-long-name-admin.png" });
        await expect(memberSearchResult).toContainText(longDisplayName);
        await expect(memberSearchResult).toContainText("(archived)");
        const archivedBadge = memberSearchResult.locator(".deprecated-label");
        await expect(archivedBadge).toBeVisible();
        const [resultBounds, badgeBounds] = await Promise.all([memberSearchResult.boundingBox(), archivedBadge.boundingBox()]);
        expect(badgeBounds.x + badgeBounds.width).toBeLessThanOrEqual(resultBounds.x + resultBounds.width);
        await memberSearchResult.screenshot({ path: "test-results/user-archive-long-name-search.png" });
      } finally {
        await requestAsToken(page, admin.token, `/admin/users/${target.id}/deprecated`, {
          method: "PATCH",
          body: { deprecated: !!original.deprecated },
        });
        await requestAsToken(page, fixture.bob.token, "/users/me", {
          method: "PATCH",
          body: { displayName: target.displayName },
        });
      }

      await memberPage.getByTestId("rail-settings").click();
      await expect(memberPage.getByTestId("settings-page")).toBeVisible();
      await expect(memberPage.getByTestId("admin-deprecation")).toHaveCount(0);
      await memberPage.screenshot({ path: "test-results/user-deprecation-member-no-admin-control.png", fullPage: true });
    } finally {
      if (deprecationChanged) {
        await requestAsToken(page, admin.token, `/admin/users/${target.id}/deprecated`, {
          method: "PATCH",
          body: { deprecated: !!original.deprecated },
        });
      }
      await memberContext.close();
    }
  });
});
