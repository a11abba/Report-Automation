import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteIntegrationRecord, updateIntegrationRecord } from "@/lib/audit-engine";
import { assertSafeAuditUrl } from "@/lib/audit-url";
import { loadClientForViewer, loadIntegrationForViewer, requireRouteViewer } from "@/lib/route-auth";
import { validateGoogleAdsSelection } from "@/services/google-ads-selection";

const updateIntegrationSchema = z.object({
  displayName: z.string().min(2).optional(),
  apiKey: z.string().nullable().optional(),
  authOrigin: z
    .enum(["none", "api_key", "oauth", "service_account"])
    .optional(),
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
  taskFolderId: z.string().nullable().optional(),
  taskFolderName: z.string().nullable().optional(),
  serviceAccountEmail: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; integrationId: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id, integrationId } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;
    const body = updateIntegrationSchema.parse(await request.json());
    const { integration: existing, response: integrationResponse } = await loadIntegrationForViewer(
      viewer,
      integrationId,
    );
    if (integrationResponse || !existing || existing.clientId !== id) {
      return NextResponse.json({ error: "Integration not found." }, { status: 404 });
    }

    const targetUrl =
      body.targetUrl === undefined
        ? undefined
        : body.targetUrl === null || body.targetUrl.trim().length === 0
          ? null
          : await assertSafeAuditUrl(body.targetUrl);
    const settingsPatch: NonNullable<Parameters<typeof updateIntegrationRecord>[1]["settings"]> = {};
    if (body.demoMode !== undefined) settingsPatch.demoMode = body.demoMode;
    if (body.targetUrl !== undefined) settingsPatch.targetUrl = targetUrl;
    if (body.propertyId !== undefined) settingsPatch.propertyId = body.propertyId;
    if (body.ga4PropertyId !== undefined) settingsPatch.ga4PropertyId = body.ga4PropertyId;
    if (body.businessAccountId !== undefined) settingsPatch.businessAccountId = body.businessAccountId;
    if (body.businessProfileId !== undefined) settingsPatch.businessProfileId = body.businessProfileId;
    if (body.adAccountId !== undefined) settingsPatch.adAccountId = body.adAccountId;
    if (
      existing.platformKey === "google_ads" &&
      (body.googleAdsCustomerId !== undefined || body.googleAdsLoginCustomerId !== undefined)
    ) {
      const requestedCustomerId =
        body.googleAdsCustomerId === undefined
          ? existing.settings.googleAdsCustomerId
          : body.googleAdsCustomerId;
      const requestedLoginCustomerId =
        body.googleAdsLoginCustomerId === undefined
          ? existing.settings.googleAdsLoginCustomerId
          : body.googleAdsLoginCustomerId;

      if (requestedCustomerId?.trim()) {
        const selection = await validateGoogleAdsSelection(
          existing,
          requestedCustomerId,
          requestedLoginCustomerId,
        );
        settingsPatch.googleAdsCustomerId = selection.googleAdsCustomerId;
        settingsPatch.googleAdsLoginCustomerId = selection.googleAdsLoginCustomerId;
      } else {
        settingsPatch.googleAdsCustomerId = null;
        settingsPatch.googleAdsLoginCustomerId = null;
      }
    } else {
      if (body.googleAdsCustomerId !== undefined) {
        settingsPatch.googleAdsCustomerId = body.googleAdsCustomerId;
      }
      if (body.googleAdsLoginCustomerId !== undefined) {
        settingsPatch.googleAdsLoginCustomerId = body.googleAdsLoginCustomerId;
      }
    }
    if (body.microsoftCustomerId !== undefined) settingsPatch.microsoftCustomerId = body.microsoftCustomerId;
    if (body.microsoftAccountId !== undefined) settingsPatch.microsoftAccountId = body.microsoftAccountId;
    if (body.merchantStoreId !== undefined) settingsPatch.merchantStoreId = body.merchantStoreId;
    if (body.merchantFeedId !== undefined) settingsPatch.merchantFeedId = body.merchantFeedId;
    if (body.taskFolderId !== undefined) settingsPatch.taskFolderId = body.taskFolderId;
    if (body.taskFolderName !== undefined) settingsPatch.taskFolderName = body.taskFolderName;
    const credentialsPatch: NonNullable<
      Parameters<typeof updateIntegrationRecord>[1]["credentials"]
    > = {};
    if (body.apiKey !== undefined && body.apiKey !== null && body.apiKey.trim().length > 0) {
      credentialsPatch.apiKey = body.apiKey.trim();
    }
    if (body.authOrigin !== undefined) credentialsPatch.authOrigin = body.authOrigin;
    if (body.serviceAccountEmail !== undefined) {
      credentialsPatch.serviceAccountEmail = body.serviceAccountEmail ?? undefined;
    }

    const integration = await updateIntegrationRecord(integrationId, {
      displayName: body.displayName,
      credentials:
        Object.keys(credentialsPatch).length > 0 ? credentialsPatch : undefined,
      settings: settingsPatch,
    });

    if (!integration) {
      return NextResponse.json({ error: "Integration not found." }, { status: 404 });
    }

    return NextResponse.json({ integration });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; integrationId: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;

  try {
    const { id, integrationId } = await context.params;
    const { response: clientResponse } = await loadClientForViewer(viewer, id);
    if (clientResponse) return clientResponse;

    const { integration: existing, response: integrationResponse } = await loadIntegrationForViewer(
      viewer,
      integrationId,
    );
    if (integrationResponse || !existing || existing.clientId !== id) {
      return NextResponse.json({ error: "Integration not found." }, { status: 404 });
    }

    const integration = await deleteIntegrationRecord(integrationId);
    if (!integration) {
      return NextResponse.json({ error: "Integration not found." }, { status: 404 });
    }

    return NextResponse.json({ integration });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
