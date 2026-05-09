import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session-server";
import { platformCatalog } from "@/lib/connectors";

export async function GET() {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ platforms: platformCatalog });
}
