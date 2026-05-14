import type {
  AuditFinding,
  AuditReportPayload,
  ContextEntryRecord,
  NormalizedBusinessSnapshot,
  ReportLanguage,
  ReportPeriodReference,
  ReportNarrativeItem,
} from "@/lib/audit/types";

function formatNumber(locale: ReportLanguage, value: number | null | undefined, digits = 0) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(locale: ReportLanguage, value: number | null | undefined, digits = 1) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDelta(locale: ReportLanguage, current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || previous === 0) {
    return null;
  }
  const delta = (current - previous) / Math.abs(previous);
  return {
    value: delta,
    label: formatPercent(locale, delta, 1),
  };
}

function formatDateLabel(locale: ReportLanguage, value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-US" : locale);
}

function directionLabel(locale: ReportLanguage, delta: number) {
  if (locale === "en") {
    return delta >= 0 ? "up" : "down";
  }
  return delta >= 0 ? "alta" : "queda";
}

function uniqueItems(items: ReportNarrativeItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}:${item.detail}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function contextTypeLabel(locale: ReportLanguage, type: ContextEntryRecord["entryType"]) {
  const labels = {
    en: {
      note: "Operator note",
      budget_change: "Budget change",
      campaign_change: "Campaign change",
      landing_page: "Landing page change",
      tracking_issue: "Tracking issue",
      sales_issue: "Sales issue",
      seo_change: "SEO change",
      other: "Context entry",
    },
    "pt-BR": {
      note: "Nota operacional",
      budget_change: "Mudanca de orçamento",
      campaign_change: "Mudanca de campanha",
      landing_page: "Mudanca de landing page",
      tracking_issue: "Problema de tracking",
      sales_issue: "Problema comercial",
      seo_change: "Mudanca de SEO",
      other: "Contexto informado",
    },
    "pt-PT": {
      note: "Nota operacional",
      budget_change: "Mudanca de orçamento",
      campaign_change: "Mudanca de campanha",
      landing_page: "Mudanca de landing page",
      tracking_issue: "Problema de tracking",
      sales_issue: "Problema comercial",
      seo_change: "Mudanca de SEO",
      other: "Contexto informado",
    },
  } as const;

  return labels[locale][type];
}

function buildDataFacts(
  locale: ReportLanguage,
  snapshot: NormalizedBusinessSnapshot,
  reportPeriod: ReportPeriodReference,
  baselineReport: AuditReportPayload | null,
) {
  const items: ReportNarrativeItem[] = [];
  const baselineSnapshot = baselineReport?.snapshot ?? null;
  const baselineInputs = baselineReport?.reportPeriod.manualInputs ?? null;

  if (snapshot.trafficAttribution) {
    const delta = formatDelta(
      locale,
      snapshot.trafficAttribution.sessions,
      baselineSnapshot?.trafficAttribution?.sessions,
    );
    const detail =
      locale === "en"
        ? `GA4 recorded ${formatNumber(locale, snapshot.trafficAttribution.sessions)} sessions and ${formatPercent(locale, snapshot.trafficAttribution.conversionRate)} conversion rate${delta ? `, ${directionLabel(locale, delta.value)} ${delta.label} vs baseline.` : "."}`
        : `O GA4 registrou ${formatNumber(locale, snapshot.trafficAttribution.sessions)} sessões e ${formatPercent(locale, snapshot.trafficAttribution.conversionRate)} de taxa de conversão${delta ? `, com ${directionLabel(locale, delta.value)} de ${delta.label} face ao baseline.` : "."}`;
    items.push({
      title: locale === "en" ? "Traffic performance" : "Performance de tráfego",
      detail,
      evidence: [
        `Sessions: ${formatNumber(locale, snapshot.trafficAttribution.sessions)}`,
        `Conversion rate: ${formatPercent(locale, snapshot.trafficAttribution.conversionRate)}`,
        ...(delta ? [`Baseline sessions delta: ${delta.label}`] : []),
      ],
    });
  }

  if (snapshot.paidMedia) {
    const delta = formatDelta(locale, snapshot.paidMedia.spend, baselineSnapshot?.paidMedia?.spend);
    const detail =
      locale === "en"
        ? `Paid media spend reached ${formatNumber(locale, snapshot.paidMedia.spend, 2)} with ${formatNumber(locale, snapshot.paidMedia.purchases)} purchases and ROAS ${formatNumber(locale, snapshot.paidMedia.roas, 2)}${delta ? `, ${directionLabel(locale, delta.value)} ${delta.label} vs baseline spend.` : "."}`
        : `A mídia paga consumiu ${formatNumber(locale, snapshot.paidMedia.spend, 2)} com ${formatNumber(locale, snapshot.paidMedia.purchases)} compras e ROAS ${formatNumber(locale, snapshot.paidMedia.roas, 2)}${delta ? `, com ${directionLabel(locale, delta.value)} de ${delta.label} sobre o investimento base.` : "."}`;
    items.push({
      title: locale === "en" ? "Paid media output" : "Resultado de mídia paga",
      detail,
      evidence: [
        `Spend: ${formatNumber(locale, snapshot.paidMedia.spend, 2)}`,
        `Purchases: ${formatNumber(locale, snapshot.paidMedia.purchases)}`,
        `ROAS: ${formatNumber(locale, snapshot.paidMedia.roas, 2)}`,
      ],
    });
  }

  if (snapshot.search) {
    const delta = formatDelta(locale, snapshot.search.clicks, baselineSnapshot?.search?.clicks);
    const detail =
      locale === "en"
        ? `Organic search generated ${formatNumber(locale, snapshot.search.clicks)} clicks on ${formatNumber(locale, snapshot.search.impressions)} impressions with CTR ${formatPercent(locale, snapshot.search.ctr, 2)}${delta ? `, ${directionLabel(locale, delta.value)} ${delta.label} vs baseline clicks.` : "."}`
        : `A pesquisa orgânica gerou ${formatNumber(locale, snapshot.search.clicks)} cliques em ${formatNumber(locale, snapshot.search.impressions)} impressões, com CTR de ${formatPercent(locale, snapshot.search.ctr, 2)}${delta ? `, em ${directionLabel(locale, delta.value)} de ${delta.label} sobre os cliques do baseline.` : "."}`;
    items.push({
      title: locale === "en" ? "Organic search signal" : "Sinal orgânico",
      detail,
      evidence: [
        `Clicks: ${formatNumber(locale, snapshot.search.clicks)}`,
        `Impressions: ${formatNumber(locale, snapshot.search.impressions)}`,
        `CTR: ${formatPercent(locale, snapshot.search.ctr, 2)}`,
      ],
    });
  }

  if (reportPeriod.manualInputs) {
    const delta = formatDelta(locale, reportPeriod.manualInputs.leads, baselineInputs?.leads);
    const salesDelta = formatDelta(locale, reportPeriod.manualInputs.revenue, baselineInputs?.revenue);
    const leadEvidence = [
      `Leads: ${formatNumber(locale, reportPeriod.manualInputs.leads)}`,
      `Qualified leads: ${formatNumber(locale, reportPeriod.manualInputs.qualifiedLeads)}`,
      `Sales: ${formatNumber(locale, reportPeriod.manualInputs.sales)}`,
      `Revenue: ${formatNumber(locale, reportPeriod.manualInputs.revenue, 2)}`,
    ];
    if (reportPeriod.manualInputs.leads != null || reportPeriod.manualInputs.revenue != null) {
      const detail =
        locale === "en"
          ? `Manual business inputs recorded ${formatNumber(locale, reportPeriod.manualInputs.leads)} leads and ${formatNumber(locale, reportPeriod.manualInputs.revenue, 2)} revenue${delta ? `, with leads ${directionLabel(locale, delta.value)} ${delta.label} vs baseline.` : salesDelta ? `, and revenue ${directionLabel(locale, salesDelta.value)} ${salesDelta.label} vs baseline.` : "."}`
          : `Os inputs manuais registraram ${formatNumber(locale, reportPeriod.manualInputs.leads)} leads e ${formatNumber(locale, reportPeriod.manualInputs.revenue, 2)} de receita${delta ? `, com leads em ${directionLabel(locale, delta.value)} de ${delta.label} face ao baseline.` : salesDelta ? `, e receita em ${directionLabel(locale, salesDelta.value)} de ${salesDelta.label} face ao baseline.` : "."}`;
      items.push({
        title: locale === "en" ? "Business outcome inputs" : "Resultado de negócio informado",
        detail,
        evidence: leadEvidence,
      });
    }
  }

  return uniqueItems(items).slice(0, 4);
}

function buildProvidedContext(locale: ReportLanguage, contextEntries: ContextEntryRecord[]) {
  return contextEntries.slice(0, 6).map((entry) => ({
    title: contextTypeLabel(locale, entry.entryType),
    detail: [
      entry.channel || entry.source || null,
      entry.campaignReference,
      entry.text,
    ]
      .filter(Boolean)
      .join(" • "),
    evidence: [
      ...(entry.tags.length ? [`Tags: ${entry.tags.join(", ")}`] : []),
      ...(entry.effectiveStartDate || entry.effectiveEndDate
        ? [
            locale === "en"
              ? `Effective window: ${formatDateLabel(locale, entry.effectiveStartDate) ?? "?"} to ${formatDateLabel(locale, entry.effectiveEndDate) ?? "?"}`
              : `Janela efetiva: ${formatDateLabel(locale, entry.effectiveStartDate) ?? "?"} a ${formatDateLabel(locale, entry.effectiveEndDate) ?? "?"}`,
          ]
        : []),
      `${entry.authorName} <${entry.authorEmail}>`,
    ],
  }));
}

function buildHypotheses(
  locale: ReportLanguage,
  snapshot: NormalizedBusinessSnapshot,
  baselineReport: AuditReportPayload | null,
  contextEntries: ContextEntryRecord[],
) {
  const items: ReportNarrativeItem[] = [];
  const types = new Set(contextEntries.map((entry) => entry.entryType));
  const paidSpendDelta = formatDelta(
    locale,
    snapshot.paidMedia?.spend,
    baselineReport?.snapshot.paidMedia?.spend,
  );
  const sessionDelta = formatDelta(
    locale,
    snapshot.trafficAttribution?.sessions,
    baselineReport?.snapshot.trafficAttribution?.sessions,
  );

  if (types.has("tracking_issue")) {
    items.push({
      title: locale === "en" ? "Tracking reliability risk" : "Risco de confiabilidade do tracking",
      detail:
        locale === "en"
          ? "Part of the performance variation may reflect tracking instability rather than pure channel efficiency."
          : "Parte da variacao observada pode refletir instabilidade de tracking, e nao apenas mudanca real de performance.",
      evidence: contextEntries
        .filter((entry) => entry.entryType === "tracking_issue")
        .slice(0, 2)
        .map((entry) => entry.text),
    });
  }

  if (types.has("budget_change") && paidSpendDelta) {
    items.push({
      title: locale === "en" ? "Budget impact hypothesis" : "Hipotese de impacto de orçamento",
      detail:
        locale === "en"
          ? `Budget changes likely influenced paid-media output, with spend ${directionLabel(locale, paidSpendDelta.value)} ${paidSpendDelta.label} versus the baseline period.`
          : `Mudancas de orçamento provavelmente influenciaram o resultado de mídia paga, com investimento em ${directionLabel(locale, paidSpendDelta.value)} de ${paidSpendDelta.label} versus o período base.`,
      evidence: [
        `Spend delta: ${paidSpendDelta.label}`,
        ...contextEntries.filter((entry) => entry.entryType === "budget_change").slice(0, 2).map((entry) => entry.text),
      ],
    });
  }

  if ((types.has("landing_page") || types.has("campaign_change")) && sessionDelta) {
    items.push({
      title: locale === "en" ? "Conversion path transition" : "Transicao no caminho de conversao",
      detail:
        locale === "en"
          ? `Landing page or campaign changes may explain part of the session shift (${directionLabel(locale, sessionDelta.value)} ${sessionDelta.label}) while the new structure stabilizes.`
          : `Mudancas de landing page ou campanha podem explicar parte da variacao de sessoes (${directionLabel(locale, sessionDelta.value)} ${sessionDelta.label}) enquanto a nova estrutura estabiliza.`,
      evidence: [
        `Session delta: ${sessionDelta.label}`,
        ...contextEntries
          .filter((entry) => entry.entryType === "landing_page" || entry.entryType === "campaign_change")
          .slice(0, 2)
          .map((entry) => entry.text),
      ],
    });
  }

  if (items.length === 0 && baselineReport) {
    items.push({
      title: locale === "en" ? "Open investigation point" : "Ponto em investigacao",
      detail:
        locale === "en"
          ? "The data changed versus the previous period, but there is not enough logged context yet to explain causality with confidence."
          : "Os dados mudaram em relacao ao período anterior, mas ainda nao existe contexto suficiente registrado para explicar a causalidade com seguranca.",
      evidence: [
        locale === "en"
          ? "Review campaign changes, tracking notes, landing page releases, and sales operations for the period."
          : "Revise mudancas de campanha, tracking, landing pages e operacao comercial do período.",
      ],
    });
  }

  return uniqueItems(items).slice(0, 3);
}

function buildRecommendations(locale: ReportLanguage, findings: AuditFinding[], contextEntries: ContextEntryRecord[]) {
  const items: ReportNarrativeItem[] = [];
  if (contextEntries.some((entry) => entry.entryType === "tracking_issue")) {
    items.push({
      title: locale === "en" ? "Validate measurement first" : "Validar mensuracao primeiro",
      detail:
        locale === "en"
          ? "Resolve tracking issues before making budget or channel decisions from this report."
          : "Corrija os problemas de tracking antes de tomar decisoes de orçamento ou canal com base neste relatório.",
      evidence: contextEntries.filter((entry) => entry.entryType === "tracking_issue").slice(0, 2).map((entry) => entry.text),
    });
  }

  for (const finding of findings.filter((finding) => finding.status !== "passing").slice(0, 3)) {
    items.push({
      title: finding.summary,
      detail: finding.recommendedAction,
      evidence: finding.evidence.slice(0, 3),
    });
  }

  return uniqueItems(items).slice(0, 4);
}

function buildConfidenceNotes(
  locale: ReportLanguage,
  snapshot: NormalizedBusinessSnapshot,
  reportPeriod: ReportPeriodReference,
  baselineReport: AuditReportPayload | null,
  contextEntries: ContextEntryRecord[],
) {
  const items: AuditReportPayload["confidenceNotes"] = [];
  const demoFlags = snapshot.operationalFlags.filter((flag) => flag.endsWith("_demo_mode"));

  if (demoFlags.length > 0) {
    items.push({
      label: locale === "en" ? "Demo or placeholder data detected" : "Dados demo ou simulados detectados",
      detail:
        locale === "en"
          ? `This report still contains demo-backed sections: ${demoFlags.join(", ")}.`
          : `Este relatório ainda contem secoes em modo demo: ${demoFlags.join(", ")}.`,
      level: "warning",
    });
  } else {
    items.push({
      label: locale === "en" ? "Live data evidence" : "Evidencia de dados reais",
      detail:
        locale === "en"
          ? "All included integrations used live-ready data at generation time."
          : "Todas as integracoes incluídas usaram dados live-ready no momento da geracao.",
      level: "info",
    });
  }

  if (!baselineReport) {
    items.push({
      label: locale === "en" ? "No baseline period" : "Sem período base",
      detail:
        locale === "en"
          ? "Month-over-month comparisons are limited because no baseline report period was linked."
          : "As comparacoes mes contra mes estao limitadas porque nenhum período base foi associado.",
      level: "warning",
    });
  }

  if (contextEntries.length === 0) {
    items.push({
      label: locale === "en" ? "No operator context provided" : "Sem contexto operacional informado",
      detail:
        locale === "en"
          ? "Interpret performance changes carefully because no contextual notes were added for this period."
          : "Interprete as variacoes com cautela, porque nenhum contexto foi informado para este período.",
      level: "warning",
    });
  }

  if (reportPeriod.manualInputs?.notes) {
    items.push({
      label: locale === "en" ? "Manual business notes included" : "Notas manuais de negocio incluídas",
      detail: reportPeriod.manualInputs.notes,
      level: "info",
    });
  }

  return items;
}

export function buildNarrativeSections(input: {
  locale: ReportLanguage;
  snapshot: NormalizedBusinessSnapshot;
  findings: AuditFinding[];
  reportPeriod: ReportPeriodReference;
  baselineReport: AuditReportPayload | null;
  contextEntries: ContextEntryRecord[];
}) {
  return {
    dataFacts: buildDataFacts(input.locale, input.snapshot, input.reportPeriod, input.baselineReport),
    providedContext: buildProvidedContext(input.locale, input.contextEntries),
    hypotheses: buildHypotheses(input.locale, input.snapshot, input.baselineReport, input.contextEntries),
    recommendations: buildRecommendations(input.locale, input.findings, input.contextEntries),
    confidenceNotes: buildConfidenceNotes(
      input.locale,
      input.snapshot,
      input.reportPeriod,
      input.baselineReport,
      input.contextEntries,
    ),
  };
}
