import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getReportPeriodDetail,
  updateReportPeriodRecord,
} from "@/lib/audit-engine";
import { loadReportPeriodForViewer, requireRouteViewer } from "@/lib/route-auth";

const manualInputsSchema = z.object({
  leads: z.number().nullable().optional(),
  qualifiedLeads: z.number().nullable().optional(),
  sales: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const updateReportPeriodSchema = z.object({
  baselinePeriodId: z.string().nullable().optional(),
  manualInputs: manualInputsSchema.optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
  if (reportPeriodResponse) return reportPeriodResponse;
  const detail = await getReportPeriodDetail(id);
  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { reportPeriod, response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
    if (reportPeriodResponse || !reportPeriod) return reportPeriodResponse;
    const body = updateReportPeriodSchema.parse(await request.json());
    const updated = await updateReportPeriodRecord(id, {
      baselinePeriodId: body.baselinePeriodId,
      manualInputs: body.manualInputs
        ? {
            ...reportPeriod.manualInputs,
            ...body.manualInputs,
          }
        : undefined,
    });
    return NextResponse.json({ reportPeriod: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
