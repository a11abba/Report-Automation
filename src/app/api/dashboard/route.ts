import { NextResponse } from "next/server";
import { listDashboardData } from "@/lib/audit-engine";

export async function GET() {
  const data = await listDashboardData();
  return NextResponse.json(data);
}
