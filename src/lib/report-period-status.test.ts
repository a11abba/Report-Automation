import { describe, expect, it } from "vitest";
import { canExportMonthlyReport } from "./report-period-status";

describe("monthly report export visibility", () => {
  it("shows JSON and PDF only for completed reports", () => {
    expect(canExportMonthlyReport("completed")).toBe(true);
    expect(canExportMonthlyReport("draft")).toBe(false);
    expect(canExportMonthlyReport("queued")).toBe(false);
    expect(canExportMonthlyReport("running")).toBe(false);
    expect(canExportMonthlyReport("failed")).toBe(false);
    expect(canExportMonthlyReport("canceled")).toBe(false);
  });
});
