import { NextResponse } from "next/server";
import { z } from "zod";
import { createClientRecord } from "@/lib/audit-engine";
import { canManagePlatform } from "@/lib/auth-access";
import { reportFocuses, reportLanguages } from "@/lib/audit/types";
import { assertSafeAuditUrl } from "@/lib/audit-url";
import { getStore } from "@/lib/storage";
import { requireRouteViewer } from "@/lib/route-auth";

const createClientSchema = z.object({
  accountId: z.string().optional(),
  name: z.string().min(2),
  industry: z.string().min(2),
  industryLabelPt: z.string().min(2).nullable().optional(),
  operatingModel: z.enum(["single_source", "composed_source"]),
  primaryDomain: z.string().url().nullable().optional(),
  reportLanguage: z.enum(reportLanguages).default("pt-BR"),
  reportFocus: z.enum(reportFocuses).default("full_funnel"),
});

export async function GET() {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const store = await getStore();
  const clients = (await store.listClients()).filter(
    (client) => viewer.role === "platform_admin" || client.accountId === viewer.accountId,
  );
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  if (!canManagePlatform(viewer)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const body = createClientSchema.parse(await request.json());
    const primaryDomain = body.primaryDomain
      ? await assertSafeAuditUrl(body.primaryDomain)
      : null;
    const client = await createClientRecord(body.accountId ?? viewer.accountId, {
      name: body.name,
      industry: body.industry,
      industryLabelPt: body.industryLabelPt ?? null,
      operatingModel: body.operatingModel,
      primaryDomain,
      reportLanguage: body.reportLanguage,
      reportFocus: body.reportFocus,
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
