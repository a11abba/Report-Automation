import type { AuditReportPayload } from "@/lib/audit/types";
import { renderReportPdf } from "@/lib/pdf-renderer";
import { getPdfRendererStatus } from "@/lib/pdf-renderer-status";
import { renderReportHtml } from "@/lib/reports";

export function getReportRendererDiagnostics() {
  return getPdfRendererStatus();
}

export function buildReportHtmlArtifact(report: AuditReportPayload) {
  return renderReportHtml(report);
}

export async function buildReportPdfArtifact(report: AuditReportPayload) {
  return renderReportPdf(report);
}
