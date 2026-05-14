import type { ReportPeriodManualInputs } from "@/lib/audit/types";

export function emptyReportPeriodManualInputs(): ReportPeriodManualInputs {
  return {
    leads: null,
    qualifiedLeads: null,
    sales: null,
    revenue: null,
    notes: null,
  };
}

export function isMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

export function deriveMonthRange(periodKey: string) {
  if (!isMonthKey(periodKey)) {
    throw new Error("Period key must use YYYY-MM format.");
  }
  const [yearRaw, monthRaw] = periodKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Period key must use a valid YYYY-MM month.");
  }
  const start = `${yearRaw}-${monthRaw}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = `${yearRaw}-${monthRaw}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

export function splitTags(input: string) {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
