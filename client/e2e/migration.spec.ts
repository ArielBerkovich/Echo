import { expect, test } from "@playwright/test";
import { registerUser, uniqueSuffix } from "./helpers.js";

test("a logged-out local account can become a new local identity without losing its profile", async ({ page }) => {
  const suffix = uniqueSuffix("migration").replace(/[^a-z0-9]/gi, "").slice(-16);
  const oldUsername = `migration.source${suffix}`;
  const newUsername = `migration.target${suffix}`;
  const oldPassword = "Password1";
  const newPassword = "Password2";
  const registered = await registerUser(page, {
    username: oldUsername,
    password: oldPassword,
    displayName: "Migration Source",
  });

  const start = await page.request.post("/api/auth/migration/start", {
    data: { oldUsername, oldPassword, targetType: "local" },
  });
  expect(start.status()).toBe(201);
  await expect(start.json()).resolves.toMatchObject({
    source: {
      username: oldUsername,
      displayName: "Migration Source",
    },
    targetType: "local",
  });

  const confirm = await page.request.post("/api/auth/migration/confirm", {
    data: { username: newUsername, password: newPassword },
  });
  expect(confirm.ok()).toBeTruthy();
  const migrated = await confirm.json();
  expect(migrated.user).toMatchObject({
    id: registered.user.id,
    username: newUsername,
    displayName: "Migration Source",
    aliases: [oldUsername],
  });

  const staleSession = await page.request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${registered.token}` },
  });
  expect(staleSession.status()).toBe(401);

  const oldLogin = await page.request.post("/api/auth/login", {
    data: { username: oldUsername, password: oldPassword },
  });
  expect(oldLogin.status()).toBe(401);

  const newLogin = await page.request.post("/api/auth/login", {
    data: { username: newUsername, password: newPassword },
  });
  expect(newLogin.ok()).toBeTruthy();

  const directory = await page.request.get("/api/users", {
    headers: { Authorization: `Bearer ${migrated.token}` },
  });
  const users = (await directory.json()).users;
  expect(users.find((user) => user.id === registered.user.id)).toMatchObject({
    username: newUsername,
    displayName: "Migration Source",
    aliases: [oldUsername],
  });
});

test("migration rejects an invalid old password without revealing eligibility", async ({ page }) => {
  const suffix = uniqueSuffix("migration").replace(/[^a-z0-9]/gi, "").slice(-16);
  const oldUsername = `migration.reject${suffix}`;
  await registerUser(page, {
    username: oldUsername,
    displayName: "Migration Reject",
  });

  const response = await page.request.post("/api/auth/migration/start", {
    data: { oldUsername, oldPassword: "WrongPassword1", targetType: "local" },
  });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: "The old account credentials are invalid or the account cannot be migrated.",
  });
});

test("the account-creation UI migrates a logged-out local user", async ({ page }) => {
  const suffix = uniqueSuffix("migration").replace(/[^a-z0-9]/gi, "").slice(-16);
  const oldUsername = `preserved.person${suffix}`;
  const letters = suffix.replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)));
  const newUsername = `migration.${letters}`;
  await registerUser(page, {
    username: oldUsername,
    displayName: "Preserved Person",
  });

  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?local=true");
  await expect(page.getByRole("button", { name: "Bring its history" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("First name").fill("Migration");
  await page.getByLabel("Last name").fill(letters);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password", { exact: true }).fill("Password2");
  await page.getByLabel("Confirm password").fill("Password2");
  await page.getByRole("button", { name: "Bring its history" }).click();
  await expect(page.getByTestId("creation-migration-modal")).toBeVisible();
  await page.getByLabel("Old username").fill(oldUsername);
  await page.getByLabel("Old password").fill("Password1");
  await page.getByRole("button", { name: "Keep old history and continue" }).click();

  await expect(page.getByTestId("rail-logout")).toBeVisible();
  await expect(page.getByText("Preserved Person", { exact: true }).first()).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem("echo.token"));
  const me = await page.request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  await expect(me.json()).resolves.toMatchObject({
    user: { username: newUsername, displayName: "Preserved Person" },
  });
});

test("running clients receive the migrated username without a refresh", async ({ browser, page }) => {
  const suffix = uniqueSuffix("migration").replace(/[^a-z0-9]/gi, "").slice(-16);
  const oldUsername = `live.source${suffix}`;
  const newUsername = `live.target${suffix}`;
  await registerUser(page, {
    username: oldUsername,
    displayName: "Live Source",
  });
  const observer = await registerUser(page, {
    username: `live.observer${suffix}`,
    displayName: "Live Observer",
  });

  const observerContext = await browser.newContext();
  const observerPage = await observerContext.newPage();
  await observerPage.addInitScript((token) => localStorage.setItem("echo.token", token), observer.token);
  try {
    await observerPage.goto("/");
    await expect(observerPage.getByTestId("rail-logout")).toBeVisible();
    await observerPage.getByTestId("search-input").fill(oldUsername);
    await expect(observerPage.getByTestId(`search-user-${oldUsername.replaceAll(".", "-")}`)).toBeVisible();

    const start = await page.request.post("/api/auth/migration/start", {
      data: { oldUsername, oldPassword: "Password1", targetType: "local" },
    });
    expect(start.status()).toBe(201);
    const confirm = await page.request.post("/api/auth/migration/confirm", {
      data: { username: newUsername, password: "Password2" },
    });
    expect(confirm.ok()).toBeTruthy();

    await observerPage.getByTestId("search-input").fill(newUsername);
    await expect(observerPage.getByTestId(`search-user-${newUsername.replaceAll(".", "-")}`)).toBeVisible();
  } finally {
    await observerContext.close();
  }
});
