import { NextResponse } from "next/server";
import { getAuditDetail } from "@/lib/audit-engine";
import { loadAuditForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: auditResponse } = await loadAuditForViewer(viewer, id);
  if (auditResponse) return auditResponse;
  const { report } = await getAuditDetail(id);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json(report);
}
