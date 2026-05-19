import type { AuditReportPayload } from "@/lib/audit/types";
import { costPerConversion, inferObjectiveForReport } from "./report-objective";
import { localizeReportLabel } from "./report-i18n";

export interface ReportHeadlineMetric {
  key: string;
  label: string;
  value: number | null;
  digits?: number;
}

export function getMeaningfulPaidCampaigns(report: AuditReportPayload) {
  return (report.snapshot.paidMedia?.topCampaigns ?? []).filter(
    (campaign) => campaign.spend > 0 || campaign.clicks > 0 || campaign.purchases > 0,
  );
}

export function deriveHeadlineMetrics(report: AuditReportPayload): ReportHeadlineMetric[] {
  const labels = localizeReportLabel(report.locale);
  const manualInputs = report.reportPeriod.manualInputs;
  const objective = inferObjectiveForReport(report);
  const metrics: ReportHeadlineMetric[] = [];

  if (report.snapshot.trafficAttribution?.sessions != null) {
    metrics.push({
      key: "sessions",
      label: labels.sessions,
      value: report.snapshot.trafficAttribution.sessions,
    });
  }

  if (report.snapshot.paidMedia?.clicks != null) {
    metrics.push({
      key: "clicks",
      label: labels.clicks,
      value: report.snapshot.paidMedia.clicks,
    });
  }

  if (report.snapshot.paidMedia?.purchases != null) {
    metrics.push({
      key: "conversions",
      label: objective.kind === "lead_generation" ? objective.primaryConversionLabel : labels.purchases,
      value: report.snapshot.paidMedia.purchases,
      digits: report.snapshot.paidMedia.purchases % 1 === 0 ? 0 : 2,
    });
  }

  if (report.snapshot.paidMedia?.spend != null) {
    metrics.push({
      key: "spend",
      label: labels.spend,
      value: report.snapshot.paidMedia.spend,
      digits: 2,
    });
  }

  if (objective.kind === "lead_generation") {
    metrics.push({
      key: "cpl",
      label: labels.costPerLead,
      value: costPerConversion(report.snapshot.paidMedia),
      digits: 2,
    });
  } else if (report.snapshot.paidMedia?.roas != null) {
    metrics.push({
      key: "roas",
      label: labels.roas,
      value: report.snapshot.paidMedia.roas,
      digits: 2,
    });
  }

  if (manualInputs?.leads != null) {
    metrics.push({
      key: "manual-leads",
      label: "Leads",
      value: manualInputs.leads,
    });
  }

  if (manualInputs?.sales != null) {
    metrics.push({
      key: "manual-sales",
      label: "Sales",
      value: manualInputs.sales,
    });
  }

  if (manualInputs?.revenue != null) {
    metrics.push({
      key: "manual-revenue",
      label: labels.revenue,
      value: manualInputs.revenue,
      digits: 2,
    });
  }

  if (metrics.length < 4) {
    metrics.push({
      key: "locations",
      label: labels.locations,
      value: report.summary.locationCount,
    });
  }

  return metrics.slice(0, 6);
}
