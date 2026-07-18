const { app, BrowserWindow, Menu, Notification, ipcMain, session } = require("electron");
const path = require("node:path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#242933",
    title: "Echo",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_START_URL) mainWindow.loadURL(process.env.ELECTRON_START_URL);
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.setName("Echo");
  app.setAppUserModelId("com.echo.desktop");
  // Echo provides its own in-app controls; do not show Electron's generic
  // File/Edit/View/Window menu bar.
  Menu.setApplicationMenu(null);
  // The remote Echo URL is entered in the UI; allow its API and Socket.IO
  // requests while retaining Electron's normal isolated renderer security.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "notifications");
  });
  ipcMain.handle("echo:notify", (_event, { title, body }) => {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({ title, body });
    notification.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    notification.show();
    return true;
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
