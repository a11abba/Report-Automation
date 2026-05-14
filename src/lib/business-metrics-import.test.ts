import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBusinessMetricsImport } from "./business-metrics-import";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("business metrics import", () => {
  it("matches the current report period from pasted CSV data", async () => {
    const result = await parseBusinessMetricsImport({
      reportPeriodKey: "2026-04",
      sourceType: "paste",
      payload: [
        "periodKey,leads,qualifiedLeads,sales,revenue,notes",
        "2026-03,42,16,8,12000,March baseline",
        "2026-04,64,23,11,18500,April promo month",
      ].join("\n"),
    });

    expect(result.matchedPeriodKey).toBe("2026-04");
    expect(result.manualInputs.leads).toBe(64);
    expect(result.manualInputs.qualifiedLeads).toBe(23);
    expect(result.manualInputs.sales).toBe(11);
    expect(result.manualInputs.revenue).toBe(18500);
    expect(result.manualInputs.notes).toBe("April promo month");
  });

  it("accepts a single-row TSV import without a period column", async () => {
    const result = await parseBusinessMetricsImport({
      reportPeriodKey: "2026-04",
      sourceType: "paste",
      payload: [
        "leads\tqualifiedLeads\tsales\trevenue\tnotes",
        "35\t12\t4\tR$ 14.250,50\tImported from ops sheet",
      ].join("\n"),
    });

    expect(result.matchedPeriodKey).toBeNull();
    expect(result.manualInputs.leads).toBe(35);
    expect(result.manualInputs.qualifiedLeads).toBe(12);
    expect(result.manualInputs.sales).toBe(4);
    expect(result.manualInputs.revenue).toBe(14250.5);
    expect(result.manualInputs.notes).toBe("Imported from ops sheet");
  });

  it("turns a Google Sheets share URL into a CSV export fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        ["periodKey,leads,revenue", "2026-04,18,4250"].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      ),
    );

    const result = await parseBusinessMetricsImport({
      reportPeriodKey: "2026-04",
      sourceType: "sheet_url",
      payload: "",
      sheetUrl: "https://docs.google.com/spreadsheets/d/sheet123/edit#gid=987654321",
    });

    expect(result.manualInputs.leads).toBe(18);
    expect(result.manualInputs.revenue).toBe(4250);
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/spreadsheets/d/sheet123/export");
    expect(requestUrl.searchParams.get("format")).toBe("csv");
    expect(requestUrl.searchParams.get("gid")).toBe("987654321");
  });
});
