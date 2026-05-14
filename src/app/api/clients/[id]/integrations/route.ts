import { NextResponse } from "next/server";
import { z } from "zod";
import { createIntegrationRecord } from "@/lib/audit-engine";
import { assertSafeAuditUrl } from "@/lib/audit-url";
import { platformCatalog } from "@/lib/connectors";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

const integrationSchema = z.object({
  platformKey: z.enum([
    "klaviyo",
    "hubspot",
    "shopify",
    "google_search_console",
    "google_business_profile",
    "google_analytics",
    "google_ads",
    "microsoft_ads",
    "microsoft_merchant_center",
    "pagespeed_insights",
    "website_crawler",
    "meta_ads",
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
  adAccountId: z.string().nullable().optional(),
  googleAdsCustomerId: z.string().nullable().optional(),
  googleAdsLoginCustomerId: z.string().nullable().optional(),
  microsoftCustomerId: z.string().nullable().optional(),
  microsoftAccountId: z.string().nullable().optional(),
  merchantStoreId: z.string().nullable().optional(),
  merchantFeedId: z.string().nullable().optional(),
  serviceAccountEmail: z.string().nullable().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  try {
    const { id } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;
    const body = integrationSchema.parse(await request.json());
    const platform = platformCatalog.find((item) => item.key === body.platformKey);
    if (!platform) {
      return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
    }

    const hasDirectCredential = body.apiKey.trim().length > 0;
    const resolvedDemoMode =
      body.demoMode ??
      (!hasDirectCredential && body.authOrigin !== "oauth" && body.authOrigin !== "service_account");
    const targetUrl =
      body.targetUrl == null || body.targetUrl.trim().length === 0
        ? undefined
        : await assertSafeAuditUrl(body.targetUrl);

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
        targetUrl,
        propertyId: body.propertyId ?? undefined,
        ga4PropertyId: body.ga4PropertyId ?? undefined,
        businessAccountId: body.businessAccountId ?? undefined,
        businessProfileId: body.businessProfileId ?? undefined,
        adAccountId: body.adAccountId ?? undefined,
        googleAdsCustomerId: body.googleAdsCustomerId ?? undefined,
        googleAdsLoginCustomerId: body.googleAdsLoginCustomerId ?? undefined,
        microsoftCustomerId: body.microsoftCustomerId ?? undefined,
        microsoftAccountId: body.microsoftAccountId ?? undefined,
        merchantStoreId: body.merchantStoreId ?? undefined,
        merchantFeedId: body.merchantFeedId ?? undefined,
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
