import { NextResponse } from "next/server";
import { cancelAudit, getAuditDetail } from "@/lib/audit-engine";
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
  const detail = await getAuditDetail(id);
  if (!detail.audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { response: auditResponse } = await loadAuditForViewer(viewer, id);
    if (auditResponse) return auditResponse;
    const audit = await cancelAudit(id);
    return NextResponse.json({ audit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to cancel report." },
      { status: 409 },
    );
  }
}
