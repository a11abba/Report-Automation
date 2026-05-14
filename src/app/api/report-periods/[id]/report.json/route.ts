import { NextResponse } from "next/server";
import { getReportPeriodDetail } from "@/lib/audit-engine";
import { loadReportPeriodForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
  if (reportPeriodResponse) return reportPeriodResponse;
  const detail = await getReportPeriodDetail(id);
  if (!detail.report) {
    return NextResponse.json({ error: "Report not generated yet." }, { status: 404 });
  }
  return NextResponse.json(detail.report);
}
