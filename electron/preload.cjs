const { contextBridge, ipcRenderer } = require("electron");
const backendUrl = process.argv.find((arg) => arg.startsWith("--echo-backend-url="))?.slice("--echo-backend-url=".length) || "";

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
  saveBackendUrl(value) {
    return ipcRenderer.invoke("echo:save-backend-url", value);
  },
});
