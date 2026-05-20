import { z } from "zod";
import type {
  AuditReportPayload,
  ClientRecord,
  ReportFeedbackRecord,
  ReportFrameworkPillar,
  ReportFrameworkSections,
  ReportMemoryRecord,
} from "@/lib/audit/types";
import { costPerConversion, inferObjectiveForReport } from "./report-objective";

const frameworkItemSchema = z.object({
  title: z.string().min(3),
  detail: z.string().min(12),
  evidence: z.array(z.string()).max(4).default([]),
});

const frameworkPillarSchema = z.object({
  key: z.enum(["clear", "concise", "insightful", "precise", "actionable"]),
  label: z.string().min(2),
  status: z.enum(["strong", "watch", "weak"]),
  detail: z.string().min(12),
});

const reportFrameworkSchema = z.object({
  executiveSummary: z.string().min(24),
  clientEmailDraft: z.string().min(48),
  whatHappened: z.array(frameworkItemSchema).min(1).max(3),
  whyItHappened: z.array(frameworkItemSchema).min(1).max(3),
  whatWeAreDoing: z.array(frameworkItemSchema).min(1).max(3),
  ccipaPillars: z.array(frameworkPillarSchema).length(5),
});

type ParsedFramework = z.infer<typeof reportFrameworkSchema>;

type ReportAiProvider = "openai" | "gemini";

function getReportAiConfig() {
  const requestedProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

  let provider: ReportAiProvider | null = null;
  if (requestedProvider === "openai") {
    provider = "openai";
  } else if (requestedProvider === "gemini") {
    provider = "gemini";
  } else if (geminiApiKey) {
    provider = "gemini";
  } else if (openAiApiKey) {
    provider = "openai";
  }

  if (!provider) {
    return null;
  }

  if (provider === "gemini") {
    if (!geminiApiKey) {
      return null;
    }
    return {
      provider,
      apiKey: geminiApiKey,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    };
  }

  if (!openAiApiKey) {
    return null;
  }

  return {
    provider,
    apiKey: openAiApiKey,
    model: process.env.OPENAI_REPORT_MODEL?.trim() || "gpt-5.2",
  };
}

function pickTop<T>(items: T[] | null | undefined, limit = 5) {
  return (items ?? []).slice(0, limit);
}

function summarizeMemoryContent(content: string, limit = 900) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function pickMeaningfulPaidCampaigns(report: AuditReportPayload) {
  return (report.snapshot.paidMedia?.topCampaigns ?? [])
    .filter((campaign) => campaign.spend > 0 || campaign.clicks > 0 || campaign.purchases > 0)
    .slice(0, 5);
}

function buildReportBrief(
  report: AuditReportPayload,
  clientContext?:
    | (Pick<
        ClientRecord,
        "reportIntro" | "reportBenchmarks" | "referenceReportNotes"
      > & {
        reportMemories?: ReportMemoryRecord[];
        reportFeedback?: ReportFeedbackRecord[];
      })
    | null,
) {
  const objective = inferObjectiveForReport(report, clientContext);
  return {
    client: {
      name: report.clientName,
      industry: report.clientIndustryLabel,
      focus: report.reportFocus,
      internalIntro: clientContext?.reportIntro ?? null,
      benchmarks: clientContext?.reportBenchmarks ?? null,
      referenceReportNotes: clientContext?.referenceReportNotes ?? null,
      referenceExamples: pickTop(clientContext?.reportMemories, 3).map((memory) => ({
        title: memory.title,
        sourceClientName: memory.sourceClientName,
        periodLabel: memory.periodLabel,
        notes: memory.notes,
        excerpt: summarizeMemoryContent(memory.content),
      })),
      recentFeedback: pickTop(clientContext?.reportFeedback, 4).map((feedback) => ({
        rating: feedback.rating,
        notes: feedback.notes,
      })),
    },
    reportStyle: {
      audience: "client-facing",
      comparisonGoal: "explain the current month against the selected comparison month",
      writingGoal: "turn evidence into a concise executive narrative with business meaning",
      objective,
      avoid: [
        "mentioning CCIPA explicitly",
        "mentioning internal scoring systems",
        "presenting raw platform field names",
        "overstating certainty when evidence is incomplete",
        "copying old reports word-for-word",
        "echoing review feedback as if it were client-facing copy",
      ],
    },
    reportPeriod: {
      current: report.reportPeriod.periodKey,
      baseline: report.reportPeriod.baselinePeriodKey,
      generatedAt: report.generatedAt,
    },
    executiveSignals: {
      score: report.score,
      grade: report.grade,
      topRisks: report.summary.topRisks,
      strengths: report.summary.strengths,
      includedIntegrations: report.execution.includedIntegrations.map((integration) => ({
        label: integration.label,
        platformKey: integration.platformKey,
      })),
      excludedIntegrations: report.execution.excludedIntegrations,
      integrationCoverage: report.execution.coverage,
    },
    businessInputs: report.reportPeriod.manualInputs,
    traffic: report.snapshot.trafficAttribution
      ? {
          sessions: report.snapshot.trafficAttribution.sessions,
          conversionRate: report.snapshot.trafficAttribution.conversionRate,
          topChannels: pickTop(report.snapshot.trafficAttribution.topChannels),
          topSourceMediums: pickTop(report.snapshot.trafficAttribution.topSourceMediums),
          topLandingPages: pickTop(report.snapshot.trafficAttribution.topLandingPages),
        }
      : null,
    paidMedia: report.snapshot.paidMedia
      ? {
          objective: objective.kind,
          primaryConversionLabel: objective.primaryConversionLabel,
          sources: report.snapshot.paidMediaSources.map((source) => ({
            platformKey: source.platformKey,
            platformLabel: source.platformLabel,
            spend: source.spend,
            conversions: source.purchases,
            costPerConversion: costPerConversion(source),
            roas: source.roas,
            clicks: source.clicks,
            impressions: source.impressions,
            ctr: source.ctr,
          })),
          spend: report.snapshot.paidMedia.spend,
          conversions: report.snapshot.paidMedia.purchases,
          costPerConversion: costPerConversion(report.snapshot.paidMedia),
          roas: report.snapshot.paidMedia.roas,
          clicks: report.snapshot.paidMedia.clicks,
          impressions: report.snapshot.paidMedia.impressions,
          ctr: report.snapshot.paidMedia.ctr,
          topCampaigns: pickMeaningfulPaidCampaigns(report).map((campaign) => ({
            name: campaign.name,
            spend: campaign.spend,
            clicks: campaign.clicks,
            conversions: campaign.purchases,
            roas: campaign.roas,
            ctr: campaign.ctr,
          })),
        }
      : null,
    taskManagement: report.snapshot.taskManagement
      ? {
          provider: report.snapshot.taskManagement.provider,
          folderId: report.snapshot.taskManagement.folderId,
          folderName: report.snapshot.taskManagement.folderName,
          totalTasks: report.snapshot.taskManagement.totalTasks,
          activeTasks: report.snapshot.taskManagement.activeTasks,
          completedTasks: report.snapshot.taskManagement.completedTasks,
          overdueTasks: report.snapshot.taskManagement.overdueTasks,
          highImportanceTasks: report.snapshot.taskManagement.highImportanceTasks,
          recentlyUpdatedTasks: report.snapshot.taskManagement.recentlyUpdatedTasks.slice(0, 6),
          actionedTasks: (report.snapshot.taskManagement.actionedTasks ?? []).slice(0, 8),
          completedTasksInPeriod: (report.snapshot.taskManagement.completedTasksInPeriod ?? []).slice(0, 6),
          activeTasksTouchedInPeriod: (report.snapshot.taskManagement.activeTasksTouchedInPeriod ?? []).slice(0, 6),
          overdueOrBlockedTasks: (report.snapshot.taskManagement.overdueOrBlockedTasks ?? []).slice(0, 6),
        }
      : null,
    search: report.snapshot.search
      ? {
          clicks: report.snapshot.search.clicks,
          impressions: report.snapshot.search.impressions,
          ctr: report.snapshot.search.ctr,
          averagePosition: report.snapshot.search.averagePosition,
          topPages: pickTop(report.snapshot.search.topPages),
        }
      : null,
    findings: report.findings.slice(0, 6).map((finding) => ({
      summary: finding.summary,
      severity: finding.severityLabel,
      status: finding.statusLabel,
      recommendation: finding.recommendedAction,
      evidence: finding.evidence.slice(0, 3),
    })),
    context: report.providedContext.slice(0, 6),
    hypotheses: report.hypotheses.slice(0, 4),
    recommendations: report.recommendations.slice(0, 4),
    confidenceNotes: report.confidenceNotes,
  };
}

function extractResponseText(payload: Record<string, unknown>) {
  const direct = payload["output_text"];
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const output = Array.isArray(payload["output"]) ? payload["output"] : [];
  const texts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: Array<Record<string, unknown>> }).content
      : [];
    for (const entry of content) {
      if (entry?.type === "output_text" && typeof entry.text === "string") {
        texts.push(entry.text);
      }
    }
  }

  return texts.join("\n").trim();
}

function extractGeminiText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload["candidates"])
    ? (payload["candidates"] as Array<Record<string, unknown>>)
    : [];
  const texts: string[] = [];

  for (const candidate of candidates) {
    const content =
      candidate && typeof candidate === "object" && candidate["content"] && typeof candidate["content"] === "object"
        ? (candidate["content"] as Record<string, unknown>)
        : null;
    const parts = Array.isArray(content?.["parts"])
      ? (content?.["parts"] as Array<Record<string, unknown>>)
      : [];
    for (const part of parts) {
      if (typeof part?.["text"] === "string") {
        texts.push(part["text"]);
      }
    }
  }

  return texts.join("\n").trim();
}

const responseFormat = {
  type: "json_schema",
  name: "monthly_report_framework",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "executiveSummary",
      "clientEmailDraft",
      "whatHappened",
      "whyItHappened",
      "whatWeAreDoing",
      "ccipaPillars",
    ],
    properties: {
      executiveSummary: { type: "string" },
      clientEmailDraft: { type: "string" },
      whatHappened: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "evidence"],
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      whyItHappened: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "evidence"],
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      whatWeAreDoing: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "evidence"],
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            evidence: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      ccipaPillars: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "label", "status", "detail"],
          properties: {
            key: {
              type: "string",
              enum: ["clear", "concise", "insightful", "precise", "actionable"],
            },
            label: { type: "string" },
            status: {
              type: "string",
              enum: ["strong", "watch", "weak"],
            },
            detail: { type: "string" },
          },
        },
      },
    },
  },
} as const;

async function requestOpenAiFramework(
  apiKey: string,
  model: string,
  instructions: string,
  input: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      text: {
        format: responseFormat,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI report enhancement failed: ${errorText || response.statusText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return extractResponseText(payload);
}

async function requestGeminiFramework(
  apiKey: string,
  model: string,
  instructions: string,
  input: string,
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }],
        },
        contents: [
          {
            parts: [{ text: input }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: responseFormat.schema,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini report enhancement failed: ${errorText || response.statusText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return extractGeminiText(payload);
}

function buildInstructions(locale: AuditReportPayload["locale"]) {
  if (locale === "en") {
    return [
      "You are a senior performance strategist writing a client-facing monthly report.",
      "The agency must sound human, accountable, and specific. Write from a clear agency point of view without sounding defensive or robotic.",
      "Also produce a concise email draft the agency can send to the client, reusing the report's key result, explanation, and next action.",
      "Use the CCIPA framework internally to evaluate the narrative quality, but do not mention CCIPA in the output.",
      "Your output must answer three questions in order: what happened, why it happened, and what we are doing about it.",
      "Use the operator context as a priority source when explaining causality.",
      "If task-management context is provided, use it to connect recommendations to real agency follow-through, but do not expose internal task IDs unless they are useful client-visible references.",
      "Only treat live-ready integrations as performance evidence. Mention unavailable integrations only as data coverage limitations.",
      "Prioritize tasks touched during the report month over older task history when explaining what changed.",
      "Treat paid-media conversion metrics as the business's primary tracked conversions. Do not assume they are ecommerce purchases unless the brief explicitly confirms ecommerce.",
      "If the client is lead-generation focused, speak in terms of leads and cost per lead. Do not use ROAS as the headline performance lens unless the business is actually revenue-driven.",
      "Use internal notes as background guidance, but never quote them verbatim to the client unless they are already client-facing statements.",
      "If reference reports are provided, use them as style guidance only. Do not copy their language word-for-word.",
      "If review feedback is provided, use it to improve framing and clarity in this report.",
      "Write like a strategist speaking to a client, not like an analytics export.",
      "Reference the comparison month naturally when evidence supports it.",
      "Prefer business implications over reporting raw metrics without interpretation.",
      "Do not expose your reasoning process, investigative language, or internal analytical scaffolding in the output.",
      "Avoid phrases like 'most likely driver', 'investigation point', 'it appears', or other meta-analysis wording.",
      "Do not invent metrics, causes, or actions not supported by the supplied evidence.",
      "Keep language crisp, strategic, and client-ready.",
    ].join(" ");
  }

  return [
    "Você é um estrategista sênior de performance escrevendo um relatório mensal voltado ao cliente.",
    "A agência precisa soar humana, responsável e específica. Escreva com uma posição clara da agência, sem parecer defensivo ou robótico.",
    "Também gere um rascunho conciso de email que a agência possa enviar ao cliente, reutilizando o principal resultado, a explicação e o próximo passo do relatório.",
    "Use o framework CCIPA internamente para avaliar a qualidade da narrativa, mas não mencione CCIPA no texto final.",
    "A resposta deve seguir a ordem: o que aconteceu, por que aconteceu e o que estamos fazendo sobre isso.",
    "Use o contexto informado pelo operador como fonte prioritária para explicar causalidade.",
    "Se houver contexto de gestão de tarefas, use-o para conectar recomendações ao acompanhamento real da agência, mas não exponha IDs internos de tarefas a menos que sejam referências úteis para o cliente.",
    "Trate apenas integrações live-ready como evidência de performance. Mencione integrações indisponíveis somente como limitação de cobertura de dados.",
    "Priorize tarefas movimentadas durante o mês do relatório em vez de histórico antigo de tarefas ao explicar o que mudou.",
    "Trate os dados de conversão de mídia paga como a conversão principal acompanhada pelo negócio. Não assuma que são compras de ecommerce, a menos que o briefing confirme isso explicitamente.",
    "Se o cliente for focado em geração de leads, fale em leads e custo por lead. Não use ROAS como eixo principal da leitura, exceto quando o negócio realmente for orientado a receita.",
    "Use notas internas apenas como briefing de apoio e nunca as copie literalmente para o cliente, exceto quando já forem textos claramente client-facing.",
    "Se houver relatórios de referência, use-os apenas como guia de estilo e estrutura. Não copie o texto literalmente.",
    "Se houver feedbacks anteriores, use-os para melhorar clareza, framing e utilidade para o cliente.",
    "Escreva como um estrategista explicando o mês para um cliente, e não como uma exportação analítica.",
    "Faça referência ao mês comparativo de forma natural quando houver evidência para isso.",
    "Dê preferência a implicações de negócio em vez de despejar métricas sem interpretação.",
    "Não exponha processo de raciocínio, linguagem investigativa ou estruturas analíticas internas no texto final.",
    "Evite frases como 'provável driver', 'ponto em investigação', 'parece que' ou outras formulações metanalíticas.",
    "Não invente métricas, causas ou ações sem apoio nas evidências fornecidas.",
    "Escreva de forma clara, estratégica e pronta para cliente.",
  ].join(" ");
}

function normalizeFrameworkPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const next = payload as Record<string, unknown>;
  const normalizeItems = (value: unknown) =>
    Array.isArray(value)
      ? value.slice(0, 3).map((item) => {
          if (!item || typeof item !== "object") {
            return item;
          }
          const record = item as Record<string, unknown>;
          return {
            ...record,
            evidence: Array.isArray(record.evidence) ? record.evidence.slice(0, 4) : [],
          };
        })
      : [];

  return {
    ...next,
    clientEmailDraft: typeof next.clientEmailDraft === "string" ? next.clientEmailDraft : "",
    whatHappened: normalizeItems(next.whatHappened),
    whyItHappened: normalizeItems(next.whyItHappened),
    whatWeAreDoing: normalizeItems(next.whatWeAreDoing),
    ccipaPillars: Array.isArray(next.ccipaPillars) ? next.ccipaPillars.slice(0, 5) : [],
  };
}

export async function enhanceReportWithAi(
  report: AuditReportPayload,
  clientContext?:
    | (Pick<
        ClientRecord,
        "reportIntro" | "reportBenchmarks" | "referenceReportNotes"
      > & {
        reportMemories?: ReportMemoryRecord[];
        reportFeedback?: ReportFeedbackRecord[];
      })
    | null,
): Promise<AuditReportPayload> {
  const config = getReportAiConfig();
  if (!config) {
    return report;
  }

  const prompt = JSON.stringify(buildReportBrief(report, clientContext));
  const instructions = buildInstructions(report.locale);
  const outputText =
    config.provider === "gemini"
      ? await requestGeminiFramework(config.apiKey, config.model, instructions, prompt)
      : await requestOpenAiFramework(config.apiKey, config.model, instructions, prompt);
  if (!outputText) {
    throw new Error("AI report enhancement returned an empty response.");
  }

  const parsed = reportFrameworkSchema.parse(
    normalizeFrameworkPayload(JSON.parse(outputText)),
  ) as ParsedFramework;
  const framework: ReportFrameworkSections = {
    executiveSummary: parsed.executiveSummary,
    clientEmailDraft: parsed.clientEmailDraft,
    whatHappened: parsed.whatHappened,
    whyItHappened: parsed.whyItHappened,
    whatWeAreDoing: parsed.whatWeAreDoing,
    ccipaPillars: parsed.ccipaPillars as ReportFrameworkPillar[],
  };

  return {
    ...report,
    framework,
    confidenceNotes: [
      ...report.confidenceNotes,
      {
        label: report.locale === "en" ? "AI narrative synthesis applied" : "Síntese narrativa com IA aplicada",
        detail:
          report.locale === "en"
            ? `The narrative layer was generated with ${config.provider} / ${config.model} using the stored data and contextual evidence.`
            : `A camada narrativa foi gerada com ${config.provider} / ${config.model} usando os dados e o contexto registrados.`,
        level: "info",
      },
    ],
  };
}
