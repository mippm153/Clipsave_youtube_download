const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("downloader", {
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  fetchPreview: (request) => ipcRenderer.invoke("preview:fetch", request),
  addToQueue: (request) => ipcRenderer.invoke("queue:add", request),
  startQueue: () => ipcRenderer.invoke("queue:start"),
  stopQueue: () => ipcRenderer.invoke("queue:stop"),
  listQueue: () => ipcRenderer.invoke("queue:list"),
  listHistory: () => ipcRenderer.invoke("history:list"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  openDownloads: () => ipcRenderer.invoke("folder:open-downloads"),
  openPath: (targetPath) => ipcRenderer.invoke("folder:open-path", targetPath),
  onQueueUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("queue:update", listener);
    return () => ipcRenderer.removeListener("queue:update", listener);
  }
});
