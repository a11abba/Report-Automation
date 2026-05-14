import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createReportPeriodRecord,
  listReportPeriodsForClient,
} from "@/lib/audit-engine";
import { deriveMonthRange } from "@/lib/report-period-utils";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

const createReportPeriodSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/),
  baselinePeriodId: z.string().nullable().optional(),
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
  const reportPeriods = await listReportPeriodsForClient(id);
  return NextResponse.json({ reportPeriods });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;
    const body = createReportPeriodSchema.parse(await request.json());
    const range = deriveMonthRange(body.periodKey);
    const reportPeriod = await createReportPeriodRecord(id, {
      periodKey: body.periodKey,
      periodStart: range.start,
      periodEnd: range.end,
      baselinePeriodId: body.baselinePeriodId ?? null,
    });
    return NextResponse.json({ reportPeriod }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
