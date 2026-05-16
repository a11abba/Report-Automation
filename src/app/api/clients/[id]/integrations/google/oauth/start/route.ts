import { NextResponse } from "next/server";
import { z } from "zod";
import { beginGoogleOAuth } from "@/lib/audit-engine";
import { resolveRequestOrigin } from "@/lib/oauth-redirect";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

const schema = z.object({
  platformKey: z.enum([
    "google_search_console",
    "google_business_profile",
    "google_analytics",
    "google_ads",
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
    const result = await beginGoogleOAuth(
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
