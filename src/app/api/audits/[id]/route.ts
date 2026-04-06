import { NextResponse } from "next/server";
import { getAuditDetail } from "@/lib/audit-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = await getAuditDetail(id);
  if (!detail.audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
