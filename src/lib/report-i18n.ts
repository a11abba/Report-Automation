import type {
  AuditFinding,
  ClientRecord,
  ReportLanguage,
  SectionScore,
} from "@/lib/audit/types";

type Primitive = number | string | boolean | null;

function paramsOf(finding: AuditFinding) {
  return finding.params as Record<string, Primitive>;
}

function formatNumber(locale: ReportLanguage, value: number) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale).format(value);
}

function formatPercent(locale: ReportLanguage, value: number, digits = 1) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function stringValue(params: Record<string, Primitive>, key: string) {
  const value = params[key];
  return value == null ? "" : String(value);
}

function numberValue(params: Record<string, Primitive>, key: string) {
  const value = params[key];
  return typeof value === "number" ? value : 0;
}

export const reportLabels = {
  en: {
    title: "Multi-Platform Growth Audit",
    generated: "Generated",
    score: "Score",
    grade: "Grade",
    findings: "Findings",
    locations: "Locations",
    topRisks: "Top Risks",
    strengths: "Strengths",
    section: "Section",
    scoreCol: "Score",
    notes: "Notes",
    snapshotHighlights: "Snapshot Highlights",
    acquisitionCrosswalk: "Acquisition Crosswalk",
    source: "Source",
    medium: "Medium",
    sessions: "Sessions",
    pageViews: "Page views",
    keyEvents: "Key events",
    revenue: "Sales value",
    share: "Share",
    organicCtr: "Organic CTR",
    averageRating: "Average rating",
    ga4ConversionRate: "GA4 conversion rate",
    websitePerformanceScore: "Website performance score",
    campaignOpenRate: "Campaign open rate",
    paidMediaSummary: "Paid media summary",
    spend: "Spend",
    impressions: "Impressions",
    reach: "Reach",
    clicks: "Clicks",
    ctr: "CTR",
    cpc: "CPC",
    cpm: "CPM",
    purchases: "Conversions",
    roas: "ROAS",
    costPerLead: "Cost per lead",
    costPerConversion: "Cost per conversion",
    reportFocus: "Report focus",
    reportPeriod: "Report period",
    baselinePeriod: "Baseline period",
    dataFacts: "Data Facts",
    providedContext: "Provided Context",
    hypotheses: "Hypotheses",
    recommendationsNarrative: "Recommendations",
    confidenceNotes: "Confidence Notes",
    executiveSummary: "Executive Summary",
    clientEmailDraft: "Client Email Draft",
    whatHappened: "What Happened",
    whyItHappened: "Why It Happened",
    whatWeAreDoing: "What We're Doing About It",
    ccipaScorecard: "CCIPA Scorecard",
    acquisitionMix: "Acquisition Mix",
    paidSpendByCampaign: "Paid Spend by Campaign",
    aiNarrative: "AI-enhanced narrative",
    noStrengths: "No major strengths were detected in this run.",
    healthyBaseline: "Healthy baseline.",
  },
  "pt-BR": {
    title: "Auditoria de Crescimento Multi-Plataforma",
    generated: "Gerado em",
    score: "Score",
    grade: "Nota",
    findings: "Achados",
    locations: "Unidades",
    topRisks: "Principais riscos",
    strengths: "Pontos fortes",
    section: "Seção",
    scoreCol: "Score",
    notes: "Observações",
    snapshotHighlights: "Destaques do snapshot",
    acquisitionCrosswalk: "Cruzamento de aquisição",
    source: "Fonte",
    medium: "Meio",
    sessions: "Sessões",
    pageViews: "Page views",
    keyEvents: "Eventos-chave",
    revenue: "Valor em vendas",
    share: "Participação",
    organicCtr: "CTR orgânico",
    averageRating: "Nota média",
    ga4ConversionRate: "Taxa de conversão do GA4",
    websitePerformanceScore: "Score de performance do site",
    campaignOpenRate: "Taxa de abertura de campanhas",
    paidMediaSummary: "Resumo de mídia paga",
    spend: "Investimento",
    impressions: "Impressões",
    reach: "Alcance",
    clicks: "Cliques",
    ctr: "CTR",
    cpc: "CPC",
    cpm: "CPM",
    purchases: "Conversões",
    roas: "ROAS",
    costPerLead: "Custo por lead",
    costPerConversion: "Custo por conversão",
    reportFocus: "Foco do relatório",
    reportPeriod: "Período do relatório",
    baselinePeriod: "Período base",
    dataFacts: "Fatos dos dados",
    providedContext: "Contexto informado",
    hypotheses: "Hipóteses",
    recommendationsNarrative: "Recomendações",
    confidenceNotes: "Notas de confiança",
    executiveSummary: "Resumo executivo",
    clientEmailDraft: "Rascunho de email ao cliente",
    whatHappened: "O que aconteceu",
    whyItHappened: "Por que aconteceu",
    whatWeAreDoing: "O que estamos fazendo sobre isso",
    ccipaScorecard: "Scorecard CCIPA",
    acquisitionMix: "Mix de aquisição",
    paidSpendByCampaign: "Investimento por campanha",
    aiNarrative: "Narrativa aprimorada com IA",
    noStrengths: "Nenhum ponto forte relevante foi detectado nesta execução.",
    healthyBaseline: "Base saudável.",
  },
  "pt-PT": {
    title: "Auditoria de Crescimento Multi-Plataforma",
    generated: "Gerado em",
    score: "Pontuação",
    grade: "Classificação",
    findings: "Achados",
    locations: "Localizações",
    topRisks: "Principais riscos",
    strengths: "Pontos fortes",
    section: "Secção",
    scoreCol: "Pontuação",
    notes: "Notas",
    snapshotHighlights: "Destaques do snapshot",
    acquisitionCrosswalk: "Cruzamento de aquisição",
    source: "Fonte",
    medium: "Meio",
    sessions: "Sessões",
    pageViews: "Page views",
    keyEvents: "Eventos-chave",
    revenue: "Valor em vendas",
    share: "Peso",
    organicCtr: "CTR orgânico",
    averageRating: "Classificação média",
    ga4ConversionRate: "Taxa de conversão do GA4",
    websitePerformanceScore: "Score de performance do site",
    campaignOpenRate: "Taxa de abertura de campanhas",
    paidMediaSummary: "Resumo de mídia paga",
    spend: "Investimento",
    impressions: "Impressões",
    reach: "Alcance",
    clicks: "Cliques",
    ctr: "CTR",
    cpc: "CPC",
    cpm: "CPM",
    purchases: "Conversões",
    roas: "ROAS",
    costPerLead: "Custo por lead",
    costPerConversion: "Custo por conversão",
    reportFocus: "Foco do relatório",
    reportPeriod: "Período do relatório",
    baselinePeriod: "Período base",
    dataFacts: "Fatos dos dados",
    providedContext: "Contexto informado",
    hypotheses: "Hipóteses",
    recommendationsNarrative: "Recomendações",
    confidenceNotes: "Notas de confiança",
    executiveSummary: "Resumo executivo",
    clientEmailDraft: "Rascunho de email ao cliente",
    whatHappened: "O que aconteceu",
    whyItHappened: "Porque aconteceu",
    whatWeAreDoing: "O que estamos a fazer sobre isto",
    ccipaScorecard: "Scorecard CCIPA",
    acquisitionMix: "Mix de aquisição",
    paidSpendByCampaign: "Investimento por campanha",
    aiNarrative: "Narrativa melhorada com IA",
    noStrengths: "Não foram detetados pontos fortes relevantes nesta execução.",
    healthyBaseline: "Base saudável.",
  },
} as const;

const sectionScoreLabels = {
  en: {
    channel_performance: "Channel Performance",
    deliverability: "Deliverability",
    automation_coverage: "Automation Coverage",
    audience_capture: "Audience Capture",
    data_quality: "Data Quality",
    integration_health: "Integration Health",
    commerce_revenue_attribution: "Commerce Revenue",
    crm_lifecycle_health: "CRM Lifecycle",
    seo_visibility: "SEO Visibility",
    local_presence_health: "Local Presence",
    reviews_reputation: "Reviews Reputation",
    website_performance: "Website Performance",
    technical_seo: "Technical SEO",
    traffic_quality: "Traffic Quality",
    paid_media_performance: "Paid Media",
  },
  "pt-BR": {
    channel_performance: "Performance de canal",
    deliverability: "Entregabilidade",
    automation_coverage: "Cobertura de automações",
    audience_capture: "Captação de audiência",
    data_quality: "Qualidade de dados",
    integration_health: "Saúde das integrações",
    commerce_revenue_attribution: "Receita de commerce",
    crm_lifecycle_health: "Lifecycle no CRM",
    seo_visibility: "Visibilidade orgânica",
    local_presence_health: "Presença local",
    reviews_reputation: "Reputação e avaliações",
    website_performance: "Performance do site",
    technical_seo: "SEO técnico",
    traffic_quality: "Qualidade do tráfego",
    paid_media_performance: "Mídia paga",
  },
  "pt-PT": {
    channel_performance: "Performance de canal",
    deliverability: "Entregabilidade",
    automation_coverage: "Cobertura de automações",
    audience_capture: "Captação de audiência",
    data_quality: "Qualidade dos dados",
    integration_health: "Saúde das integrações",
    commerce_revenue_attribution: "Receita de commerce",
    crm_lifecycle_health: "Lifecycle no CRM",
    seo_visibility: "Visibilidade orgânica",
    local_presence_health: "Presença local",
    reviews_reputation: "Reputação e avaliações",
    website_performance: "Performance do site",
    technical_seo: "SEO técnico",
    traffic_quality: "Qualidade do tráfego",
    paid_media_performance: "Mídia paga",
  },
} as const;

const findingSectionLabels = {
  en: {
    campaign_performance: "Campaign Performance",
    campaign_targeting: "Campaign Targeting",
    deliverability: "Deliverability",
    automated_flows: "Automated Flows",
    audience_growth: "Audience Growth",
    audience_segmentation: "Audience Segmentation",
    event_tracking: "Event Tracking",
    integrations: "Integrations",
    revenue_attribution: "Revenue Attribution",
    crm_lifecycle: "CRM Lifecycle",
    search_visibility: "Search Visibility",
    top_pages: "Top Pages",
    business_profile: "Business Profile",
    review_reputation: "Review Reputation",
    website_performance: "Website Performance",
    core_web_vitals: "Core Web Vitals",
    technical_seo: "Technical SEO",
    traffic_quality: "Traffic Quality",
    landing_pages: "Landing Pages",
    location_consistency: "Location Consistency",
    paid_media: "Paid Media",
  },
  "pt-BR": {
    campaign_performance: "Performance de campanhas",
    campaign_targeting: "Segmentação de campanhas",
    deliverability: "Entregabilidade",
    automated_flows: "Fluxos automatizados",
    audience_growth: "Crescimento de audiência",
    audience_segmentation: "Segmentação de audiência",
    event_tracking: "Rastreamento de eventos",
    integrations: "Integrações",
    revenue_attribution: "Atribuição de receita",
    crm_lifecycle: "Lifecycle no CRM",
    search_visibility: "Visibilidade orgânica",
    top_pages: "Páginas com maior volume",
    business_profile: "Google Business Profile",
    review_reputation: "Reputação de avaliações",
    website_performance: "Performance do site",
    core_web_vitals: "Core Web Vitals",
    technical_seo: "SEO técnico",
    traffic_quality: "Qualidade do tráfego",
    landing_pages: "Landing pages",
    location_consistency: "Consistência entre unidades",
    paid_media: "Mídia paga",
  },
  "pt-PT": {
    campaign_performance: "Performance de campanhas",
    campaign_targeting: "Segmentação de campanhas",
    deliverability: "Entregabilidade",
    automated_flows: "Fluxos automatizados",
    audience_growth: "Crescimento de audiência",
    audience_segmentation: "Segmentação de audiência",
    event_tracking: "Tracking de eventos",
    integrations: "Integrações",
    revenue_attribution: "Atribuição de receita",
    crm_lifecycle: "Lifecycle no CRM",
    search_visibility: "Visibilidade orgânica",
    top_pages: "Páginas com maior volume",
    business_profile: "Google Business Profile",
    review_reputation: "Reputação das avaliações",
    website_performance: "Performance do site",
    core_web_vitals: "Core Web Vitals",
    technical_seo: "SEO técnico",
    traffic_quality: "Qualidade do tráfego",
    landing_pages: "Landing pages",
    location_consistency: "Consistência entre localizações",
    paid_media: "Mídia paga",
  },
} as const;

const severityLabels = {
  en: { critical: "Critical", high: "High", medium: "Medium", low: "Low" },
  "pt-BR": { critical: "Crítico", high: "Alto", medium: "Médio", low: "Baixo" },
  "pt-PT": { critical: "Crítico", high: "Elevado", medium: "Médio", low: "Baixo" },
} as const;

const statusLabels = {
  en: { failing: "Failing", watch: "Watch", passing: "Passing", info: "Info" },
  "pt-BR": { failing: "Crítico", watch: "Atenção", passing: "Saudável", info: "Info" },
  "pt-PT": { failing: "Crítico", watch: "Atenção", passing: "Saudável", info: "Info" },
} as const;

const locationNoteLabels = {
  en: {
    rating_below_target: "Rating below target.",
    response_rate_low: "Review response rate is low.",
    performance_weak: "Local landing page performance is weak.",
    organic_ctr_low: "Local organic CTR is low.",
  },
  "pt-BR": {
    rating_below_target: "A nota está abaixo da meta.",
    response_rate_low: "A taxa de resposta às avaliações está baixa.",
    performance_weak: "A performance da landing page local está fraca.",
    organic_ctr_low: "O CTR orgânico local está baixo.",
  },
  "pt-PT": {
    rating_below_target: "A classificação está abaixo da meta.",
    response_rate_low: "A taxa de resposta às avaliações está baixa.",
    performance_weak: "A performance da landing page local está fraca.",
    organic_ctr_low: "O CTR orgânico local está baixo.",
  },
} as const;

export function localizeReportLabel(locale: ReportLanguage) {
  return reportLabels[locale];
}

export function localizeSectionScoreLabel(locale: ReportLanguage, sectionId: SectionScore["id"]) {
  return sectionScoreLabels[locale][sectionId as keyof typeof sectionScoreLabels[typeof locale]];
}

export function localizeLocationNotes(locale: ReportLanguage, notes: string[]) {
  return notes.map((note) => locationNoteLabels[locale][note as keyof typeof locationNoteLabels[typeof locale]] ?? note);
}

export function getClientIndustryLabel(client: ClientRecord, locale: ReportLanguage) {
  if ((locale === "pt-BR" || locale === "pt-PT") && client.industryLabelPt) {
    return client.industryLabelPt;
  }
  return client.industry;
}

function baseLocalizedFinding(locale: ReportLanguage, finding: AuditFinding) {
  return {
    section: findingSectionLabels[locale][finding.sectionKey as keyof typeof findingSectionLabels[typeof locale]] ?? finding.sectionKey,
    severityLabel: severityLabels[locale][finding.severity],
    statusLabel: statusLabels[locale][finding.status],
  };
}

function ptBrMessage(finding: AuditFinding) {
  const params = paramsOf(finding);
  const pct = (key: string, digits = 1) => formatPercent("pt-BR", numberValue(params, key), digits);
  const num = (key: string) => formatNumber("pt-BR", numberValue(params, key));
  const text = (key: string) => stringValue(params, key);

  switch (finding.code) {
    case "channel.open-rate":
      return ["A taxa de abertura das campanhas está abaixo da linha de base de 25%.", "Revise a qualidade das linhas de assunto, o frescor da audiência e a estratégia de frequência.", [`Taxa de abertura observada: ${pct("openRate")}`]] as const;
    case "channel.open-rate.healthy":
      return ["A taxa de abertura das campanhas está saudável para o mix de envios atual.", "Proteja a qualidade da lista e mantenha uma cadência consistente de testes.", [`Taxa de abertura observada: ${pct("openRate")}`]] as const;
    case "channel.click-rate":
      return ["A taxa de cliques está abaixo do esperado em relação à taxa de abertura.", "Ajuste a hierarquia dos CTAs e melhore o encaixe entre oferta e audiência.", [`Taxa de cliques observada: ${pct("clickRate", 2)}`]] as const;
    case "channel.exclusions":
      return ["Nenhuma exclusão está sendo usada nas campanhas.", "Introduza controles de fadiga e regras de supressão para compradores recentes.", ["A taxa de uso de exclusões está em 0%."]] as const;
    case "deliverability.bounce":
      return ["A taxa de bounce está acima do limite recomendado.", "Audite imediatamente a higiene da lista e a qualidade das origens de captação.", [`Bounce observado: ${pct("bounceRate", 2)}`]] as const;
    case "automation.coverage":
      return ["A cobertura de automações está abaixo da jornada de lifecycle desejada.", "Priorize os fluxos ausentes de retenção e geração de receita.", [`Cobertura atual: ${pct("requiredCoverageRate", 0)}`, `Perfis ausentes: ${text("missingFlowProfiles") || "nenhum"}`]] as const;
    case "automation.manual":
      return ["Há uma ou mais automações pausadas ou em modo manual.", "Revise se os fluxos pausados devem ser reativados, reconstruídos ou aposentados.", [`Fluxos manuais: ${num("manualCount")}`]] as const;
    case "audience.forms":
      return ["Não há formulários ativos para sustentar o crescimento da audiência própria.", "Lance pelo menos uma experiência de captura com alta intenção.", ["Quantidade de formulários ativos: 0"]] as const;
    case "audience.segments":
      return ["A biblioteca de segmentos é rasa demais para uma personalização madura.", "Crie segmentos de lifecycle, engajamento e valor.", [`Total de segmentos: ${num("totalSegments")}`]] as const;
    case "data.placed-order":
      return ["O rastreamento de Placed Order está ausente.", "Repare a ingestão dos eventos de compra antes de confiar no relatório de receita.", ["Evento Placed Order não detectado."]] as const;
    case "data.viewed-product":
      return ["O rastreamento de Viewed Product está ausente.", "Restaure a cobertura do evento de visualização de produto para automações por navegação.", ["Evento Viewed Product não detectado."]] as const;
    case "integration.health":
      return ["Uma ou mais integrações conectadas estão com problema.", "Reconecte os apps com falha e valide os escopos antes de confiar nas saídas.", [`Integrações saudáveis: ${num("healthyCount")}/${num("activeCount")}`]] as const;
    case "commerce.automation-share.low":
      return ["O negócio está dependente demais de campanhas para receita atribuída.", "Fortaleça as automações always-on antes de aumentar a frequência de campanhas.", [`Participação da automação na receita: ${pct("automationRevenueShare", 0)}`]] as const;
    case "crm.lifecycle.coverage":
      return ["A cobertura de estágios de lifecycle está insuficiente para uma orquestração confiável no CRM.", "Padronize o mapeamento de lifecycle stages e faça backfill dos registros sem categorização.", [`Cobertura de lifecycle: ${pct("lifecycleStageCoverageRate", 0)}`]] as const;
    case "seo.ctr":
      return ["O CTR orgânico está baixo em relação ao volume atual de impressões.", "Melhore títulos e metas para as páginas e consultas com maior volume de impressões.", [`CTR: ${pct("ctr", 2)}`, `Impressões: ${num("impressions")}`]] as const;
    case "seo.position":
      return ["A posição orgânica média está fora do benchmark de primeira página.", "Reforce o linking interno e a otimização on-page das páginas prioritárias.", [`Posição média: ${text("averagePosition")}`]] as const;
    case "seo.page-ctr":
      return ["Uma página com muitas impressões está performando mal em CTR.", "Atualize a copy de SERP e alinhe a promessa da página com a intenção de busca.", [`${text("page")}: ${num("pageImpressions")} impressões, ${pct("pageCtr", 2)} de CTR`]] as const;
    case "local.completion":
      return ["Os perfis do Google Business Profile não estão completos de forma consistente.", "Complete campos centrais, categorias, atributos, fotos e posts em todas as unidades.", [`Taxa média de completude: ${pct("averageCompletionRate", 0)}`]] as const;
    case "local.photos":
      return ["Os perfis das unidades precisam de cobertura de fotos mais atual e mais completa.", "Padronize uma cadência de publicação de fotos em todas as unidades.", [`Cobertura de fotos: ${pct("photoCoverageRate", 0)}`]] as const;
    case "reviews.rating":
      return ["A nota média está abaixo do benchmark ideal de confiança.", "Reforce a geração de avaliações e acelere a resposta a problemas de serviço.", [`Nota média: ${text("averageRating")}`]] as const;
    case "reviews.response":
      return ["Muitas avaliações estão ficando sem resposta.", "Crie um SLA de resposta a avaliações para todos os perfis.", [`Taxa de resposta: ${pct("responseRate", 0)}`]] as const;
    case "website.speed":
      return ["A performance da página está abaixo do limite ideal.", "Melhore velocidade de renderização, peso dos assets e bloqueios na main thread.", [`Score de performance: ${text("pageSpeedScore")}`]] as const;
    case "website.lcp":
      return ["O Largest Contentful Paint está mais lento do que o recomendado.", "Otimize mídia do hero, cache e resposta do servidor nas páginas prioritárias.", [`LCP: ${text("largestContentfulPaintMs")} ms`]] as const;
    case "website.links":
      return ["O crawl encontrou links quebrados ou malformados.", "Corrija links quebrados e remova padrões de href provisórios.", [`Quantidade de links com problema: ${num("brokenLinkCount")}`]] as const;
    case "website.titles":
      return ["A cobertura de títulos está incompleta nas páginas rastreadas.", "Garanta que cada página importante tenha um title único e descritivo.", [`Cobertura de títulos: ${pct("titleCoverageRate", 0)}`]] as const;
    case "website.discovery":
      return ["Os arquivos básicos de descoberta para busca estão incompletos.", "Publique e valide o robots.txt e o sitemap.xml.", [`robots.txt: ${params.hasRobotsTxt ? "presente" : "ausente"}`, `sitemap.xml: ${params.hasSitemapXml ? "presente" : "ausente"}`]] as const;
    case "traffic.conversion":
      return ["O volume de tráfego não está convertendo de forma eficiente.", "Revise o encaixe de intenção, o tracking e a UX de conversão nas páginas principais.", [`Taxa de conversão: ${pct("conversionRate", 2)}`]] as const;
    case "traffic.dependency":
      return ["A aquisição está excessivamente dependente de um único canal.", "Amplie a cobertura de aquisição e reduza a concentração de tráfego.", [`${text("channel")}: ${pct("channelShare", 0)} de participação`]] as const;
    case "traffic.landing-page":
      return ["Uma landing page com alto tráfego apresenta engajamento fraco.", "Melhore clareza above the fold, velocidade e aderência de intenção nessa página.", [`${text("path")}: ${pct("engagementRate", 0)} de engajamento`]] as const;
    case "paid.no-purchases":
      return ["Há investimento em mídia paga sem conversões atribuídas no período.", "Revise tracking, objetivo de campanha e aderência da oferta antes de escalar o orçamento.", [`Investimento: ${num("spend")}`, `Conversões: ${num("purchases")}`]] as const;
    case "paid.ctr":
      return ["O CTR das campanhas pagas está abaixo do esperado para o volume atual de impressões.", "Teste novos criativos, ângulos de copy e segmentos para elevar a taxa de clique.", [`CTR: ${pct("ctr", 2)}`, `Impressões: ${num("impressions")}`]] as const;
    case "paid.roas":
      return ["O ROAS está abaixo da faixa desejada para o volume investido.", "Realoque verba para campanhas eficientes e revise landing pages, oferta e evento de conversão.", [`ROAS: ${text("roas")}`, `Investimento: ${num("spend")}`]] as const;
    case "paid.concentration":
      return ["A conta está dependente demais de uma única campanha paga.", "Diversifique os conjuntos ativos para reduzir risco de fadiga e volatilidade de performance.", [`${text("campaign")}: ${pct("spendShare", 0)} do investimento`]] as const;
    case "paid.campaign-efficiency":
      return ["Uma campanha relevante está consumindo verba com eficiência abaixo da média da conta.", "Revise segmentação, termos, mensagem e landing page dessa campanha antes de manter o investimento atual.", [`${text("campaign")}: ROAS ${text("roas")} versus ${text("accountRoas")} da conta`, `${pct("spendShare", 0)} do investimento total`]] as const;
    case "locations.consistency":
      return ["Há variações relevantes de performance entre as unidades.", "Use a unidade com melhor desempenho como padrão operacional para as demais.", text("locationSummary").split(" || ").filter(Boolean)] as const;
    default:
      return [finding.summary, finding.recommendedAction, finding.evidence] as const;
  }
}

function ptPtMessage(finding: AuditFinding) {
  const params = paramsOf(finding);
  const pct = (key: string, digits = 1) => formatPercent("pt-PT", numberValue(params, key), digits);
  const num = (key: string) => formatNumber("pt-PT", numberValue(params, key));
  const text = (key: string) => stringValue(params, key);

  switch (finding.code) {
    case "channel.open-rate":
      return ["A taxa de abertura das campanhas está abaixo da linha de base de 25%.", "Reveja a qualidade das linhas de assunto, a frescura da audiência e a estratégia de frequência.", [`Taxa de abertura observada: ${pct("openRate")}`]] as const;
    case "channel.open-rate.healthy":
      return ["A taxa de abertura das campanhas está saudável para o mix de envios atual.", "Proteja a qualidade da base e mantenha uma cadência consistente de testes.", [`Taxa de abertura observada: ${pct("openRate")}`]] as const;
    case "channel.click-rate":
      return ["A taxa de cliques está abaixo do esperado face à taxa de abertura.", "Ajuste a hierarquia dos CTAs e melhore o alinhamento entre oferta e audiência.", [`Taxa de cliques observada: ${pct("clickRate", 2)}`]] as const;
    case "channel.exclusions":
      return ["Não estão a ser usadas exclusões nas campanhas.", "Introduza controlos de fadiga e regras de supressão para compradores recentes.", ["A taxa de utilização de exclusões está em 0%."]] as const;
    case "deliverability.bounce":
      return ["A taxa de bounce está acima do limite recomendado.", "Audite de imediato a higiene da lista e a qualidade das origens de captação.", [`Bounce observado: ${pct("bounceRate", 2)}`]] as const;
    case "automation.coverage":
      return ["A cobertura de automações está abaixo do percurso de lifecycle desejado.", "Priorize os fluxos em falta de retenção e geração de receita.", [`Cobertura atual: ${pct("requiredCoverageRate", 0)}`, `Perfis em falta: ${text("missingFlowProfiles") || "nenhum"}`]] as const;
    case "automation.manual":
      return ["Existe uma ou mais automações em pausa ou em modo manual.", "Reveja se os fluxos em pausa devem ser reativados, reconstruídos ou retirados.", [`Fluxos manuais: ${num("manualCount")}`]] as const;
    case "audience.forms":
      return ["Não existem formulários ativos para sustentar o crescimento da audiência própria.", "Lance pelo menos uma experiência de captação de elevada intenção.", ["Quantidade de formulários ativos: 0"]] as const;
    case "audience.segments":
      return ["A biblioteca de segmentos é demasiado limitada para uma personalização madura.", "Crie segmentos de lifecycle, engagement e valor.", [`Total de segmentos: ${num("totalSegments")}`]] as const;
    case "data.placed-order":
      return ["O tracking de Placed Order está em falta.", "Repare a ingestão dos eventos de compra antes de confiar no relatório de receita.", ["Evento Placed Order não detetado."]] as const;
    case "data.viewed-product":
      return ["O tracking de Viewed Product está em falta.", "Restaure a cobertura do evento de visualização de produto para automações de navegação.", ["Evento Viewed Product não detetado."]] as const;
    case "integration.health":
      return ["Uma ou mais integrações ligadas apresentam problemas.", "Volte a ligar as apps com falha e valide os scopes antes de confiar nas saídas.", [`Integrações saudáveis: ${num("healthyCount")}/${num("activeCount")}`]] as const;
    case "commerce.automation-share.low":
      return ["O negócio está excessivamente dependente de campanhas para receita atribuída.", "Reforce as automações always-on antes de aumentar a frequência de campanhas.", [`Peso da automação na receita: ${pct("automationRevenueShare", 0)}`]] as const;
    case "crm.lifecycle.coverage":
      return ["A cobertura dos estágios de lifecycle é insuficiente para uma orquestração fiável no CRM.", "Normalize o mapeamento dos lifecycle stages e faça backfill dos registos sem categorização.", [`Cobertura de lifecycle: ${pct("lifecycleStageCoverageRate", 0)}`]] as const;
    case "seo.ctr":
      return ["O CTR orgânico está baixo face ao volume atual de impressões.", "Melhore títulos e metas para as páginas e consultas com maior volume de impressões.", [`CTR: ${pct("ctr", 2)}`, `Impressões: ${num("impressions")}`]] as const;
    case "seo.position":
      return ["A posição orgânica média está fora do benchmark de primeira página.", "Reforce a ligação interna e a otimização on-page das páginas prioritárias.", [`Posição média: ${text("averagePosition")}`]] as const;
    case "seo.page-ctr":
      return ["Uma página com muitas impressões está a ter fraco desempenho em CTR.", "Atualize a copy de SERP e alinhe a promessa da página com a intenção de pesquisa.", [`${text("page")}: ${num("pageImpressions")} impressões, ${pct("pageCtr", 2)} de CTR`]] as const;
    case "local.completion":
      return ["Os perfis do Google Business Profile não estão completos de forma consistente.", "Complete os campos nucleares, categorias, atributos, fotografias e publicações em todas as localizações.", [`Taxa média de completude: ${pct("averageCompletionRate", 0)}`]] as const;
    case "local.photos":
      return ["Os perfis das localizações precisam de uma cobertura de fotografias mais atual e completa.", "Normalize uma cadência de publicação de fotografias em todas as localizações.", [`Cobertura de fotografias: ${pct("photoCoverageRate", 0)}`]] as const;
    case "reviews.rating":
      return ["A classificação média está abaixo do benchmark ideal de confiança.", "Reforce a geração de avaliações e acelere a resposta a problemas de serviço.", [`Classificação média: ${text("averageRating")}`]] as const;
    case "reviews.response":
      return ["Demasiadas avaliações estão a ficar sem resposta.", "Crie um SLA para responder a avaliações em todos os perfis.", [`Taxa de resposta: ${pct("responseRate", 0)}`]] as const;
    case "website.speed":
      return ["A performance da página está abaixo do limiar ideal.", "Melhore a velocidade de renderização, o peso dos assets e os bloqueios na main thread.", [`Score de performance: ${text("pageSpeedScore")}`]] as const;
    case "website.lcp":
      return ["O Largest Contentful Paint está mais lento do que o recomendado.", "Otimize a media do hero, a cache e a resposta do servidor nas páginas prioritárias.", [`LCP: ${text("largestContentfulPaintMs")} ms`]] as const;
    case "website.links":
      return ["O crawl encontrou links quebrados ou malformados.", "Corrija links quebrados e remova padrões de href provisórios.", [`Quantidade de links com problema: ${num("brokenLinkCount")}`]] as const;
    case "website.titles":
      return ["A cobertura de títulos está incompleta nas páginas rastreadas.", "Garanta que cada página importante tenha um title único e descritivo.", [`Cobertura de títulos: ${pct("titleCoverageRate", 0)}`]] as const;
    case "website.discovery":
      return ["Os ficheiros básicos de descoberta para pesquisa estão incompletos.", "Publique e valide o robots.txt e o sitemap.xml.", [`robots.txt: ${params.hasRobotsTxt ? "presente" : "ausente"}`, `sitemap.xml: ${params.hasSitemapXml ? "presente" : "ausente"}`]] as const;
    case "traffic.conversion":
      return ["O volume de tráfego não está a converter de forma eficiente.", "Reveja o alinhamento de intenção, o tracking e a UX de conversão nas páginas principais.", [`Taxa de conversão: ${pct("conversionRate", 2)}`]] as const;
    case "traffic.dependency":
      return ["A aquisição está excessivamente dependente de um único canal.", "Alargue a cobertura de aquisição e reduza a concentração de tráfego.", [`${text("channel")}: ${pct("channelShare", 0)} de peso`]] as const;
    case "traffic.landing-page":
      return ["Uma landing page com muito tráfego apresenta um engagement fraco.", "Melhore a clareza above the fold, a velocidade e o alinhamento de intenção nessa página.", [`${text("path")}: ${pct("engagementRate", 0)} de engagement`]] as const;
    case "paid.no-purchases":
      return ["Existe investimento em mídia paga sem conversões atribuídas no período.", "Reveja o tracking, o objetivo da campanha e o alinhamento da oferta antes de escalar orçamento.", [`Investimento: ${num("spend")}`, `Conversões: ${num("purchases")}`]] as const;
    case "paid.ctr":
      return ["O CTR das campanhas pagas está abaixo do esperado para o volume atual de impressões.", "Teste novos criativos, ângulos de copy e segmentos para elevar a taxa de clique.", [`CTR: ${pct("ctr", 2)}`, `Impressões: ${num("impressions")}`]] as const;
    case "paid.roas":
      return ["O ROAS está abaixo da faixa desejada para o volume investido.", "Realoque orçamento para campanhas eficientes e reveja landing pages, oferta e evento de conversão.", [`ROAS: ${text("roas")}`, `Investimento: ${num("spend")}`]] as const;
    case "paid.concentration":
      return ["A conta está excessivamente dependente de uma única campanha paga.", "Diversifique os conjuntos ativos para reduzir o risco de fadiga e volatilidade de performance.", [`${text("campaign")}: ${pct("spendShare", 0)} do investimento`]] as const;
    case "paid.campaign-efficiency":
      return ["Uma campanha relevante está a consumir investimento com eficiência abaixo da média da conta.", "Reveja segmentação, termos, mensagem e landing page dessa campanha antes de manter o nível atual de investimento.", [`${text("campaign")}: ROAS ${text("roas")} versus ${text("accountRoas")} da conta`, `${pct("spendShare", 0)} do investimento total`]] as const;
    case "locations.consistency":
      return ["Existem variações relevantes de performance entre localizações.", "Use a localização com melhor desempenho como padrão operacional para as restantes.", text("locationSummary").split(" || ").filter(Boolean)] as const;
    default:
      return [finding.summary, finding.recommendedAction, finding.evidence] as const;
  }
}

function enMessage(finding: AuditFinding) {
  const params = paramsOf(finding);
  const pct = (key: string, digits = 1) => formatPercent("en", numberValue(params, key), digits);
  const num = (key: string) => formatNumber("en", numberValue(params, key));
  const text = (key: string) => stringValue(params, key);

  switch (finding.code) {
    case "channel.open-rate":
      return ["Campaign open rate is under the 25% baseline.", "Review subject line quality, audience freshness, and frequency strategy.", [`Observed open rate: ${pct("openRate")}`]] as const;
    case "channel.open-rate.healthy":
      return ["Campaign open rate is healthy for the current send mix.", "Protect list quality and keep testing cadence steady.", [`Observed open rate: ${pct("openRate")}`]] as const;
    case "channel.click-rate":
      return ["Click rate is lagging behind the open rate.", "Tighten CTA hierarchy and improve offer-to-audience fit.", [`Observed click rate: ${pct("clickRate", 2)}`]] as const;
    case "channel.exclusions":
      return ["No campaign exclusions are being used.", "Introduce fatigue controls and recent-purchaser suppression logic.", ["Exclusion usage rate is currently 0%."]] as const;
    case "deliverability.bounce":
      return ["Bounce rate is above the recommended threshold.", "Audit list hygiene and source quality immediately.", [`Observed bounce rate: ${pct("bounceRate", 2)}`]] as const;
    case "automation.coverage":
      return ["Automation coverage is below the target lifecycle footprint.", "Prioritize missing retention and revenue flows.", [`Coverage rate: ${pct("requiredCoverageRate", 0)}`, `Missing profiles: ${text("missingFlowProfiles") || "none"}`]] as const;
    case "automation.manual":
      return ["One or more automations are paused or in manual mode.", "Review whether paused flows should be relaunched, rebuilt, or retired.", [`Manual flows: ${num("manualCount")}`]] as const;
    case "audience.forms":
      return ["No live forms are available to drive owned audience growth.", "Launch at least one high-intent capture experience.", ["Live form count: 0"]] as const;
    case "audience.segments":
      return ["Segment library is too shallow for mature personalization.", "Create lifecycle, engagement, and value-based segments.", [`Total segments: ${num("totalSegments")}`]] as const;
    case "data.placed-order":
      return ["Placed Order tracking is missing.", "Repair commerce event ingestion before trusting revenue reporting.", ["Placed Order event not detected."]] as const;
    case "data.viewed-product":
      return ["Viewed Product tracking is missing.", "Restore product-view event coverage for browse-triggered automation.", ["Viewed Product event not detected."]] as const;
    case "integration.health":
      return ["One or more connected integrations are unhealthy.", "Reconnect failing apps and verify scopes before relying on outputs.", [`Healthy integrations: ${num("healthyCount")}/${num("activeCount")}`]] as const;
    case "commerce.automation-share.low":
      return ["The business is overly dependent on campaigns for attributed revenue.", "Strengthen always-on automation before increasing campaign frequency.", [`Automation revenue share: ${pct("automationRevenueShare", 0)}`]] as const;
    case "crm.lifecycle.coverage":
      return ["Lifecycle stage coverage is too sparse for reliable CRM orchestration.", "Standardize lifecycle stage mapping and backfill uncategorized records.", [`Lifecycle stage coverage: ${pct("lifecycleStageCoverageRate", 0)}`]] as const;
    case "seo.ctr":
      return ["Organic CTR is low relative to current impression volume.", "Improve title/meta messaging for high-impression pages and queries.", [`CTR: ${pct("ctr", 2)}`, `Impressions: ${num("impressions")}`]] as const;
    case "seo.position":
      return ["Average organic position is outside the first page benchmark.", "Strengthen internal linking and on-page optimization for priority pages.", [`Average position: ${text("averagePosition")}`]] as const;
    case "seo.page-ctr":
      return ["A high-impression page is underperforming on click-through rate.", "Refresh the SERP copy and align the page promise with search intent.", [`${text("page")}: ${num("pageImpressions")} impressions, ${pct("pageCtr", 2)} CTR`]] as const;
    case "local.completion":
      return ["Business Profiles are not consistently complete.", "Complete core fields, categories, attributes, photos, and posts across locations.", [`Average completion rate: ${pct("averageCompletionRate", 0)}`]] as const;
    case "local.photos":
      return ["Location profiles need fresher and more complete photo coverage.", "Standardize photo publishing cadence across locations.", [`Photo coverage rate: ${pct("photoCoverageRate", 0)}`]] as const;
    case "reviews.rating":
      return ["Average rating is below the ideal trust benchmark.", "Strengthen review generation and surface service issues faster.", [`Average rating: ${text("averageRating")}`]] as const;
    case "reviews.response":
      return ["Too many reviews are going unanswered.", "Create an SLA for replying to reviews across all profiles.", [`Response rate: ${pct("responseRate", 0)}`]] as const;
    case "website.speed":
      return ["Page performance is below the ideal threshold.", "Improve rendering speed, asset weight, and main-thread blocking.", [`PageSpeed score: ${text("pageSpeedScore")}`]] as const;
    case "website.lcp":
      return ["Largest Contentful Paint is slower than recommended.", "Optimize hero media, caching, and server response for top landing pages.", [`LCP: ${text("largestContentfulPaintMs")} ms`]] as const;
    case "website.links":
      return ["The crawl found broken or malformed links.", "Repair broken links and remove placeholder href patterns.", [`Broken link count: ${num("brokenLinkCount")}`]] as const;
    case "website.titles":
      return ["Title coverage is incomplete on crawled pages.", "Ensure every important page has a unique, descriptive title tag.", [`Title coverage: ${pct("titleCoverageRate", 0)}`]] as const;
    case "website.discovery":
      return ["Search discovery files are incomplete.", "Publish and validate robots.txt and sitemap.xml for search discovery.", [`robots.txt: ${params.hasRobotsTxt ? "present" : "missing"}`, `sitemap.xml: ${params.hasSitemapXml ? "present" : "missing"}`]] as const;
    case "traffic.conversion":
      return ["Traffic volume is not converting efficiently.", "Review landing page intent match, tracking, and conversion UX on core pages.", [`Conversion rate: ${pct("conversionRate", 2)}`]] as const;
    case "traffic.dependency":
      return ["The acquisition mix is overly dependent on one channel.", "Broaden acquisition coverage and de-risk traffic concentration.", [`${text("channel")}: ${pct("channelShare", 0)} share`]] as const;
    case "traffic.landing-page":
      return ["A high-traffic landing page has weak engagement.", "Improve above-the-fold clarity, load performance, and intent match on that page.", [`${text("path")}: ${pct("engagementRate", 0)} engagement`]] as const;
    case "paid.no-purchases":
      return ["Paid media spend is generating no attributed conversions in the selected period.", "Review tracking, campaign objective, and offer-to-audience fit before scaling budget.", [`Spend: ${num("spend")}`, `Conversions: ${num("purchases")}`]] as const;
    case "paid.ctr":
      return ["Paid campaign click-through rate is weak for the current impression volume.", "Test stronger creative angles, hooks, and audiences to improve click intent.", [`CTR: ${pct("ctr", 2)}`, `Impressions: ${num("impressions")}`]] as const;
    case "paid.roas":
      return ["ROAS is below the target band for the current spend level.", "Shift budget toward efficient campaigns and review landing pages, offer framing, and conversion tracking.", [`ROAS: ${text("roas")}`, `Spend: ${num("spend")}`]] as const;
    case "paid.concentration":
      return ["The ad account is over-dependent on a single paid campaign.", "Diversify active campaigns to reduce fatigue risk and performance volatility.", [`${text("campaign")}: ${pct("spendShare", 0)} of spend`]] as const;
    case "paid.campaign-efficiency":
      return ["A meaningful campaign is consuming budget with efficiency below the account average.", "Review targeting, search terms, messaging, and landing page fit before keeping the current spend level on this campaign.", [`${text("campaign")}: ROAS ${text("roas")} versus account ROAS ${text("accountRoas")}`, `${pct("spendShare", 0)} of total spend`]] as const;
    case "locations.consistency":
      return ["Performance varies meaningfully across locations.", "Use the strongest location as the operating standard for weaker profiles.", text("locationSummary").split(" || ").filter(Boolean)] as const;
    default:
      return [finding.summary, finding.recommendedAction, finding.evidence] as const;
  }
}

export function localizeFinding(locale: ReportLanguage, finding: AuditFinding): AuditFinding {
  const base = baseLocalizedFinding(locale, finding);
  const [summary, recommendedAction, evidence] =
    locale === "pt-BR" ? ptBrMessage(finding) :
    locale === "pt-PT" ? ptPtMessage(finding) :
    enMessage(finding);

  return {
    ...finding,
    ...base,
    summary,
    recommendedAction,
    evidence: [...evidence],
  };
}
