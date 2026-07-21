const { app, BrowserWindow, dialog, ipcMain, Menu, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");

const NOTIFICATION_LIFETIME_MS = 5000;
const UPDATE_CHECK_DELAY_MS = 10_000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const notificationState = new Map();
let mainWindow;
let setupWindow;
let updateFeedUrl;
let updateCheckTimer;
let updateCheckInFlight = false;
let updateDownloaded = false;
let launchedAfterUpdate = process.argv.includes("--updated");

function appIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "echo-logo.png")
    : path.join(__dirname, "../client/src/assets/echo-logo.png");
}

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function pendingUpdatePath() {
  return path.join(app.getPath("userData"), "pending-update.json");
}

function markPendingUpdate(version) {
  try {
    fs.mkdirSync(path.dirname(pendingUpdatePath()), { recursive: true });
    fs.writeFileSync(pendingUpdatePath(), JSON.stringify({ version }));
  } catch (error) {
    console.warn("Could not save the pending Echo update:", error?.message || error);
  }
}

function consumePendingUpdate() {
  try {
    const marker = JSON.parse(fs.readFileSync(pendingUpdatePath(), "utf8"));
    fs.unlinkSync(pendingUpdatePath());
    return marker.version === app.getVersion();
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Could not read the pending Echo update:", error?.message || error);
    }
    return false;
  }
}

function configuredUrl() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    return typeof config.backendUrl === "string" ? config.backendUrl : null;
  } catch {
    return null;
  }
}

function backendUrl() {
  const explicit = process.env.ECHO_BACKEND_URL || process.argv.find((arg) => arg.startsWith("--echo-server-url="));
  return explicit?.startsWith("--echo-server-url=")
    ? explicit.slice("--echo-server-url=".length)
    : explicit || configuredUrl();
}

function desktopUpdatePlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux" && process.env.APPIMAGE) return "linux";
  return null;
}

async function checkForDesktopUpdate() {
  if (updateCheckInFlight || updateDownloaded) return;
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn("Desktop update check failed:", error?.message || error);
  } finally {
    updateCheckInFlight = false;
  }
}

function configureDesktopUpdates(url) {
  const platform = desktopUpdatePlatform();
  if (!app.isPackaged || !platform || process.env.ECHO_DISABLE_AUTO_UPDATE === "1") return;

  let feedUrl;
  try {
    feedUrl = `${new URL(url).toString().replace(/\/+$/, "")}/api/desktop-updates/${platform}`;
  } catch {
    console.warn("Desktop updates are disabled because the configured Echo URL is invalid");
    return;
  }
  if (feedUrl === updateFeedUrl) return;

  updateFeedUrl = feedUrl;
  autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
  clearTimeout(updateCheckTimer);
  updateCheckTimer = setTimeout(() => {
    void checkForDesktopUpdate();
    updateCheckTimer = setInterval(() => void checkForDesktopUpdate(), UPDATE_CHECK_INTERVAL_MS);
    updateCheckTimer.unref?.();
  }, UPDATE_CHECK_DELAY_MS);
  updateCheckTimer.unref?.();
}

function initializeDesktopUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.warn("Desktop updater error:", error?.message || error);
  });
  autoUpdater.on("update-downloaded", async (info) => {
    updateDownloaded = true;
    const options = {
      type: "info",
      title: "Echo update ready",
      message: `Echo ${info.version} has been downloaded.`,
      detail: "Restart Echo now to finish installing the update.",
      buttons: ["Restart and update"],
      defaultId: 0,
      noLink: true,
    };
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, options);
    } else {
      await dialog.showMessageBox(options);
    }
    markPendingUpdate(info.version);
    autoUpdater.quitAndInstall(false, true);
  });
}

function createWindow(url, uiUrl = null) {
  mainWindow = new BrowserWindow({
    title: "Echo",
    icon: appIconPath(),
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [
        `--echo-backend-url=${url}`,
        `--echo-app-version=${app.getVersion()}`,
        `--echo-was-updated=${launchedAfterUpdate}`,
      ],
    },
  });

  if (uiUrl) mainWindow.loadURL(uiUrl);
  else {
    const clientDist = app.isPackaged
      ? path.join(process.resourcesPath, "client-dist")
      : path.join(__dirname, "../client/dist");
    mainWindow.loadFile(path.join(clientDist, "index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  configureDesktopUpdates(url);
}

function showSetupWindow() {
  setupWindow = new BrowserWindow({
    title: "Echo",
    icon: appIconPath(),
    width: 520,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.on("closed", () => {
    setupWindow = undefined;
    if (!mainWindow) app.quit();
  });
}

function persistBackendUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "Enter a valid backend URL, such as https://echo.example.com" };
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    return { ok: false, error: "The backend URL must use HTTP or HTTPS and cannot contain credentials" };
  }

  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({ backendUrl: candidate }, null, 2));
  } catch {
    return { ok: false, error: "Echo could not save the backend URL" };
  }
  return { ok: true, backendUrl: candidate };
}

ipcMain.handle("echo:save-backend-url", (_event, value) => {
  const result = persistBackendUrl(value);
  if (!result.ok) return result;
  createWindow(result.backendUrl);
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  return { ok: true };
});

ipcMain.handle("echo:change-backend-url", (_event, value) => {
  const result = persistBackendUrl(value);
  if (!result.ok) return result;
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 150);
  return { ok: true };
});

ipcMain.on("echo:show-notification", (event, { id, title, body, tag } = {}) => {
  // Keep this check in the privileged process so renderer focus races cannot
  // cause an alert while the desktop window is active.
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) return;

  const previous = tag && notificationState.get(`tag:${tag}`);
  if (previous) {
    clearTimeout(previous.timer);
    previous.notification.close();
    notificationState.delete(previous.id);
  }

  const notification = new Notification({
    title: String(title || "Echo"),
    body: String(body || ""),
    icon: appIconPath(),
    urgency: "normal",
  });
  const state = {
    id,
    notification,
    timer: setTimeout(() => {
      notification.close();
      notificationState.delete(id);
      if (tag) notificationState.delete(`tag:${tag}`);
    }, NOTIFICATION_LIFETIME_MS),
  };
  notificationState.set(id, state);
  if (tag) notificationState.set(`tag:${tag}`, state);

  notification.on("click", () => {
    clearTimeout(state.timer);
    notification.close();
    notificationState.delete(id);
    if (tag) notificationState.delete(`tag:${tag}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
    event.sender.send("echo:notification-click", id);
  });
  notification.show();
});

app.whenReady().then(() => {
  app.setName("Echo");
  Menu.setApplicationMenu(null);
  launchedAfterUpdate = consumePendingUpdate() || launchedAfterUpdate;
  initializeDesktopUpdates();
  const url = backendUrl() || (process.env.ELECTRON_START_URL ? "http://localhost:4000" : null);
  if (url) createWindow(url, process.env.ELECTRON_START_URL || null);
  else showSetupWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && backendUrl()) {
      createWindow(backendUrl(), process.env.ELECTRON_START_URL || null);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
