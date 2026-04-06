import { NextResponse } from "next/server";
import { z } from "zod";
import { beginGoogleOAuth } from "@/lib/audit-engine";

const schema = z.object({
  platformKey: z.enum([
    "google_search_console",
    "google_business_profile",
    "google_analytics",
  ]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = schema.parse(await request.json());
    const { id } = await context.params;
    const result = await beginGoogleOAuth(id, body.platformKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start OAuth." },
      { status: 400 },
    );
  }
}
