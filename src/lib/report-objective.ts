import type {
  AuditReportPayload,
  ClientRecord,
  ContextEntryRecord,
  PaidMediaCampaignSnapshot,
  PaidMediaSection,
} from "@/lib/audit/types";

export type ReportObjectiveKind = "lead_generation" | "revenue";

const LEAD_HINTS = [
  "lead generation",
  "lead gen",
  "unbounce lead",
  "primary conversion",
  "leads generation",
  "lead form",
  "qualified lead",
];

const REVENUE_HINTS = [
  "ecommerce",
  "revenue",
  "sales value",
  "purchase value",
  "shopify",
  "orders",
];

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function collectHints(
  values: Array<string | null | undefined>,
) {
  return values
    .map((value) => normalize(value))
    .filter(Boolean)
    .join(" \n ");
}

function inferPrimaryConversionLabel(text: string) {
  if (text.includes("unbounce lead")) {
    return "Unbounce leads";
  }
  if (text.includes("qualified lead")) {
    return "Qualified leads";
  }
  if (text.includes("lead")) {
    return "Leads";
  }
  return "Conversions";
}

export function inferObjectiveFromText(text: string): {
  kind: ReportObjectiveKind;
  primaryConversionLabel: string;
} {
  const leadHits = LEAD_HINTS.filter((hint) => text.includes(hint)).length;
  const revenueHits = REVENUE_HINTS.filter((hint) => text.includes(hint)).length;

  if (leadHits > revenueHits) {
    return {
      kind: "lead_generation",
      primaryConversionLabel: inferPrimaryConversionLabel(text),
    };
  }

  return {
    kind: "revenue",
    primaryConversionLabel: "Conversions",
  };
}

export function inferObjectiveForReport(
  report: AuditReportPayload,
  clientContext?: Pick<ClientRecord, "reportIntro" | "referenceReportNotes" | "reportBenchmarks"> | null,
) {
  const text = collectHints([
    clientContext?.reportIntro,
    clientContext?.referenceReportNotes,
    clientContext?.reportBenchmarks,
    report.reportPeriod.manualInputs?.notes,
    ...report.providedContext.map((item) => `${item.title} ${item.detail}`),
  ]);

  return inferObjectiveFromText(text);
}

export function inferObjectiveFromContextEntries(contextEntries: ContextEntryRecord[]) {
  const text = collectHints(contextEntries.map((entry) => `${entry.entryType} ${entry.text}`));
  return inferObjectiveFromText(text);
}

export function costPerConversion(paidMedia: PaidMediaSection | null | undefined) {
  if (!paidMedia || !paidMedia.purchases || paidMedia.purchases <= 0) {
    return null;
  }
  return paidMedia.spend / paidMedia.purchases;
}

export function campaignCostPerConversion(campaign: PaidMediaCampaignSnapshot | null | undefined) {
  if (!campaign || !campaign.purchases || campaign.purchases <= 0) {
    return null;
  }
  return campaign.spend / campaign.purchases;
}
