import { NextResponse } from "next/server";
import { z } from "zod";
import { updateClientRecord } from "@/lib/audit-engine";

const updateClientSchema = z.object({
  name: z.string().min(2).optional(),
  industry: z.string().min(2).optional(),
  industryLabelPt: z.string().min(2).nullable().optional(),
  operatingModel: z.enum(["single_source", "composed_source"]).optional(),
  primaryDomain: z.string().url().nullable().optional(),
  reportLanguage: z.enum(["pt-BR", "pt-PT"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = updateClientSchema.parse(await request.json());
    const client = await updateClientRecord(id, body);
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
