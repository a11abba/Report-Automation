import { NextResponse } from "next/server";
import { getAuditDetail } from "@/lib/audit-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { report } = await getAuditDetail(id);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json(report);
}
