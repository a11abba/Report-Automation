import { NextResponse } from "next/server";
import {
  cancelAudit,
  deleteCanceledAudit,
  getAuditDetail,
  runAudit,
} from "@/lib/audit-engine";
import { loadAuditForViewer, requireRouteViewer } from "@/lib/route-auth";

export const maxDuration = 300;

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
    const { audit, response: auditResponse } = await loadAuditForViewer(viewer, id);
    if (auditResponse || !audit) return auditResponse;
    if (audit.status === "queued") {
      const canceled = await cancelAudit(id);
      return NextResponse.json({ audit: canceled, action: "canceled" });
    }
    if (audit.status === "canceled") {
      const deleted = await deleteCanceledAudit(id);
      return NextResponse.json({ audit: deleted, action: "deleted" });
    }
    throw new Error("Only queued or canceled reports can be removed.");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove report." },
      { status: 409 },
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { audit, response: auditResponse } = await loadAuditForViewer(viewer, id);
    if (auditResponse || !audit) return auditResponse;
    if (audit.status !== "queued") {
      throw new Error("Only queued reports can be processed manually.");
    }
    await runAudit(id);
    const detail = await getAuditDetail(id);
    return NextResponse.json({ audit: detail.audit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process report." },
      { status: 409 },
    );
  }
}
