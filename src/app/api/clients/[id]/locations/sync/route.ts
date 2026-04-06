import { NextResponse } from "next/server";
import { syncLocationsForClient } from "@/lib/audit-engine";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const locations = await syncLocationsForClient(id);
    return NextResponse.json({ locations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync locations." },
      { status: 400 },
    );
  }
}
