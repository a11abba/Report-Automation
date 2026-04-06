import { NextResponse } from "next/server";
import { rulePackCatalog } from "@/lib/rules";

export async function GET() {
  return NextResponse.json({ rulePacks: rulePackCatalog });
}
