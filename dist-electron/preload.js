"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  openFileDialog: () => electron.ipcRenderer.invoke("dialog:openFile"),
  saveFileDialog: () => electron.ipcRenderer.invoke("dialog:saveFile"),
  getVideoMetadata: (filePath) => electron.ipcRenderer.invoke("video:getMetadata", filePath),
  generateThumbnails: (filePath, count) => electron.ipcRenderer.invoke("video:generateThumbnails", filePath, count),
  exportVideo: (config) => electron.ipcRenderer.invoke("video:export", config),
  onExportProgress: (callback) => {
    electron.ipcRenderer.on("export:progress", (_, progress) => callback(progress));
  },
  cancelExport: () => electron.ipcRenderer.send("export:cancel")
});
