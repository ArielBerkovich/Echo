import { expect, test } from "@playwright/test";
import { requestAsToken, seedToken, seedWorkspaceFixture, slug } from "./helpers.js";

const DEFAULT_ADMIN_PASSWORD = "Password1";

async function loginWorkspaceAdmin(page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD },
  });
  if (!response.ok()) return null;
  return response.json();
}

test.describe("user deprecation", () => {
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
      await memberPage.goto("/");
      await expect(memberPage.getByTestId("composer-editor")).toBeVisible();

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
