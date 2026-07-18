const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  notify: (title, body, tag) => ipcRenderer.invoke("echo:notify", { title, body, tag }),
});
