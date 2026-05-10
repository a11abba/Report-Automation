import { NextResponse } from "next/server";
import { z } from "zod";
import { beginMicrosoftOAuth } from "@/lib/audit-engine";
import { getAuthSession } from "@/lib/auth-session-server";

const schema = z.object({
  platformKey: z.enum([
    "microsoft_ads",
    "microsoft_merchant_center",
  ]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const { id } = await context.params;
    const result = await beginMicrosoftOAuth(id, body.platformKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start OAuth." },
      { status: 400 },
    );
  }
}
