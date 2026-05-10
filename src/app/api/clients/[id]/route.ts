import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteClientRecord, updateClientRecord } from "@/lib/audit-engine";
import { reportFocuses, reportLanguages } from "@/lib/audit/types";
import { getAuthSession } from "@/lib/auth-session-server";
import { assertSafeAuditUrl } from "@/lib/audit-url";

const updateClientSchema = z.object({
  name: z.string().min(2).optional(),
  industry: z.string().min(2).optional(),
  industryLabelPt: z.string().min(2).nullable().optional(),
  operatingModel: z.enum(["single_source", "composed_source"]).optional(),
  primaryDomain: z.string().url().nullable().optional(),
  reportLanguage: z.enum(reportLanguages).optional(),
  reportFocus: z.enum(reportFocuses).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const body = updateClientSchema.parse(await request.json());
    const primaryDomain =
      body.primaryDomain === undefined
        ? undefined
        : body.primaryDomain === null
          ? null
          : await assertSafeAuditUrl(body.primaryDomain);
    const client = await updateClientRecord(id, {
      ...body,
      primaryDomain,
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json({ client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAuthSession())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const client = await deleteClientRecord(id);
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json({ client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete client." },
      { status: 400 },
    );
  }
}
