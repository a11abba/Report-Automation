import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureReportPeriodForMonth,
  getReportPeriodDetail,
  listReportPeriodsForClient,
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
  baselinePeriodKey: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
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
    let baselinePeriodId = body.baselinePeriodId;
    if (body.baselinePeriodKey !== undefined) {
      if (body.baselinePeriodKey === null || body.baselinePeriodKey.trim().length === 0) {
        baselinePeriodId = null;
      } else {
        if (body.baselinePeriodKey === reportPeriod.periodKey) {
          throw new Error("Comparison month must be different from the report month.");
        }
        const existing = (await listReportPeriodsForClient(reportPeriod.clientId)).find(
          (item) => item.periodKey === body.baselinePeriodKey,
        );
        baselinePeriodId =
          existing?.id ?? (await ensureReportPeriodForMonth(reportPeriod.clientId, body.baselinePeriodKey)).id;
      }
    }
    const updated = await updateReportPeriodRecord(id, {
      baselinePeriodId,
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
