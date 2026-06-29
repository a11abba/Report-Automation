import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuditPreflightError,
  createAuditForClient,
  deleteCanceledAuditsForClient,
} from "@/lib/audit-engine";
import { loadClientForViewer, requireRouteViewer } from "@/lib/route-auth";

export const maxDuration = 300;

const auditScopeSchema = z
  .object({
    integrationIds: z.array(z.string()).optional(),
    locationIds: z.array(z.string()).optional(),
    detectedContext: z
      .object({
        currentUrl: z.string().optional(),
        platformDetected: z.string().optional(),
        suggestedDomain: z.string().optional(),
      })
      .optional(),
  })
  .optional();

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
    const raw = request.headers.get("content-length") === "0" ? undefined : await request.json().catch(() => undefined);
    const scope = auditScopeSchema.parse(raw);
    const audit = await createAuditForClient(id, scope);
    return NextResponse.json({ audit }, { status: 201 });
  } catch (error) {
    if (error instanceof AuditPreflightError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create audit." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { viewer, response } = await requireRouteViewer();
  if (!viewer) return response;
  const { id } = await context.params;
  const { response: clientResponse } = await loadClientForViewer(viewer, id);
  if (clientResponse) return clientResponse;
  const result = await deleteCanceledAuditsForClient(id);
  return NextResponse.json(result);
}
