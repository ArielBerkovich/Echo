const { contextBridge, ipcRenderer } = require("electron");
const backendUrl = process.argv.find((arg) => arg.startsWith("--echo-backend-url="))?.slice("--echo-backend-url=".length) || "";
const appVersion = process.argv.find((arg) => arg.startsWith("--echo-app-version="))?.slice("--echo-app-version=".length) || "";
const wasUpdated = process.argv.includes("--echo-was-updated=true");

contextBridge.exposeInMainWorld("echoDesktopNotifications", {
  showNotification(options) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    ipcRenderer.send("echo:show-notification", { ...options, id });
    return id;
  },
  onNotificationClick(handler) {
    const listener = (_event, id) => handler(id);
    ipcRenderer.on("echo:notification-click", listener);
    return () => ipcRenderer.removeListener("echo:notification-click", listener);
  },
});

contextBridge.exposeInMainWorld("echoDesktopConfig", {
  backendUrl,
  appVersion,
  wasUpdated,
  saveBackendUrl(value) {
    return ipcRenderer.invoke("echo:save-backend-url", value);
  },
  changeBackendUrl(value) {
    return ipcRenderer.invoke("echo:change-backend-url", value);
  },
});
