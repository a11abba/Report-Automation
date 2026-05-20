import type {
  AuditFinding,
  AuditReportPayload,
  ContextEntryRecord,
  NormalizedBusinessSnapshot,
  ReportFrameworkPillar,
  ReportFrameworkSections,
  ReportLanguage,
  ReportPeriodReference,
  ReportNarrativeItem,
} from "@/lib/audit/types";
import { costPerConversion, inferObjectiveFromContextEntries } from "./report-objective";

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

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function isInternalBriefingContext(entry: ContextEntryRecord) {
  if (entry.entryType !== "note") {
    return false;
  }

  const text = entry.text.trim().toLowerCase();
  return (
    text.startsWith("remember that") ||
    text.startsWith("remember ") ||
    text.startsWith("keep in mind") ||
    text.startsWith("note that") ||
    text.startsWith("internal note") ||
    text.startsWith("lembre") ||
    text.startsWith("lembrar") ||
    text.startsWith("considere")
  );
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
      task_update: "Agency task update",
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
      task_update: "Atualização de tarefas da agência",
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
      task_update: "Atualização de tarefas da agência",
      other: "Contexto informado",
    },
  } as const;

  return labels[locale][type];
}

function frameworkPillarLabel(
  locale: ReportLanguage,
  key: ReportFrameworkPillar["key"],
) {
  const labels = {
    en: {
      clear: "Clear",
      concise: "Concise",
      insightful: "Insightful",
      precise: "Precise",
      actionable: "Actionable",
    },
    "pt-BR": {
      clear: "Claro",
      concise: "Conciso",
      insightful: "Insightful",
      precise: "Preciso",
      actionable: "Acionável",
    },
    "pt-PT": {
      clear: "Claro",
      concise: "Conciso",
      insightful: "Insightful",
      precise: "Preciso",
      actionable: "Acionável",
    },
  } as const;

  return labels[locale][key];
}

function buildDataFacts(
  locale: ReportLanguage,
  snapshot: NormalizedBusinessSnapshot,
  reportPeriod: ReportPeriodReference,
  baselineReport: AuditReportPayload | null,
  contextEntries: ContextEntryRecord[],
) {
  const items: ReportNarrativeItem[] = [];
  const baselineSnapshot = baselineReport?.snapshot ?? null;
  const baselineInputs = baselineReport?.reportPeriod.manualInputs ?? null;
  const objective = inferObjectiveFromContextEntries(contextEntries);

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
    const cpl = costPerConversion(snapshot.paidMedia);
    const detail =
      objective.kind === "lead_generation"
        ? locale === "en"
          ? `Paid media generated ${formatNumber(locale, snapshot.paidMedia.purchases)} ${objective.primaryConversionLabel.toLowerCase()} from ${formatNumber(locale, snapshot.paidMedia.clicks)} clicks on ${formatNumber(locale, snapshot.paidMedia.spend, 2)} in spend, with cost per lead at ${formatNumber(locale, cpl, 2)}${delta ? `, and spend ${directionLabel(locale, delta.value)} ${delta.label} vs baseline.` : "."}`
          : `A mídia paga gerou ${formatNumber(locale, snapshot.paidMedia.purchases)} ${objective.primaryConversionLabel.toLowerCase()} a partir de ${formatNumber(locale, snapshot.paidMedia.clicks)} cliques, com ${formatNumber(locale, snapshot.paidMedia.spend, 2)} de investimento e custo por lead em ${formatNumber(locale, cpl, 2)}${delta ? `, com investimento em ${directionLabel(locale, delta.value)} de ${delta.label} face ao baseline.` : "."}`
        : locale === "en"
          ? `Paid media spend reached ${formatNumber(locale, snapshot.paidMedia.spend, 2)} with ${formatNumber(locale, snapshot.paidMedia.purchases)} conversions, ${formatNumber(locale, snapshot.paidMedia.clicks)} clicks, and ROAS ${formatNumber(locale, snapshot.paidMedia.roas, 2)}${delta ? `, ${directionLabel(locale, delta.value)} ${delta.label} vs baseline spend.` : "."}`
          : `A mídia paga consumiu ${formatNumber(locale, snapshot.paidMedia.spend, 2)} com ${formatNumber(locale, snapshot.paidMedia.purchases)} conversões, ${formatNumber(locale, snapshot.paidMedia.clicks)} cliques e ROAS ${formatNumber(locale, snapshot.paidMedia.roas, 2)}${delta ? `, com ${directionLabel(locale, delta.value)} de ${delta.label} sobre o investimento base.` : "."}`;
    items.push({
      title: locale === "en" ? "Paid media output" : "Resultado de mídia paga",
      detail,
      evidence: [
        `Spend: ${formatNumber(locale, snapshot.paidMedia.spend, 2)}`,
        `Conversions: ${formatNumber(locale, snapshot.paidMedia.purchases)}`,
        `Clicks: ${formatNumber(locale, snapshot.paidMedia.clicks)}`,
        ...(objective.kind === "lead_generation"
          ? [`Cost per lead: ${formatNumber(locale, cpl, 2)}`]
          : [`ROAS: ${formatNumber(locale, snapshot.paidMedia.roas, 2)}`]),
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

function buildTaskManagementFacts(
  locale: ReportLanguage,
  snapshot: NormalizedBusinessSnapshot,
) {
  if (!snapshot.taskManagement) {
    return [];
  }

  const taskContext = snapshot.taskManagement;
  const folderLabel = taskContext.folderName ?? taskContext.folderId ?? "client folder";
  const actionedTasks = taskContext.actionedTasks ?? [];
  const completedTasksInPeriod = taskContext.completedTasksInPeriod ?? [];
  const activeTasksTouchedInPeriod = taskContext.activeTasksTouchedInPeriod ?? [];
  const overdueOrBlockedTasks = taskContext.overdueOrBlockedTasks ?? [];
  return [
    {
      title: locale === "en" ? "Agency task context" : "Contexto de tarefas da agência",
      detail:
        actionedTasks.length > 0
          ? locale === "en"
            ? `${taskContext.provider} shows ${formatNumber(locale, actionedTasks.length)} tasks touched during the report month in ${folderLabel}, including ${formatNumber(locale, completedTasksInPeriod.length)} completed actions and ${formatNumber(locale, activeTasksTouchedInPeriod.length)} active follow-ups.`
            : `O ${taskContext.provider} mostra ${formatNumber(locale, actionedTasks.length)} tarefas movimentadas no mês do relatório em ${folderLabel}, incluindo ${formatNumber(locale, completedTasksInPeriod.length)} ações concluídas e ${formatNumber(locale, activeTasksTouchedInPeriod.length)} acompanhamentos ativos.`
          : locale === "en"
            ? `${taskContext.provider} shows ${formatNumber(locale, taskContext.completedTasks)} completed tasks and ${formatNumber(locale, taskContext.activeTasks)} active tasks in ${folderLabel}, but no task updates were dated inside this report month.`
            : `O ${taskContext.provider} mostra ${formatNumber(locale, taskContext.completedTasks)} tarefas concluídas e ${formatNumber(locale, taskContext.activeTasks)} tarefas ativas em ${folderLabel}, mas nenhuma atualização de tarefa ficou datada dentro deste mês de relatório.`,
      evidence: [
        `Total tasks: ${formatNumber(locale, taskContext.totalTasks)}`,
        `Tasks touched in period: ${formatNumber(locale, actionedTasks.length)}`,
        `Completed in period: ${formatNumber(locale, completedTasksInPeriod.length)}`,
        `Active touched in period: ${formatNumber(locale, activeTasksTouchedInPeriod.length)}`,
        ...(overdueOrBlockedTasks.length > 0
          ? [`Overdue or blocked tasks: ${formatNumber(locale, overdueOrBlockedTasks.length)}`]
          : []),
      ],
    },
  ];
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
      title: locale === "en" ? "Limited contextual evidence" : "Contexto operacional limitado",
      detail:
        locale === "en"
          ? "Performance changed versus the comparison month, but no material operational changes were logged for this period."
          : "A performance mudou em relacao ao mês comparativo, mas nao houve contexto operacional suficiente registrado para explicar a mudança.",
      evidence: [
        locale === "en"
          ? "Add campaign, tracking, landing page, and sales notes in future months to improve the narrative."
          : "Registre notas de campanha, tracking, landing page e operacao comercial nos próximos meses para enriquecer a narrativa.",
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

function buildWhatHappened(
  locale: ReportLanguage,
  dataFacts: ReportNarrativeItem[],
  findings: AuditFinding[],
) {
  const items = [...dataFacts];

  if (items.length < 3) {
    for (const finding of findings.filter((finding) => finding.status !== "passing").slice(0, 2)) {
      items.push({
        title: locale === "en" ? "Performance signal" : "Sinal de performance",
        detail: finding.summary,
        evidence: finding.evidence.slice(0, 3),
      });
    }
  }

  return uniqueItems(items).slice(0, 3);
}

function buildWhyItHappened(
  locale: ReportLanguage,
  hypotheses: ReportNarrativeItem[],
  contextEntries: ContextEntryRecord[],
) {
  const items = [...hypotheses];
  const visibleContextEntries = contextEntries.filter((entry) => !isInternalBriefingContext(entry));

  if (items.length === 0) {
    for (const entry of visibleContextEntries.slice(0, 2)) {
      items.push({
        title: contextTypeLabel(locale, entry.entryType),
        detail: entry.text,
        evidence: uniqueStrings([
          entry.channel ? `Channel: ${entry.channel}` : "",
          entry.source ? `Source: ${entry.source}` : "",
          entry.campaignReference ? `Campaign: ${entry.campaignReference}` : "",
        ]),
      });
    }
  }

  if (items.length === 0 && contextEntries.length > 0) {
    items.push({
      title: locale === "en" ? "Operational priorities" : "Prioridades operacionais",
      detail:
        locale === "en"
          ? "Internal operating guidance and priority changes were considered in the analysis, but only client-relevant conclusions are surfaced here."
          : "Orientações operacionais internas e mudanças de prioridade foram consideradas na análise, mas apenas conclusões relevantes para o cliente são apresentadas aqui.",
      evidence: uniqueStrings(
        contextEntries
          .map((entry) => contextTypeLabel(locale, entry.entryType))
          .slice(0, 3),
      ),
    });
  }

  return uniqueItems(items).slice(0, 3);
}

function buildWhatWeAreDoing(
  locale: ReportLanguage,
  recommendations: ReportNarrativeItem[],
  findings: AuditFinding[],
  taskManagement: NormalizedBusinessSnapshot["taskManagement"],
) {
  const items = [...recommendations];

  if (taskManagement?.actionedTasks?.length || taskManagement?.recentlyUpdatedTasks.length) {
    const activeTasks = (taskManagement.activeTasksTouchedInPeriod?.length
      ? taskManagement.activeTasksTouchedInPeriod
      : taskManagement.recentlyUpdatedTasks
    ).filter(
      (task) => !["Completed", "Cancelled"].includes(task.status),
    );
    if (activeTasks.length > 0) {
      items.unshift({
        title: locale === "en" ? "Agency follow-through" : "Acompanhamento da agência",
        detail:
          locale === "en"
            ? `We are using the tasks touched during this report month in ${taskManagement.provider} to keep the next actions tied to real delivery work, not only recommendations in the report.`
            : `Estamos usando as tarefas movimentadas neste mês no ${taskManagement.provider} para manter os próximos passos ligados ao trabalho real de entrega, não apenas a recomendações do relatório.`,
        evidence: activeTasks.slice(0, 3).map((task) => `${task.title} (${task.status})`),
      });
    }
  }

  if (items.length === 0) {
    for (const finding of findings.filter((finding) => finding.status !== "passing").slice(0, 3)) {
      items.push({
        title:
          locale === "en" ? "Recommended next move" : "Próximo passo recomendado",
        detail: finding.recommendedAction,
        evidence: finding.evidence.slice(0, 2),
      });
    }
  }

  if (items.length === 0) {
    items.push({
      title: locale === "en" ? "Next reporting action" : "Próxima ação do relatório",
      detail:
        locale === "en"
          ? "Keep validating conversion quality, budget allocation, and campaign efficiency before the next monthly report is generated."
          : "Continue validando a qualidade das conversões, a alocação de verba e a eficiência das campanhas antes da próxima geração mensal.",
      evidence: [],
    });
  }

  return uniqueItems(items).slice(0, 3);
}

function buildExecutiveSummary(
  locale: ReportLanguage,
  whatHappened: ReportNarrativeItem[],
  whyItHappened: ReportNarrativeItem[],
  whatWeAreDoing: ReportNarrativeItem[],
) {
  const resultSentence = whatHappened[0]?.detail ?? "";
  const whySentence = whyItHappened[0]?.detail ?? "";
  const actionSentence = whatWeAreDoing[0]?.detail ?? "";

  if (locale === "en") {
    return [resultSentence, whySentence, actionSentence]
      .filter(Boolean)
      .join(" ");
  }

  return [resultSentence, whySentence, actionSentence]
    .filter(Boolean)
    .join(" ");
}

function buildClientEmailDraft(
  locale: ReportLanguage,
  reportPeriod: ReportPeriodReference,
  whatHappened: ReportNarrativeItem[],
  whyItHappened: ReportNarrativeItem[],
  whatWeAreDoing: ReportNarrativeItem[],
) {
  const subjectPeriod = reportPeriod.periodKey ?? (locale === "en" ? "this month" : "este mês");
  const resultSentence = whatHappened[0]?.detail ?? "";
  const whySentence = whyItHappened[0]?.detail ?? "";
  const actionSentence = whatWeAreDoing[0]?.detail ?? "";

  if (locale === "en") {
    return [
      `Subject: ${subjectPeriod} performance update`,
      "",
      "Hi,",
      "",
      `We reviewed the ${subjectPeriod} report and wanted to share the main read in plain language.`,
      resultSentence,
      whySentence,
      actionSentence ? `Our position from here is to keep moving on this next step: ${actionSentence}` : "",
      "",
      "We will keep monitoring the data and the operational context together so the next update reflects both performance and the work happening behind it.",
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  return [
    `Assunto: Atualização de performance de ${subjectPeriod}`,
    "",
    "Olá,",
    "",
    `Revisamos o relatório de ${subjectPeriod} e queríamos compartilhar a principal leitura de forma direta.`,
    resultSentence,
    whySentence,
    actionSentence ? `Nossa posição a partir daqui é seguir com este próximo passo: ${actionSentence}` : "",
    "",
    "Vamos continuar acompanhando os dados junto com o contexto operacional, para que a próxima atualização reflita tanto a performance quanto o trabalho que está acontecendo por trás dela.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildCcipaPillars(
  locale: ReportLanguage,
  reportPeriod: ReportPeriodReference,
  baselineReport: AuditReportPayload | null,
  contextEntries: ContextEntryRecord[],
  confidenceNotes: AuditReportPayload["confidenceNotes"],
  whatHappened: ReportNarrativeItem[],
  whyItHappened: ReportNarrativeItem[],
  whatWeAreDoing: ReportNarrativeItem[],
) {
  const hasDemoWarning = confidenceNotes.some(
    (note) => note.level === "warning" && /demo|simulad/i.test(note.detail),
  );
  const hasPrecisionInputs =
    reportPeriod.manualInputs?.leads != null ||
    reportPeriod.manualInputs?.revenue != null ||
    reportPeriod.manualInputs?.sales != null;

  const pillars: ReportFrameworkPillar[] = [
    {
      key: "clear",
      label: frameworkPillarLabel(locale, "clear"),
      status:
        whatHappened.length > 0 && whyItHappened.length > 0 && whatWeAreDoing.length > 0
          ? "strong"
          : "watch",
      detail:
        locale === "en"
          ? "The report is organized around result, explanation, and next action."
          : "O relatório está organizado em resultado, explicação e próximo passo.",
    },
    {
      key: "concise",
      label: frameworkPillarLabel(locale, "concise"),
      status:
        whatHappened.length <= 3 && whyItHappened.length <= 3 && whatWeAreDoing.length <= 3
          ? "strong"
          : "watch",
      detail:
        locale === "en"
          ? "Only the most relevant performance points are highlighted in each section."
          : "Cada seção prioriza apenas os pontos de performance mais relevantes.",
    },
    {
      key: "insightful",
      label: frameworkPillarLabel(locale, "insightful"),
      status:
        whyItHappened.length > 0 && (contextEntries.length > 0 || Boolean(baselineReport))
          ? "strong"
          : "watch",
      detail:
        locale === "en"
          ? "The explanation layer connects observed changes to context and likely drivers."
          : "A camada de explicação conecta a variação observada ao contexto e aos drivers prováveis.",
    },
    {
      key: "precise",
      label: frameworkPillarLabel(locale, "precise"),
      status: !hasDemoWarning && hasPrecisionInputs ? "strong" : "watch",
      detail:
        locale === "en"
          ? "Precision improves when exact business inputs and live data are available."
          : "A precisão aumenta quando existem inputs exatos de negócio e dados live disponíveis.",
    },
    {
      key: "actionable",
      label: frameworkPillarLabel(locale, "actionable"),
      status: whatWeAreDoing.length > 0 ? "strong" : "weak",
      detail:
        locale === "en"
          ? "Recommendations are framed as concrete next moves tied to the evidence."
          : "As recomendações são apresentadas como próximos passos concretos ligados às evidências.",
    },
  ];

  return pillars;
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
      label:
        locale === "en"
          ? reportPeriod.baselinePeriodKey
            ? "Comparison month not generated yet"
            : "No comparison month"
          : reportPeriod.baselinePeriodKey
            ? "Mês comparativo ainda não gerado"
            : "Sem mês comparativo",
      detail:
        locale === "en"
          ? reportPeriod.baselinePeriodKey
            ? `The comparison month ${reportPeriod.baselinePeriodKey} is linked, but its report has not been generated yet, so month-over-month commentary is still limited.`
            : "Month-over-month comparisons are limited because no comparison month was selected."
          : reportPeriod.baselinePeriodKey
            ? `O mês comparativo ${reportPeriod.baselinePeriodKey} está vinculado, mas o relatório dele ainda não foi gerado, então a leitura mês contra mês continua limitada.`
            : "As comparacoes mes contra mes estao limitadas porque nenhum mês comparativo foi selecionado.",
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
  const dataFacts = buildDataFacts(
    input.locale,
    input.snapshot,
    input.reportPeriod,
    input.baselineReport,
    input.contextEntries,
  );
  const taskManagementFacts = buildTaskManagementFacts(input.locale, input.snapshot);
  const providedContext = buildProvidedContext(input.locale, input.contextEntries);
  const hypotheses = buildHypotheses(
    input.locale,
    input.snapshot,
    input.baselineReport,
    input.contextEntries,
  );
  const recommendations = buildRecommendations(
    input.locale,
    input.findings,
    input.contextEntries,
  );
  const confidenceNotes = buildConfidenceNotes(
    input.locale,
    input.snapshot,
    input.reportPeriod,
    input.baselineReport,
    input.contextEntries,
  );
  const whatHappened = buildWhatHappened(input.locale, [...taskManagementFacts, ...dataFacts], input.findings);
  const whyItHappened = buildWhyItHappened(
    input.locale,
    hypotheses,
    input.contextEntries,
  );
  const whatWeAreDoing = buildWhatWeAreDoing(
    input.locale,
    recommendations,
    input.findings,
    input.snapshot.taskManagement,
  );
  const framework: ReportFrameworkSections = {
    executiveSummary: buildExecutiveSummary(
      input.locale,
      whatHappened,
      whyItHappened,
      whatWeAreDoing,
    ),
    clientEmailDraft: buildClientEmailDraft(
      input.locale,
      input.reportPeriod,
      whatHappened,
      whyItHappened,
      whatWeAreDoing,
    ),
    whatHappened,
    whyItHappened,
    whatWeAreDoing,
    ccipaPillars: buildCcipaPillars(
      input.locale,
      input.reportPeriod,
      input.baselineReport,
      input.contextEntries,
      confidenceNotes,
      whatHappened,
      whyItHappened,
      whatWeAreDoing,
    ),
  };

  return {
    dataFacts: [...taskManagementFacts, ...dataFacts],
    providedContext,
    hypotheses,
    recommendations,
    confidenceNotes,
    framework,
  };
}
