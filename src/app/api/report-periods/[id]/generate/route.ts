import { NextResponse } from "next/server";
import { generateReportPeriod } from "@/lib/audit-engine";
import { loadReportPeriodForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
    if (reportPeriodResponse) return reportPeriodResponse;
    const result = await generateReportPeriod(id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate monthly report." },
      { status: 400 },
    );
  }
}
