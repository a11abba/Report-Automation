import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createReportFeedbackRecord,
  listReportFeedbackForAudit,
} from "@/lib/audit-engine";
import { reportFeedbackRatings } from "@/lib/audit/types";
import { loadAuditForViewer, requireRouteViewer } from "@/lib/route-auth";

const createReportFeedbackSchema = z.object({
  rating: z.enum(reportFeedbackRatings),
  notes: z.string().min(4),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: auditResponse } = await loadAuditForViewer(viewer, id);
  if (auditResponse) return auditResponse;
  const feedback = await listReportFeedbackForAudit(id);
  return NextResponse.json({ feedback });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { response: auditResponse } = await loadAuditForViewer(viewer, id);
    if (auditResponse) return auditResponse;
    const body = createReportFeedbackSchema.parse(await request.json());
    const feedback = await createReportFeedbackRecord(id, body);
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
