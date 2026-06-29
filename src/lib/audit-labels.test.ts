import { describe, expect, it } from "vitest";
import { getAuditDisplayMetadata } from "@/lib/audit-labels";

describe("getAuditDisplayMetadata", () => {
  it("identifies monthly reports with their period and data sources", () => {
    expect(
      getAuditDisplayMetadata(
        {
          integrationIds: ["ga4", "ads"],
          scope: { reportPeriodId: "period_1", periodKey: "2026-06" },
        },
        [
          { id: "ga4", displayName: "Google Analytics" },
          { id: "ads", displayName: "Google Ads" },
        ],
      ),
    ).toEqual({
      typeLabel: "Monthly report",
      title: "June 2026 performance report",
      sourceSummary: "Sources: Google Analytics · Google Ads",
    });
  });

  it("gives legacy diagnostic reports a useful fallback label", () => {
    expect(getAuditDisplayMetadata({ integrationIds: [], scope: null }, [])).toEqual({
      typeLabel: "Diagnostic audit",
      title: "Live diagnostic report",
      sourceSummary: "Client-wide scope",
    });
  });
});
