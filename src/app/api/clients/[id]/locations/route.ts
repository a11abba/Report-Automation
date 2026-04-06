import { NextResponse } from "next/server";
import { listLocationsForClient } from "@/lib/audit-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const locations = await listLocationsForClient(id);
  return NextResponse.json({ locations });
}
