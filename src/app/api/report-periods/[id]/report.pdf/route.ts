import { renderReportPdf } from "@/lib/reports";
import { getReportPeriodDetail } from "@/lib/audit-engine";
import { loadReportPeriodForViewer, requireRouteViewer } from "@/lib/route-auth";

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
    const { response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
    if (reportPeriodResponse) {
      return new Response("Forbidden.", { status: reportPeriodResponse.status });
    }
    const detail = await getReportPeriodDetail(id);
    if (!detail.report) {
      return new Response("Report not generated yet.", { status: 404 });
    }

    const pdf = await renderReportPdf(detail.report);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="monthly-report-${id}.pdf"`,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "PDF export unavailable.",
      { status: 503 },
    );
  }
}
