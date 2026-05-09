import { NextResponse } from "next/server";
import { listDashboardData } from "@/lib/audit-engine";
import { getAuthSession } from "@/lib/auth-session-server";

export async function GET() {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const data = await listDashboardData();
  return NextResponse.json(data);
}
