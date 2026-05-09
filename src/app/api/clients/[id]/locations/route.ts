import { NextResponse } from "next/server";
import { listLocationsForClient } from "@/lib/audit-engine";
import { getAuthSession } from "@/lib/auth-session-server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { id } = await context.params;
  const locations = await listLocationsForClient(id);
  return NextResponse.json({ locations });
}
