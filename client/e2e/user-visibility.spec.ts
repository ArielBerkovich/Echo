import { expect, test } from "@playwright/test";
import { apiRequestUrl, registerUser, requestAsToken, seedToken, seedWorkspaceFixture, slug, uniqueSuffix } from "./helpers.js";

// E2E_ADMIN_TOKEN supports existing local workspaces without changing their
// admin password. CI can continue using E2E_ADMIN_PASSWORD or the test default.
async function workspaceAdmin(page) {
  if (process.env.E2E_ADMIN_TOKEN) {
    const { user } = await requestAsToken(page, process.env.E2E_ADMIN_TOKEN, "/auth/me");
    expect(user.isAdmin).toBe(true);
    return { token: process.env.E2E_ADMIN_TOKEN, user };
  }
  const response = await page.request.post(apiRequestUrl("/api/auth/login"), {
    data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "Password1" },
  });
  test.skip(!response.ok(), "Set E2E_ADMIN_PASSWORD or E2E_ADMIN_TOKEN for visibility coverage");
  return response.json();
}

async function newPerson(page) {
  return registerUser(page, {
    username: `aaa.visibility${uniqueSuffix().replace(/[^a-z0-9]/gi, "").slice(-14)}`,
    displayName: "Aaa Visibility",
  });
}

async function openWorkspace(page, token, channelName) {
  await seedToken(page, token);
  await page.goto(`/channels/${encodeURIComponent(channelName)}`);
  await expect(page.getByTestId("composer-editor")).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible()) await skip.click();
}

for (const archived of [false, true]) {
  test(`hiding ${archived ? "an archived" : "an active"} person updates search and mentions live and survives reload`, async ({ browser, page }) => {
    const fixture = await seedWorkspaceFixture(page);
    const admin = await workspaceAdmin(page);
    const account = await newPerson(page);
    const target = account.user;
    const memberContext = await browser.newContext({ baseURL: process.env.ECHO_E2E_BASE_URL || "http://127.0.0.1:5173" });
    const member = await memberContext.newPage();
    const setStatus = (field, value) => requestAsToken(page, admin.token, `/admin/users/${target.id}/${field}`, {
      method: "PATCH", body: { [field]: value },
    });
    try {
      if (archived) await setStatus("deprecated", true);
      await openWorkspace(page, admin.token, fixture.generalChannel.name);
      await openWorkspace(member, fixture.alice.token, fixture.projectChannel.name);
      const composer = member.getByTestId("composer-editor");
      const mention = member.locator(".mention-item").filter({ hasText: target.username });
      await composer.fill(`@${target.username}`);
      await expect(mention).toBeVisible();

      await page.getByTestId("rail-settings").click();
      await page.getByTestId("admin-deprecation-search").fill(target.username);
      const row = page.getByTestId(`admin-deprecation-user-${target.username}`);
      await row.getByRole("button", { name: "Hide user", exact: true }).click();
      await expect(row).toContainText("(hidden)");
      // The member has not navigated or reloaded: this exercises user:update.
      await expect(mention).toHaveCount(0);
      await member.keyboard.press("Escape");
      await member.getByTestId("search-input").fill(target.username);
      const searchResult = member.getByTestId(`search-user-${slug(target.username)}`);
      await expect(searchResult).toHaveCount(0);
      await member.reload();
      await expect(composer).toBeVisible();
      await composer.fill(`@${target.username}`);
      await expect(mention).toHaveCount(0);
      await member.keyboard.press("Escape");
      await member.getByRole("button", { name: "New message", exact: true }).first().click();
      const newMessage = member.getByTestId("new-message-modal");
      await newMessage.getByTestId("new-message-search-input").fill(target.username);
      await expect(newMessage.getByTestId(`new-message-user-${target.username}`)).toHaveCount(0);
      await member.keyboard.press("Escape");

      for (const query of [target.username, target.displayName]) {
        const directory = await requestAsToken(page, fixture.alice.token, `/users?q=${encodeURIComponent(query)}`);
        expect(directory.users.some((user) => user.id === target.id)).toBe(false);
      }
      const profile = await requestAsToken(page, fixture.alice.token, `/users/${target.id}`);
      expect(profile.user).toMatchObject({ hidden: true, deprecated: archived });
      // Hiding never disables the account itself.
      const login = await page.request.post(apiRequestUrl("/api/auth/login"), {
        data: { username: target.username, password: "Password1" },
      });
      expect(login.ok()).toBe(true);

      // Hidden people remain manageable after a fresh settings load.
      await page.reload();
      await page.getByTestId("admin-deprecation-search").fill(target.username);
      await expect(row).toContainText("(hidden)");
      await row.getByRole("button", { name: "Show user", exact: true }).click();
      await expect(row).not.toContainText("(hidden)");
      const shown = await requestAsToken(page, fixture.alice.token, `/users/${target.id}`);
      expect(shown.user).toMatchObject({ hidden: false, deprecated: archived });
      // Resume typing in the member's window after the admin action, rather
      // than refilling a background editor with its existing dismissed query.
      await member.bringToFront();
      await composer.fill("");
      await composer.pressSequentially(`@${target.username}`);
      await expect(mention).toBeVisible();
      await member.keyboard.press("Escape");
      await member.getByTestId("search-input").fill(target.username);
      await expect(searchResult).toBeVisible();
      if (archived) await expect(searchResult).toContainText("(archived)");
    } finally {
      await setStatus("hidden", false);
      await setStatus("deprecated", false);
      await memberContext.close();
    }
  });
}

test("visibility updates require admin authorization and a boolean, and do not alter archival", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const admin = await workspaceAdmin(page);
  const { user } = await newPerson(page);
  const patch = (id, body, token?) => page.request.patch(apiRequestUrl(`/api/admin/users/${id}/hidden`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, data: body,
  });
  expect((await patch(user.id, { hidden: true })).status()).toBe(401);
  expect((await patch(user.id, { hidden: true }, fixture.alice.token)).status()).toBe(403);
  for (const body of [{}, { hidden: "true" }, { hidden: 1 }, { hidden: null }]) {
    expect((await patch(user.id, body, admin.token)).status()).toBe(400);
  }
  expect((await patch("not-an-id", { hidden: true }, admin.token)).status()).toBe(404);
  expect((await patch("000000000000000000000000", { hidden: true }, admin.token)).status()).toBe(404);
  expect((await patch(admin.user.id, { hidden: true }, admin.token)).status()).toBe(403);
  try {
    await requestAsToken(page, admin.token, `/admin/users/${user.id}/hidden`, { method: "PATCH", body: { hidden: true } });
    for (const deprecated of [true, false]) {
      const updated = await requestAsToken(page, admin.token, `/admin/users/${user.id}/deprecated`, {
        method: "PATCH", body: { deprecated },
      });
      expect(updated.user).toMatchObject({ hidden: true, deprecated });
    }
  } finally {
    await requestAsToken(page, admin.token, `/admin/users/${user.id}/hidden`, { method: "PATCH", body: { hidden: false } });
  }
});

test("find users to hide scans all pages, groups exact suffix matches, and supports individual and bulk hiding", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const admin = await workspaceAdmin(page);
  const baseName = `aaa.candidate${Date.now().toString().slice(-9)}`;
  const accounts = [];
  for (const suffix of ["", "1", "2", "3", "4", "5"]) {
    accounts.push(await registerUser(page, { username: `${baseName}${suffix}`, displayName: "Aaa Candidate" }));
  }
  const [base, first, second, unrelated, archived, alreadyHidden] = accounts.map((account) => account.user);
  const update = (user, field, value) => requestAsToken(page, admin.token, `/admin/users/${user.id}/${field}`, {
    method: "PATCH", body: { [field]: value },
  });
  try {
    await update(archived, "deprecated", true);
    await update(alreadyHidden, "deprecated", true);
    await update(alreadyHidden, "hidden", true);
    await openWorkspace(page, admin.token, fixture.generalChannel.name);
    await page.getByTestId("rail-settings").click();
    // Limit the dialog's scan to test-owned accounts: bulk actions must never
    // modify existing people in the developer's workspace. Two pages ensure
    // matching works when the base and its suffixed users span pages.
    const requestedPages = [];
    await page.route("**/api/users?*", async (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get("page"));
      requestedPages.push(pageNumber);
      const current = await Promise.all(accounts.map(async (account) =>
        (await requestAsToken(page, admin.token, `/users/${account.user.id}`)).user));
      await route.fulfill({ json: { users: pageNumber === 0 ? current.slice(0, 1) : current.slice(1), hasMore: pageNumber === 0 } });
    });
    await page.getByTestId("find-users-to-hide").click();
    const dialog = page.getByTestId("hide-users-dialog");
    const row = (user) => dialog.getByTestId(`hide-candidate-${user.username}`);
    await expect(row(archived)).toBeVisible();
    expect(requestedPages).toEqual([0, 1]);
    await expect(dialog.getByTestId("hide-candidates-archived").getByTestId(`hide-candidate-${archived.username}`)).toBeVisible();
    await expect(dialog.getByTestId("hide-candidates-duplicates").getByTestId(`hide-candidate-${first.username}`)).toBeVisible();
    await expect(row(second)).toBeVisible();
    for (const user of [base, unrelated, alreadyHidden]) await expect(row(user)).toHaveCount(0);
    await row(first).getByRole("button", { name: "Hide user", exact: true }).click();
    await expect(row(first).getByRole("button")).toBeDisabled();

    // A partial failure must preserve successes and let the admin retry.
    let failOnce = true;
    await page.route(`**/api/admin/users/${second.id}/hidden`, async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({ status: 500, json: { error: "Temporary test failure" } });
      } else await route.continue();
    });
    await dialog.getByRole("button", { name: "Hide all candidates", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(second.username);
    await expect(row(archived).getByRole("button")).toBeDisabled();
    await expect(row(second).getByRole("button", { name: "Hide user", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Hide all candidates", exact: true }).click();
    await expect(row(second).getByRole("button")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Hide all candidates", exact: true })).toBeDisabled();
    for (const user of [first, second, archived]) {
      expect((await requestAsToken(page, admin.token, `/users/${user.id}`)).user.hidden).toBe(true);
    }
    for (const user of [base, unrelated]) {
      expect((await requestAsToken(page, admin.token, `/users/${user.id}`)).user.hidden).toBe(false);
    }
    expect((await requestAsToken(page, admin.token, `/users/${archived.id}`)).user.deprecated).toBe(true);
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    await page.getByTestId("find-users-to-hide").click();
    await expect(dialog.getByText("No users to hide in this group.")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    for (const user of [first, second, archived, alreadyHidden]) await update(user, "hidden", false);
    for (const user of [archived, alreadyHidden]) await update(user, "deprecated", false);
  }
});


test("hiding a duplicate affects only its ID and hidden users remain manageable outside the cached directory", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const admin = await workspaceAdmin(page);
  const username = `jane.doe${Date.now()}`;
  const base = await registerUser(page, { username, displayName: "Jane Doe" });
  const duplicate = await registerUser(page, { username: `${username}1`, displayName: "Jane Doe" });
  const targetIds = new Set([base.user.id, duplicate.user.id]);
  const patchRequests = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().endsWith("/hidden")) patchRequests.push(request.url());
  });
  // Model a stale shared directory. Admin management must independently fetch
  // these accounts even when the shared cache has not received them yet.
  let scanDirectory = false;
  await page.route("**/api/users?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const response = await route.fetch();
    const body = await response.json();
    if (!params.has("q") && !scanDirectory) {
      body.users = body.users.filter((user) => !targetIds.has(user.id));
    }
    await route.fulfill({ response, json: body });
  });
  try {
    await openWorkspace(page, admin.token, fixture.generalChannel.name);
    await page.getByTestId("rail-settings").click();
    scanDirectory = true;
    await page.getByTestId("find-users-to-hide").click();
    const dialog = page.getByTestId("hide-users-dialog");
    await dialog.getByTestId(`hide-candidate-${duplicate.user.username}`).getByRole("button", { name: "Hide user", exact: true }).click();
    await expect(dialog.getByTestId(`hide-candidate-${duplicate.user.username}`).getByRole("button")).toBeDisabled();
    expect(patchRequests).toHaveLength(1);
    expect(patchRequests[0]).toContain(`/admin/users/${duplicate.user.id}/hidden`);
    expect((await requestAsToken(page, admin.token, `/users/${base.user.id}`)).user.hidden).toBe(false);
    expect((await requestAsToken(page, admin.token, `/users/${duplicate.user.id}`)).user.hidden).toBe(true);
    const adminSearchPath = `/api/admin/users?q=${username}`;
    expect((await page.request.get(apiRequestUrl(adminSearchPath))).status()).toBe(401);
    expect((await page.request.get(apiRequestUrl(adminSearchPath), {
      headers: { Authorization: `Bearer ${fixture.alice.token}` },
    })).status()).toBe(403);
    const managed = await requestAsToken(page, admin.token, `/admin/users?q=${username}`);
    expect(managed.users.map((user) => ({ id: user.id, hidden: user.hidden }))).toEqual(expect.arrayContaining([
      { id: base.user.id, hidden: false }, { id: duplicate.user.id, hidden: true },
    ]));
    const visible = await requestAsToken(page, fixture.alice.token, `/users?q=${username}`);
    expect(visible.users.map((user) => user.id)).toContain(base.user.id);
    expect(visible.users.map((user) => user.id)).not.toContain(duplicate.user.id);
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    scanDirectory = false;
    // Admin search must fetch users absent from the shared directory, including
    // hidden users after a reload, and restore only the selected ID.
    await page.reload();
    const search = page.getByTestId("admin-deprecation-search");
    await search.fill(username);
    const baseRow = page.getByTestId(`admin-deprecation-user-${base.user.username}`);
    const hiddenRow = page.getByTestId(`admin-deprecation-user-${duplicate.user.username}`);
    await expect(baseRow.getByRole("button", { name: "Hide user", exact: true })).toBeVisible();
    await expect(hiddenRow.getByRole("button", { name: "Show user", exact: true })).toBeVisible();
    await search.fill(`@${duplicate.user.username}`);
    await hiddenRow.getByRole("button", { name: "Show user", exact: true }).click();
    await expect(hiddenRow.getByRole("button", { name: "Hide user", exact: true })).toBeVisible();
    expect((await requestAsToken(page, admin.token, `/users/${base.user.id}`)).user.hidden).toBe(false);
    expect((await requestAsToken(page, admin.token, `/users/${duplicate.user.id}`)).user.hidden).toBe(false);
  } finally {
    await requestAsToken(page, admin.token, `/admin/users/${duplicate.user.id}/hidden`, { method: "PATCH", body: { hidden: false } });
  }
});

test("lists all hidden or archived users across pages and lets admins show and restore them", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const admin = await workspaceAdmin(page);
  const accounts = [];
  const name = `listed.person${Date.now()}`;
  for (const suffix of ["", "1", "2", "3"]) accounts.push(await registerUser(page, { username: `${name}${suffix}`, displayName: "Listed Person" }));
  const [normal, hidden, archived, both] = accounts.map(({ user }) => user);
  const update = (user, field, value) => requestAsToken(page, admin.token, `/admin/users/${user.id}/${field}`, { method: "PATCH", body: { [field]: value } });
  try {
    await update(hidden, "hidden", true);
    await update(archived, "deprecated", true);
    await update(both, "hidden", true);
    await update(both, "deprecated", true);
    const filler = Array.from({ length: 10 }, (_, i) => ({ id: String(i).padStart(24, "0"), username: `archived.person${i}`, displayName: "Archived Person", deprecated: true }));
    const pages = [];
    let empty = false;
    await page.route("**/api/admin/users?*", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      const number = Number(params.get("page"));
      pages.push(number);
      const current = await Promise.all(accounts.map(async ({ user }) => (await requestAsToken(page, admin.token, `/users/${user.id}`)).user));
      const users = empty ? [] : [...current, ...filler].filter((user) => `${user.username} ${user.displayName}`.toLowerCase().includes(params.get("q") || ""));
      await route.fulfill({ json: { users: number === 0 ? users.slice(0, 2) : users.slice(2), hasMore: number === 0 && users.length > 2 } });
    });
    await openWorkspace(page, admin.token, fixture.generalChannel.name);
    await page.getByTestId("rail-settings").click();
    const button = page.getByTestId("show-hidden-archived-users");
    await button.click();
    await expect(button).toHaveAttribute("aria-haspopup", "dialog");
    const section = page.getByTestId("managed-users-dialog");
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Hidden and archived users" })).toBeVisible();
    await expect(section.locator(".search-row")).toHaveCount(13);
    expect(pages).toEqual([0, 1]);
    const row = (user) => page.getByTestId(`admin-deprecation-user-${user.username}`);
    await expect(row(normal)).toHaveCount(0);
    await row(hidden).getByRole("button", { name: "Show user", exact: true }).click();
    await expect(row(hidden)).toHaveCount(0);
    await row(archived).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(row(archived)).toHaveCount(0);
    await page.getByTestId("admin-deprecation-search").fill(both.username);
    await expect(section.locator(".search-row")).toHaveCount(1);
    await row(both).getByRole("button", { name: "Show user", exact: true }).click();
    await expect(row(both)).toContainText("(archived)");
    await expect(row(both)).not.toContainText("(hidden)");
    await row(both).getByRole("button", { name: "Restore", exact: true }).click();
    await expect(row(both)).toHaveCount(0);
    await expect(section.getByRole("status")).toContainText("No hidden or archived users found.");
    expect((await requestAsToken(page, admin.token, `/users/${both.id}`)).user).toMatchObject({ hidden: false, deprecated: false });
    await page.keyboard.press("Escape");
    await expect(section).toHaveCount(0);
    await expect(page.getByTestId("admin-deprecation")).toBeVisible();
    await expect(button).toBeFocused();
    empty = true;
    await button.click();
    await expect(section.getByRole("status")).toContainText("No hidden or archived users found.");
    await section.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(section).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    for (const user of [hidden, both]) await update(user, "hidden", false);
    for (const user of [archived, both]) await update(user, "deprecated", false);
  }
});
