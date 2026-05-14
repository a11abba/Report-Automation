import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addContextEntryRecord,
  getReportPeriodDetail,
} from "@/lib/audit-engine";
import { loadReportPeriodForViewer, requireRouteViewer } from "@/lib/route-auth";

const createContextEntrySchema = z.object({
  channel: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  campaignReference: z.string().nullable().optional(),
  entryType: z.enum([
    "note",
    "budget_change",
    "campaign_change",
    "landing_page",
    "tracking_issue",
    "sales_issue",
    "seo_change",
    "other",
  ]),
  text: z.string().min(6),
  tags: z.array(z.string()).optional().default([]),
  effectiveStartDate: z.string().nullable().optional(),
  effectiveEndDate: z.string().nullable().optional(),
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
  return NextResponse.json({ contextEntries: detail.contextEntries });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id } = await context.params;
    const { response: reportPeriodResponse } = await loadReportPeriodForViewer(viewer, id);
    if (reportPeriodResponse) return reportPeriodResponse;
    const body = createContextEntrySchema.parse(await request.json());
    const contextEntry = await addContextEntryRecord(
      id,
      {
        ...body,
        channel: body.channel ?? null,
        source: body.source ?? null,
        campaignReference: body.campaignReference ?? null,
        effectiveStartDate: body.effectiveStartDate ?? null,
        effectiveEndDate: body.effectiveEndDate ?? null,
      },
      viewer,
    );
    return NextResponse.json({ contextEntry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
