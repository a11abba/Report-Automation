import { NextResponse } from "next/server";
import { detachReportMemoryRecordFromClient } from "@/lib/audit-engine";
import { loadClientForViewer, loadReportMemoryForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; memoryId: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id, memoryId } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;
    const { response: reportMemoryResponse } = await loadReportMemoryForViewer(
      viewer,
      memoryId,
    );
    if (reportMemoryResponse) return reportMemoryResponse;
    await detachReportMemoryRecordFromClient(id, memoryId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
