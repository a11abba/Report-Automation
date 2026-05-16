import { NextResponse } from "next/server";
import { z } from "zod";
import { beginMicrosoftOAuth } from "@/lib/audit-engine";
import { resolveRequestOrigin } from "@/lib/oauth-redirect";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

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
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const body = schema.parse(await request.json());
    const { id } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;
    const result = await beginMicrosoftOAuth(
      id,
      body.platformKey,
      resolveRequestOrigin(request),
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start OAuth." },
      { status: 400 },
    );
  }
}
