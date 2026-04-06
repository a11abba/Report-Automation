import { renderReportPdf } from "@/lib/reports";
import { getAuditDetail } from "@/lib/audit-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
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
