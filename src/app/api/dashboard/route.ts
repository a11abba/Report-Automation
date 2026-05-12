import { NextResponse } from "next/server";
import { listDashboardData } from "@/lib/audit-engine";
import { getAuthSession } from "@/lib/auth-session-server";

export async function GET() {
  const viewer = await getAuthSession();
  if (!viewer) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const data = await listDashboardData(viewer);
  return NextResponse.json(data);
}
