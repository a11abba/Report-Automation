import { NextResponse } from "next/server";
import { z } from "zod";
import { createClientRecord } from "@/lib/audit-engine";
import { getStore } from "@/lib/storage";

const createClientSchema = z.object({
  name: z.string().min(2),
  industry: z.string().min(2),
  industryLabelPt: z.string().min(2).nullable().optional(),
  operatingModel: z.enum(["single_source", "composed_source"]),
  primaryDomain: z.string().url().nullable().optional(),
  reportLanguage: z.enum(["pt-BR", "pt-PT"]).default("pt-BR"),
});

export async function GET() {
  const store = await getStore();
  const clients = await store.listClients();
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  try {
    const body = createClientSchema.parse(await request.json());
    const client = await createClientRecord({
      name: body.name,
      industry: body.industry,
      industryLabelPt: body.industryLabelPt ?? null,
      operatingModel: body.operatingModel,
      primaryDomain: body.primaryDomain ?? null,
      reportLanguage: body.reportLanguage,
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
