import { NextResponse } from "next/server";
import { syncLocationsForClient } from "@/lib/audit-engine";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  try {
    const { id } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;
    const locations = await syncLocationsForClient(id);
    return NextResponse.json({ locations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync locations." },
      { status: 400 },
    );
  }
}
