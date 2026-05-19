import { NextResponse } from "next/server";
import { z } from "zod";
import {
  attachReportMemoryRecordToClient,
  listReportMemoriesForClient,
} from "@/lib/audit-engine";
import { loadClientForViewer, loadReportMemoryForViewer, requireRouteViewer } from "@/lib/route-auth";

const attachReportMemorySchema = z.object({
  reportMemoryId: z.string().min(1),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: clientResponse } = await loadClientForViewer(viewer, id);
  if (clientResponse) return clientResponse;
  const reportMemories = await listReportMemoriesForClient(id);
  return NextResponse.json({ reportMemories });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { client, response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse || !client) return clientResponse;
    const body = attachReportMemorySchema.parse(await request.json());
    const { response: reportMemoryResponse } = await loadReportMemoryForViewer(
      viewer,
      body.reportMemoryId,
    );
    if (reportMemoryResponse) return reportMemoryResponse;
    const link = await attachReportMemoryRecordToClient(id, body.reportMemoryId);
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
