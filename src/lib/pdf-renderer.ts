import serverlessChromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import type { AuditReportPayload } from "@/lib/audit/types";
import { getPdfRendererStatus } from "@/lib/pdf-renderer-status";
import { renderReportHtml } from "@/lib/reports";

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);
}

export async function renderReportPdf(report: AuditReportPayload): Promise<Buffer> {
  const serverless = isServerlessRuntime();
  const status = getPdfRendererStatus();
  if (!status.available) {
    throw new Error(status.message);
  }

  const browser = await playwrightChromium.launch({
    headless: true,
    executablePath: serverless
      ? await serverlessChromium.executablePath()
      : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() ||
        playwrightChromium.executablePath(),
    args: serverless ? serverlessChromium.args : undefined,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderReportHtml(report), { waitUntil: "networkidle" });
    const buffer = await page.pdf({
      printBackground: true,
      format: "A4",
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
