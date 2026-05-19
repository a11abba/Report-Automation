import { NextResponse } from "next/server";
import { deleteReportMemoryRecord } from "@/lib/audit-engine";
import { loadReportMemoryForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { reportMemory, response: reportMemoryResponse } = await loadReportMemoryForViewer(
      viewer,
      id,
    );
    if (reportMemoryResponse || !reportMemory) {
      return (
        reportMemoryResponse ??
        NextResponse.json({ error: "Report memory not found." }, { status: 404 })
      );
    }

    const deleted = await deleteReportMemoryRecord(id);
    if (!deleted) {
      return NextResponse.json({ error: "Report memory not found." }, { status: 404 });
    }
    return NextResponse.json({ reportMemory: deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
