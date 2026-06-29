import { accessSync, constants, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function getPlaywrightCacheDir() {
  const configuredPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (configuredPath && configuredPath !== "0") {
    return path.resolve(configuredPath);
  }

  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ms-playwright");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  }
  return path.join(os.homedir(), ".cache", "ms-playwright");
}

function hasLocalChromium() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (explicitPath) {
    try {
      accessSync(explicitPath, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  try {
    return readdirSync(getPlaywrightCacheDir(), { withFileTypes: true }).some(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.startsWith("chromium-") ||
          entry.name.startsWith("chromium_headless_shell-")),
    );
  } catch {
    return false;
  }
}

export function getPdfRendererStatus() {
  if (process.env.VERCEL) {
    return {
      available: true,
      message: "Serverless Chromium is ready.",
    };
  }

  if (hasLocalChromium()) {
    return {
      available: true,
      message: "Playwright Chromium is ready.",
    };
  }

  return {
    available: false,
    message:
      "Playwright Chromium is missing. Run `npx playwright install chromium` to enable PDF export locally.",
  };
}
