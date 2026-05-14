import { NextResponse } from "next/server";
import { z } from "zod";
import { updateReportPeriodRecord } from "@/lib/audit-engine";
import { parseBusinessMetricsImport } from "@/lib/business-metrics-import";
import { loadReportPeriodForViewer, requireRouteViewer } from "@/lib/route-auth";

const importSchema = z.object({
  sourceType: z.enum(["paste", "sheet_url"]),
  payload: z.string().optional().default(""),
  sheetUrl: z.string().optional().default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { reportPeriod, response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
    if (reportPeriodResponse || !reportPeriod) return reportPeriodResponse;

    const body = importSchema.parse(await request.json());
    const parsedImport = await parseBusinessMetricsImport({
      reportPeriodKey: reportPeriod.periodKey,
      sourceType: body.sourceType,
      payload: body.payload,
      sheetUrl: body.sheetUrl,
    });

    const manualInputs = {
      ...reportPeriod.manualInputs,
      ...(parsedImport.manualInputs.leads != null ? { leads: parsedImport.manualInputs.leads } : {}),
      ...(parsedImport.manualInputs.qualifiedLeads != null
        ? { qualifiedLeads: parsedImport.manualInputs.qualifiedLeads }
        : {}),
      ...(parsedImport.manualInputs.sales != null ? { sales: parsedImport.manualInputs.sales } : {}),
      ...(parsedImport.manualInputs.revenue != null
        ? { revenue: parsedImport.manualInputs.revenue }
        : {}),
      ...(parsedImport.manualInputs.notes != null ? { notes: parsedImport.manualInputs.notes } : {}),
    };

    const updated = await updateReportPeriodRecord(id, { manualInputs });
    return NextResponse.json({
      reportPeriod: updated,
      importSummary: {
        matchedPeriodKey: parsedImport.matchedPeriodKey,
        sourceLabel: parsedImport.sourceLabel,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid import request." },
      { status: 400 },
    );
  }
}
