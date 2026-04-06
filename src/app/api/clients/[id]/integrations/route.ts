import { NextResponse } from "next/server";
import { z } from "zod";
import { createIntegrationRecord } from "@/lib/audit-engine";
import { platformCatalog } from "@/lib/connectors";

const integrationSchema = z.object({
  platformKey: z.enum([
    "klaviyo",
    "hubspot",
    "shopify",
    "google_search_console",
    "google_business_profile",
    "google_analytics",
    "pagespeed_insights",
    "website_crawler",
  ]),
  displayName: z.string().min(2),
  apiKey: z.string().optional().default(""),
  authOrigin: z
    .enum(["none", "api_key", "oauth", "service_account"])
    .optional()
    .default("none"),
  demoMode: z.boolean().optional(),
  targetUrl: z.string().nullable().optional(),
  propertyId: z.string().nullable().optional(),
  ga4PropertyId: z.string().nullable().optional(),
  businessAccountId: z.string().nullable().optional(),
  businessProfileId: z.string().nullable().optional(),
  serviceAccountEmail: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = integrationSchema.parse(await request.json());
    const platform = platformCatalog.find((item) => item.key === body.platformKey);
    if (!platform) {
      return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
    }

    const hasDirectCredential = body.apiKey.trim().length > 0;
    const resolvedDemoMode =
      body.demoMode ??
      (!hasDirectCredential && body.authOrigin !== "oauth" && body.authOrigin !== "service_account");

    const integration = await createIntegrationRecord(id, {
      platformKey: platform.key,
      platformType: platform.type,
      displayName: body.displayName,
      credentials: {
        apiKey: hasDirectCredential ? body.apiKey : undefined,
        authOrigin: body.authOrigin,
        serviceAccountEmail: body.serviceAccountEmail ?? undefined,
      },
      settings: {
        demoMode: resolvedDemoMode,
        targetUrl: body.targetUrl ?? undefined,
        propertyId: body.propertyId ?? undefined,
        ga4PropertyId: body.ga4PropertyId ?? undefined,
        businessAccountId: body.businessAccountId ?? undefined,
        businessProfileId: body.businessProfileId ?? undefined,
      },
    });

    return NextResponse.json({ integration }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
