import { NextResponse } from "next/server";
import { listLocationsForClient } from "@/lib/audit-engine";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: clientResponse } = await loadClientForViewer(viewer, id);
  if (clientResponse) return clientResponse;
  const locations = await listLocationsForClient(id);
  return NextResponse.json({ locations });
}
