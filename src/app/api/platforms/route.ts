import { NextResponse } from "next/server";
import { platformCatalog } from "@/lib/connectors";

export async function GET() {
  return NextResponse.json({ platforms: platformCatalog });
}
