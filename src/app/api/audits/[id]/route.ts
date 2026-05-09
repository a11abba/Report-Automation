import { NextResponse } from "next/server";
import { getAuditDetail } from "@/lib/audit-engine";
import { getAuthSession } from "@/lib/auth-session-server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { id } = await context.params;
  const detail = await getAuditDetail(id);
  if (!detail.audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
