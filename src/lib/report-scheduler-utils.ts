import { deriveMonthRange, isMonthKey } from "./report-period-utils";

function formatMonthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function normalizeMonthlyReportDay(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.trunc(value);
  if (rounded < 1) return 1;
  if (rounded > 31) return 31;
  return rounded;
}

export function getPreviousMonthKey(periodKey: string) {
  if (!isMonthKey(periodKey)) {
    return null;
  }

  const [yearPart, monthPart] = periodKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  return formatMonthKey(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth());
}

export function resolveScheduledMonthlyPeriod(
  now: Date,
  dayOfMonth: number | null | undefined,
) {
  const normalizedDay = normalizeMonthlyReportDay(dayOfMonth);
  if (!normalizedDay) {
    return null;
  }

  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const today = now.getUTCDate();
  const daysInCurrentMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const triggerDay = Math.min(normalizedDay, daysInCurrentMonth);

  if (today < triggerDay) {
    return null;
  }

  const previousMonth = new Date(Date.UTC(year, monthIndex - 1, 1));
  const periodKey = formatMonthKey(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth());
  const range = deriveMonthRange(periodKey);
  if (!range) {
    return null;
  }

  return {
    periodKey,
    triggerDay,
    periodStart: range.start,
    periodEnd: range.end,
    baselinePeriodKey: getPreviousMonthKey(periodKey),
  };
}
