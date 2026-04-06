import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopRuntime", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
});
