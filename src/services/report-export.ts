import type { AuditReportPayload } from "@/lib/audit/types";
import { getPdfRendererStatus, renderReportHtml, renderReportPdf } from "@/lib/reports";

export function getReportRendererDiagnostics() {
  return getPdfRendererStatus();
}

export function buildReportHtmlArtifact(report: AuditReportPayload) {
  return renderReportHtml(report);
}

export async function buildReportPdfArtifact(report: AuditReportPayload) {
  return renderReportPdf(report);
}
