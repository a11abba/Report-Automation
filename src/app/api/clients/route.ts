import { NextResponse } from "next/server";
import { z } from "zod";
import { createClientRecord } from "@/lib/audit-engine";
import { reportFocuses, reportLanguages } from "@/lib/audit/types";
import { getAuthSession } from "@/lib/auth-session-server";
import { assertSafeAuditUrl } from "@/lib/audit-url";
import { getStore } from "@/lib/storage";

const createClientSchema = z.object({
  name: z.string().min(2),
  industry: z.string().min(2),
  industryLabelPt: z.string().min(2).nullable().optional(),
  operatingModel: z.enum(["single_source", "composed_source"]),
  primaryDomain: z.string().url().nullable().optional(),
  reportLanguage: z.enum(reportLanguages).default("pt-BR"),
  reportFocus: z.enum(reportFocuses).default("full_funnel"),
});

export async function GET() {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const store = await getStore();
  const clients = await store.listClients();
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const body = createClientSchema.parse(await request.json());
    const primaryDomain = body.primaryDomain
      ? await assertSafeAuditUrl(body.primaryDomain)
      : null;
    const client = await createClientRecord({
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
