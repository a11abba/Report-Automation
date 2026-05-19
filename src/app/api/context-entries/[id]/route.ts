import { NextResponse } from "next/server";
import { deleteContextEntryRecord } from "@/lib/audit-engine";
import { loadContextEntryForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { contextEntry, response: contextEntryResponse } = await loadContextEntryForViewer(
      viewer,
      id,
    );
    if (contextEntryResponse || !contextEntry) {
      return contextEntryResponse ?? NextResponse.json({ error: "Context entry not found." }, { status: 404 });
    }

    const deleted = await deleteContextEntryRecord(id);
    if (!deleted) {
      return NextResponse.json({ error: "Context entry not found." }, { status: 404 });
    }

    return NextResponse.json({ contextEntry: deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
