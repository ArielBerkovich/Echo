const path = require("node:path");
const { _electron: electron, expect, test } = require("@playwright/test");

const electronDir = path.resolve(__dirname, "..");
const echoUrl = process.env.ECHO_URL || "http://localhost:8091";
const rhssoPort = new URL(process.env.RHSSO_ORIGIN || "http://localhost:8180").port;
const rhssoUser = process.env.RHSSO_USER || "jane.doe";
const rhssoPassword = process.env.RHSSO_PASSWORD || "UserPassword1";

test("signs in through RHSSO, sends messages, and signs out from the Electron shell", async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath("electron-user-data");
  const app = await electron.launch({
    args: [electronDir, `--user-data-dir=${userDataDir}`],
    cwd: electronDir,
    env: {
      ...process.env,
      ECHO_BACKEND_URL: echoUrl,
      ECHO_DISABLE_AUTO_UPDATE: "1",
    },
  });

  try {
    const mainWindow = await app.firstWindow();
    await expect(mainWindow.getByRole("button", { name: "Sign in with RHSSO" })).toBeVisible();
    expect(await mainWindow.evaluate(() => Boolean(window.echoDesktopAuth))).toBe(true);

    const rhssoWindowPromise = app.waitForEvent("window");
    await mainWindow.getByRole("button", { name: "Sign in with RHSSO" }).click();
    const rhssoWindow = await rhssoWindowPromise;

    await rhssoWindow.waitForURL((url) => url.port === rhssoPort);
    await expect(rhssoWindow.locator("#username")).toBeVisible();
    await rhssoWindow.locator("#username").fill(rhssoUser);
    await rhssoWindow.locator("#password").fill(rhssoPassword);
    await rhssoWindow.locator("#kc-login").click();

    const creationModal = mainWindow.getByTestId("creation-migration-modal");
    if (await creationModal.isVisible().catch(() => false)) {
      await creationModal.getByRole("button", { name: "Create a new Echo account" }).click();
    }

    await expect(mainWindow.getByTestId("rail-logout")).toBeVisible();
    const skipTour = mainWindow.getByRole("button", { name: "Skip tour" });
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click();

    const composer = mainWindow.getByTestId("composer-editor");
    await expect(composer).toBeVisible();
    const messages = [1, 2, 3].map(
      (index) => `Electron RHSSO smoke message ${index} ${Date.now()}`
    );
    for (const message of messages) {
      await composer.fill(message);
      await composer.press("Enter");
      await expect(mainWindow.getByText(message, { exact: true })).toBeVisible();
    }

    await mainWindow.getByTestId("rail-logout").click();
    await mainWindow.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(mainWindow.getByRole("button", { name: "Sign in with RHSSO" })).toBeVisible();
  } finally {
    await app.close();
  }
});
