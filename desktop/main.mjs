import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import process from "node:process";

const defaultUrl = process.env.AUDIT_DESKTOP_URL ?? "http://localhost:3000";

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: path.join(app.getAppPath(), "desktop", "preload.mjs"),
    },
  });

  void window.loadURL(defaultUrl);
}

app.whenReady().then(() => {
  ipcMain.handle("desktop:get-runtime-info", async () => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    startUrl: defaultUrl,
  }));

  ipcMain.handle("desktop:open-external", async (_event, url) => {
    if (typeof url === "string" && url.length > 0) {
      await shell.openExternal(url);
    }
    return { ok: true };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
