import { NextResponse } from "next/server";
import { syncLocationsForClient } from "@/lib/audit-engine";
import { getAuthSession } from "@/lib/auth-session-server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
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
