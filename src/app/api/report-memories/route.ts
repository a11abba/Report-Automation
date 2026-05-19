import { NextResponse } from "next/server";
import { z } from "zod";
import { createReportMemoryRecord, listReportMemoriesForAccount } from "@/lib/audit-engine";
import { canManagePlatform } from "@/lib/auth-access";
import { requireRouteViewer } from "@/lib/route-auth";

const createReportMemorySchema = z.object({
  accountId: z.string().optional(),
  title: z.string().min(3),
  sourceClientName: z.string().min(2).nullable().optional(),
  periodLabel: z.string().min(2).nullable().optional(),
  notes: z.string().min(2).nullable().optional(),
  content: z.string().min(40),
});

export async function GET() {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const reportMemories = await listReportMemoriesForAccount(
    viewer.role === "platform_admin" ? undefined : viewer.accountId,
  );
  return NextResponse.json({ reportMemories });
}

export async function POST(request: Request) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const body = createReportMemorySchema.parse(await request.json());
    const accountId =
      canManagePlatform(viewer) && body.accountId ? body.accountId : viewer.accountId;
    const reportMemory = await createReportMemoryRecord(accountId, {
      title: body.title,
      sourceClientName: body.sourceClientName ?? null,
      periodLabel: body.periodLabel ?? null,
      notes: body.notes ?? null,
      content: body.content,
    });
    return NextResponse.json({ reportMemory }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
