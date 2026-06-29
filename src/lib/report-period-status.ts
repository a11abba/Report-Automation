import type { ReportPeriodStatus } from "@/lib/audit/types";

export function canExportMonthlyReport(status: ReportPeriodStatus) {
  return status === "completed";
}
