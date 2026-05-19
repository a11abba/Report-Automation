import { NextResponse } from "next/server";
import { z } from "zod";
import {
  attachReportMemoryRecordToClient,
  createClientRecord,
  createReportMemoryRecord,
} from "@/lib/audit-engine";
import { canManagePlatform } from "@/lib/auth-access";
import { reportFocuses, reportLanguages } from "@/lib/audit/types";
import { assertSafeAuditUrl } from "@/lib/audit-url";
import { extractTextFromPdfFile } from "@/lib/report-memory-import";
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
  reportIntro: z.string().min(2).nullable().optional(),
  reportBenchmarks: z.string().min(2).nullable().optional(),
  referenceReportNotes: z.string().min(2).nullable().optional(),
  initialReportMemoryId: z.string().min(1).nullable().optional(),
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
    let bodyInput: z.input<typeof createClientSchema>;
    let latestReferenceReportPdf: File | null = null;
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const pdfValue = formData.get("latestReferenceReportPdf");
      latestReferenceReportPdf =
        pdfValue instanceof File && pdfValue.size > 0 ? pdfValue : null;
      bodyInput = {
        accountId: String(formData.get("accountId") ?? "") || undefined,
        name: String(formData.get("name") ?? ""),
        industry: String(formData.get("industry") ?? ""),
        industryLabelPt: String(formData.get("industryLabelPt") ?? "") || null,
        operatingModel: (
          String(formData.get("operatingModel") ?? "single_source") || "single_source"
        ) as z.input<typeof createClientSchema>["operatingModel"],
        primaryDomain: String(formData.get("primaryDomain") ?? "") || null,
        reportLanguage: (
          String(formData.get("reportLanguage") ?? "pt-BR") || "pt-BR"
        ) as z.input<typeof createClientSchema>["reportLanguage"],
        reportFocus: (
          String(formData.get("reportFocus") ?? "full_funnel") || "full_funnel"
        ) as z.input<typeof createClientSchema>["reportFocus"],
        reportIntro: String(formData.get("reportIntro") ?? "").trim() || null,
        reportBenchmarks: String(formData.get("reportBenchmarks") ?? "").trim() || null,
        referenceReportNotes:
          String(formData.get("referenceReportNotes") ?? "").trim() || null,
        initialReportMemoryId:
          String(formData.get("initialReportMemoryId") ?? "").trim() || null,
      };
    } else {
      bodyInput = await request.json();
    }

    const body = createClientSchema.parse(bodyInput);
    const primaryDomain = body.primaryDomain
      ? await assertSafeAuditUrl(body.primaryDomain)
      : null;
    const accountId = body.accountId ?? viewer.accountId;
    const client = await createClientRecord(accountId, {
      name: body.name,
      industry: body.industry,
      industryLabelPt: body.industryLabelPt ?? null,
      operatingModel: body.operatingModel,
      primaryDomain,
      reportLanguage: body.reportLanguage,
      reportFocus: body.reportFocus,
      reportIntro: body.reportIntro ?? null,
      reportBenchmarks: body.reportBenchmarks ?? null,
      referenceReportNotes: body.referenceReportNotes ?? null,
    });
    if (body.initialReportMemoryId) {
      await attachReportMemoryRecordToClient(client.id, body.initialReportMemoryId);
    }
    if (latestReferenceReportPdf) {
      const importedReport = await extractTextFromPdfFile(latestReferenceReportPdf);
      const reportMemory = await createReportMemoryRecord(accountId, {
        title: importedReport.title,
        sourceClientName: body.name,
        periodLabel: "Latest pre-platform PDF reference",
        notes:
          "Imported automatically during client creation from the uploaded latest PDF report.",
        content: importedReport.content,
      });
      await attachReportMemoryRecordToClient(client.id, reportMemory.id);
    }
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
}
