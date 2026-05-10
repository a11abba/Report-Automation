import { NextResponse } from "next/server";
import { z } from "zod";
import { updateIntegrationRecord } from "@/lib/audit-engine";
import { assertSafeAuditUrl } from "@/lib/audit-url";
import { getAuthSession } from "@/lib/auth-session-server";
import { getStore } from "@/lib/storage";

const updateIntegrationSchema = z.object({
  displayName: z.string().min(2).optional(),
  demoMode: z.boolean().optional(),
  targetUrl: z.string().nullable().optional(),
  propertyId: z.string().nullable().optional(),
  ga4PropertyId: z.string().nullable().optional(),
  businessAccountId: z.string().nullable().optional(),
  businessProfileId: z.string().nullable().optional(),
  adAccountId: z.string().nullable().optional(),
  serviceAccountEmail: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; integrationId: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const { id, integrationId } = await context.params;
    const body = updateIntegrationSchema.parse(await request.json());
    const store = await getStore();
    const existing = await store.getIntegration(integrationId);
    if (!existing || existing.clientId !== id) {
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

    const integration = await updateIntegrationRecord(integrationId, {
      displayName: body.displayName,
      credentials:
        body.serviceAccountEmail === undefined
          ? undefined
          : { serviceAccountEmail: body.serviceAccountEmail ?? undefined },
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
