import { NextResponse } from "next/server";
import { z } from "zod";
import { AuditPreflightError, createAuditForClient } from "@/lib/audit-engine";

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
  try {
    const { id } = await context.params;
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
