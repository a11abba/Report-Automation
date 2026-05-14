import { describe, expect, it } from "vitest";
import {
  getPreviousMonthKey,
  normalizeMonthlyReportDay,
  resolveScheduledMonthlyPeriod,
} from "./report-scheduler-utils";

describe("report scheduler utils", () => {
  it("returns null before the trigger day", () => {
    expect(resolveScheduledMonthlyPeriod(new Date("2026-05-02T12:00:00Z"), 3)).toBeNull();
  });

  it("returns the previous month once the trigger day is reached", () => {
    expect(resolveScheduledMonthlyPeriod(new Date("2026-05-03T12:00:00Z"), 3)).toEqual({
      periodKey: "2026-04",
      triggerDay: 3,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      baselinePeriodKey: "2026-03",
    });
  });

  it("clamps longer trigger days to the current month's last day", () => {
    const due = resolveScheduledMonthlyPeriod(new Date("2026-02-28T12:00:00Z"), 31);
    expect(due?.triggerDay).toBe(28);
    expect(due?.periodKey).toBe("2026-01");
  });

  it("normalizes day values and previous keys safely", () => {
    expect(normalizeMonthlyReportDay(0)).toBe(1);
    expect(normalizeMonthlyReportDay(99)).toBe(31);
    expect(normalizeMonthlyReportDay(null)).toBeNull();
    expect(getPreviousMonthKey("2026-01")).toBe("2025-12");
    expect(getPreviousMonthKey("bad-key")).toBeNull();
  });
});
