import { renderReportPdf } from "@/lib/pdf-renderer";
import { getAuditDetail } from "@/lib/audit-engine";
import { loadAuditForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer } = await requireRouteViewer();
  if (!viewer) {
    return new Response("Authentication required.", { status: 401 });
  }
  try {
    const { id } = await context.params;
    const { response: auditResponse } = await loadAuditForViewer(viewer, id);
    if (auditResponse) {
      return new Response("Forbidden.", { status: auditResponse.status });
    }
    const { report } = await getAuditDetail(id);
    if (!report) {
      return new Response("Report not found.", { status: 404 });
    }

    const pdf = await renderReportPdf(report);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="audit-${id}.pdf"`,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "PDF export unavailable.",
      { status: 503 },
    );
  }
}
