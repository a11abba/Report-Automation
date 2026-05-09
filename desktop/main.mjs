import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import process from "node:process";

const defaultUrl = process.env.AUDIT_DESKTOP_URL ?? "http://localhost:3000";
const allowedOrigins = new Set(
  (process.env.AUDIT_DESKTOP_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function normalizeHttpUrl(input) {
  const parsed = new URL(input);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  return parsed;
}

function assertAllowedDesktopUrl(input) {
  const parsed = normalizeHttpUrl(input);
  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error(`Desktop shell cannot load untrusted origin: ${parsed.origin}`);
  }
  return parsed;
}

const desktopStartUrl = assertAllowedDesktopUrl(defaultUrl).toString();

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f4f1ea",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "desktop", "preload.mjs"),
      sandbox: true,
    },
  });

  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (new URL(navigationUrl).origin !== new URL(desktopStartUrl).origin) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = normalizeHttpUrl(url);
      void shell.openExternal(parsed.toString());
    } catch {
      // Ignore unsafe URLs from the renderer.
    }
    return { action: "deny" };
  });

  void window.loadURL(desktopStartUrl);
}

app.whenReady().then(() => {
  ipcMain.handle("desktop:get-runtime-info", async () => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    startUrl: desktopStartUrl,
  }));

  ipcMain.handle("desktop:open-external", async (_event, url) => {
    if (typeof url === "string" && url.length > 0) {
      const parsed = normalizeHttpUrl(url);
      await shell.openExternal(parsed.toString());
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
