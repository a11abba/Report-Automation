import { accessSync, constants } from "node:fs";
import { chromium } from "playwright";
import { type AuditReportPayload } from "@/lib/audit/types";
import { deriveHeadlineMetrics } from "@/lib/report-metrics";
import {
  campaignCostPerConversion,
  costPerConversion,
  inferObjectiveForReport,
} from "@/lib/report-objective";
import { getReportFocusLabel } from "./report-focus";
import { localizeReportLabel } from "./report-i18n";

function formatPercent(locale: AuditReportPayload["locale"], value: number | null | undefined) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNumber(
  locale: AuditReportPayload["locale"],
  value: number | null | undefined,
  digits = 0,
) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sanitizeNarrativeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/most likely driver:\s*/gi, "")
    .replace(/next action:\s*/gi, "")
    .replace(/principal explicação:\s*/gi, "")
    .replace(/próximo passo:\s*/gi, "")
    .replace(/this is a likely driver behind the period's result set\.?/gi, "")
    .replace(/esse contexto é um provável fator por trás do resultado do período\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeNarrativeTitle(value: string | null | undefined) {
  const next = value ?? "";
  if (/open investigation point/i.test(next) || /ponto em investigacao/i.test(next)) {
    return "Context note";
  }
  if (/operator note/i.test(next) || /nota operacional/i.test(next)) {
    return "Business context";
  }
  return next;
}

function getClientVisibleConfidenceNotes(report: AuditReportPayload) {
  return report.confidenceNotes.filter(
    (note) => !/\b(ai|ia)\b/i.test(`${note.label} ${note.detail}`),
  );
}

function renderBarChartCard({
  title,
  items,
  valueFormatter,
}: {
  title: string;
  items: Array<{ label: string; value: number; detail: string }>;
  valueFormatter: (value: number) => string;
}) {
  if (items.length === 0) {
    return "";
  }

  const width = 620;
  const labelX = 24;
  const barX = 210;
  const barWidth = 330;
  const valueX = 570;
  const rowHeight = 62;
  const chartTop = 46;
  const height = chartTop + items.length * rowHeight;
  const maxValue = Math.max(...items.map((item) => item.value), 0);
  const gradientPrefix = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");

  const rows = items
    .map((item, index) => {
      const y = chartTop + index * rowHeight;
      const barLength = maxValue > 0 ? Math.max((item.value / maxValue) * barWidth, 12) : 12;
      const gradientId = `${gradientPrefix}-${index}`;
      return `
        <text x="${labelX}" y="${y}" fill="#f8fbff" font-size="14" font-weight="600">${escapeHtml(item.label)}</text>
        <text x="${labelX}" y="${y + 18}" fill="#7f92ac" font-size="11">${escapeHtml(item.detail)}</text>
        <rect x="${barX}" y="${y - 12}" width="${barWidth}" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
        <rect x="${barX}" y="${y - 12}" width="${barLength}" height="10" rx="5" fill="url(#${gradientId})" />
        <text x="${valueX}" y="${y}" text-anchor="end" fill="#f0c56c" font-size="13" font-weight="700">${escapeHtml(valueFormatter(item.value))}</text>
        <defs>
          <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f3c15b" />
            <stop offset="100%" stop-color="#47bf8f" />
          </linearGradient>
        </defs>
      `;
    })
    .join("");

  return `
    <article class="chart-card">
      <div class="story-kicker">${escapeHtml(title)}</div>
      <svg class="chart-shell" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
        ${rows}
      </svg>
    </article>
  `;
}

export function getPdfRendererStatus() {
  try {
    accessSync(chromium.executablePath(), constants.F_OK);
    return {
      available: true,
      message: "Playwright Chromium is ready.",
    };
  } catch {
    return {
      available: false,
      message: "Playwright Chromium is missing. Run `npx playwright install chromium` to enable PDF export.",
    };
  }
}

export function renderReportHtml(report: AuditReportPayload): string {
  const labels = localizeReportLabel(report.locale);
  const objective = inferObjectiveForReport(report);
  const framework = {
    executiveSummary:
      report.framework.executiveSummary ||
      report.dataFacts[0]?.detail ||
      report.hypotheses[0]?.detail ||
      report.recommendations[0]?.detail ||
      labels.healthyBaseline,
    whatHappened: report.framework.whatHappened.length
      ? report.framework.whatHappened
      : report.dataFacts.slice(0, 3),
    whyItHappened: report.framework.whyItHappened.length
      ? report.framework.whyItHappened
      : (report.hypotheses.length ? report.hypotheses : report.providedContext).slice(0, 3),
    whatWeAreDoing: report.framework.whatWeAreDoing.length
      ? report.framework.whatWeAreDoing
      : report.recommendations.slice(0, 3),
    ccipaPillars: report.framework.ccipaPillars.length
      ? report.framework.ccipaPillars
      : [
          {
            key: "clear",
            label: labels.executiveSummary,
            status: "watch" as const,
            detail: "Legacy report payload loaded without the new CCIPA scaffold.",
          },
          {
            key: "concise",
            label: "Concise",
            status: "watch" as const,
            detail: "The upgraded framework will appear fully on the next report generation.",
          },
          {
            key: "insightful",
            label: "Insightful",
            status: report.hypotheses.length > 0 || report.providedContext.length > 0 ? "strong" as const : "watch" as const,
            detail: "Insight fallback was reconstructed from the stored narrative blocks.",
          },
          {
            key: "precise",
            label: "Precise",
            status: "watch" as const,
            detail: "Regenerate the report to rebuild the full framework payload with current logic.",
          },
          {
            key: "actionable",
            label: "Actionable",
            status: report.recommendations.length > 0 ? "strong" as const : "watch" as const,
            detail: "Action steps were recovered from the stored recommendations list.",
          },
        ],
  };
  const findings = report.findings
    .map(
      (finding) => `
        <article class="finding ${finding.status}">
          <div class="finding-meta">
            <span>${escapeHtml(finding.section)}</span>
            <strong>${escapeHtml(finding.severityLabel)}</strong>
          </div>
          <h3>${escapeHtml(finding.summary)}</h3>
          <p>${escapeHtml(finding.recommendedAction)}</p>
          <ul>${finding.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </article>
      `,
    )
    .join("");

  const sectionRows = report.sectionScores
    .map(
      (section) => `<tr><td>${escapeHtml(section.label)}</td><td>${section.findingCount}</td><td>${section.score}</td></tr>`,
    )
    .join("");

  const locationRows = report.locationScores
    .map(
      (location) => `<tr><td>${escapeHtml(location.label)}</td><td>${location.score}</td><td>${escapeHtml(location.notes.join(" ") || labels.healthyBaseline)}</td></tr>`,
    )
    .join("");

  const acquisitionRows = report.snapshot.trafficAttribution?.topSourceMediums
    ?.map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.source)}</td>
          <td>${escapeHtml(item.medium)}</td>
          <td>${formatNumber(report.locale, item.sessions)}</td>
          <td>${formatNumber(report.locale, item.pageViews)}</td>
          <td>${formatNumber(report.locale, item.keyEvents)}</td>
          <td>${formatNumber(report.locale, item.revenue, 2)}</td>
          <td>${formatPercent(report.locale, item.conversionRate)}</td>
          <td>${formatPercent(report.locale, item.share)}</td>
        </tr>
      `,
    )
    .join("");

  const paidCampaignRows = report.snapshot.paidMedia?.topCampaigns
    ?.filter((campaign) => campaign.spend > 0 || campaign.clicks > 0 || campaign.purchases > 0)
    .map(
      (campaign) => `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${formatNumber(report.locale, campaign.spend, 2)}</td>
          <td>${formatNumber(report.locale, campaign.impressions)}</td>
          <td>${formatNumber(report.locale, campaign.clicks)}</td>
          <td>${formatPercent(report.locale, campaign.ctr)}</td>
          <td>${formatNumber(report.locale, campaign.purchases)}</td>
          <td>${objective.kind === "lead_generation" ? formatNumber(report.locale, campaignCostPerConversion(campaign), 2) : formatNumber(report.locale, campaign.roas, 2)}</td>
        </tr>
      `,
    )
    .join("");

  const renderNarrativeList = (items: AuditReportPayload["dataFacts"]) =>
    items.length === 0
      ? `<p class="empty-state">${escapeHtml(labels.healthyBaseline)}</p>`
      : `<div class="story-list">${items
          .map(
            (item) => `
              <article class="story-card">
                <div class="story-kicker">${escapeHtml(sanitizeNarrativeTitle(item.title))}</div>
                <p>${escapeHtml(sanitizeNarrativeText(item.detail))}</p>
              </article>
            `,
          )
          .join("")}</div>`;

  const periodLabel = report.reportPeriod.periodKey
    ? `${report.reportPeriod.periodKey}${report.reportPeriod.periodStart && report.reportPeriod.periodEnd ? ` (${report.reportPeriod.periodStart} → ${report.reportPeriod.periodEnd})` : ""}`
    : "Ad hoc";

  const topRisksMarkup = report.summary.topRisks.length
    ? `<ul class="signal-list">${report.summary.topRisks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="empty-state">${escapeHtml(labels.healthyBaseline)}</p>`;

  const strengthsMarkup = report.summary.strengths.length
    ? `<ul class="signal-list">${report.summary.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="empty-state">${escapeHtml(labels.noStrengths)}</p>`;

  const visibleConfidenceNotes = getClientVisibleConfidenceNotes(report);
  const confidenceMarkup = visibleConfidenceNotes.length
    ? visibleConfidenceNotes
        .map(
          (note) => `
            <article class="confidence ${note.level}">
              <div class="story-kicker">${escapeHtml(note.label)}</div>
              <p>${escapeHtml(note.detail)}</p>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">${escapeHtml(labels.healthyBaseline)}</p>`;

  const executiveSummary = sanitizeNarrativeText(framework.executiveSummary);
  const acquisitionChartItems = (report.snapshot.trafficAttribution?.topSourceMediums ?? [])
    .slice(0, 5)
    .map((item) => ({
      label: `${item.source} / ${item.medium}`,
      value: item.sessions,
      detail: `${formatPercent(report.locale, item.share)} ${labels.share.toLowerCase()} • ${formatNumber(report.locale, item.pageViews)} ${labels.pageViews.toLowerCase()}`,
    }));
  const paidChartItems = (report.snapshot.paidMedia?.topCampaigns ?? [])
    .filter((campaign) => campaign.spend > 0 || campaign.clicks > 0 || campaign.purchases > 0)
    .slice(0, 5)
    .map((campaign) => ({
      label: campaign.name,
      value: campaign.spend,
      detail:
        objective.kind === "lead_generation"
          ? `${labels.costPerLead} ${formatNumber(report.locale, campaignCostPerConversion(campaign), 2)} • ${formatNumber(report.locale, campaign.clicks)} ${labels.clicks.toLowerCase()}`
          : `ROAS ${formatNumber(report.locale, campaign.roas, 2)} • ${formatNumber(report.locale, campaign.clicks)} ${labels.clicks.toLowerCase()}`,
    }));
  const headlineMetrics = deriveHeadlineMetrics(report);
  const metricBandMarkup = headlineMetrics
    .map(
      (metric) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(metric.label)}</div>
          <div class="metric-value">${formatNumber(report.locale, metric.value, metric.digits ?? 0)}</div>
        </article>
      `,
    )
    .join("");
  const acquisitionChartMarkup = renderBarChartCard({
    title: labels.acquisitionMix,
    items: acquisitionChartItems,
    valueFormatter: (value) => formatNumber(report.locale, value),
  });
  const paidChartMarkup = renderBarChartCard({
    title: labels.paidSpendByCampaign,
    items: paidChartItems,
    valueFormatter: (value) => formatNumber(report.locale, value, 2),
  });

  return `
    <!DOCTYPE html>
    <html lang="${report.locale}">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: "Segoe UI", sans-serif;
            color: #dbe6f4;
            background:
              radial-gradient(circle at top left, rgba(224, 177, 74, 0.18), transparent 22%),
              radial-gradient(circle at top right, rgba(77, 125, 255, 0.16), transparent 18%),
              linear-gradient(180deg, #08111d 0%, #0b1320 48%, #101823 100%);
            margin: 0;
            padding: 28px;
          }
          .page-shell { display: grid; gap: 18px; }
          .panel {
            background: rgba(10, 17, 29, 0.82);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 28px;
            padding: 24px;
            box-shadow: 0 28px 60px rgba(0, 0, 0, 0.28);
          }
          .hero {
            display: grid;
            grid-template-columns: 1.5fr 0.9fr;
            gap: 22px;
            align-items: stretch;
            background:
              linear-gradient(135deg, rgba(17, 27, 43, 0.98) 0%, rgba(10, 18, 31, 0.98) 60%, rgba(39, 46, 28, 0.94) 100%);
          }
          .eyebrow, .story-kicker, .finding-meta, .metric-label, .section-label {
            text-transform: uppercase;
            letter-spacing: 0.18em;
            font-size: 10px;
          }
          .eyebrow { color: #f0c56c; }
          .hero h1 { margin: 14px 0 8px; font-size: 34px; line-height: 1.05; color: #f9fbff; }
          .hero p { margin: 0; color: #9fb0c6; line-height: 1.65; }
          .hero-summary {
            margin-top: 18px;
            padding-top: 18px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 16px;
            color: #e8eff8;
          }
          .hero-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 18px;
          }
          .meta-chip {
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 999px;
            padding: 8px 12px;
            color: #c6d3e4;
            background: rgba(255, 255, 255, 0.04);
            font-size: 11px;
          }
          .score-panel {
            display: grid;
            gap: 14px;
            align-content: start;
          }
          .score-card {
            border-radius: 24px;
            padding: 18px;
            background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
            border: 1px solid rgba(255,255,255,0.08);
          }
          .score-value { font-size: 52px; font-weight: 700; color: #fff7df; line-height: 1; margin-top: 8px; }
          .score-sub { margin-top: 8px; color: #95a7be; font-size: 12px; }
          .metric-band {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 14px;
          }
          .metric-card {
            border-radius: 22px;
            padding: 18px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
          .metric-label { color: #7e93ac; }
          .metric-value { margin-top: 10px; font-size: 28px; font-weight: 700; color: #f8fbff; }
          .story-grid, .detail-grid, .signals-grid {
            display: grid;
            gap: 16px;
          }
          .story-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .detail-grid { grid-template-columns: 1.1fr 0.9fr; }
          .signals-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .chart-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .section-title {
            margin: 0 0 16px;
            font-size: 20px;
            color: #f8fbff;
          }
          .section-copy { margin: 0; color: #9fb0c6; line-height: 1.65; }
          .story-list, .findings { display: grid; gap: 12px; }
          .story-card, .finding, .pillar, .confidence, .signal-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            padding: 16px;
          }
          .story-kicker { color: #8fa6c3; margin-bottom: 10px; }
          .story-card p, .pillar p, .confidence p, .signal-card p { margin: 0; color: #dde8f7; line-height: 1.65; }
          .story-card ul, .finding ul { margin: 12px 0 0; padding-left: 18px; color: #95a7be; }
          .pillar-top, .finding-meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
            color: #8fa6c3;
          }
          .confidence.info { border-color: rgba(71, 191, 143, 0.35); }
          .confidence.warning { border-color: rgba(240, 197, 108, 0.35); }
          .finding { border-left: 5px solid #7f8ea4; }
          .finding.failing { border-left-color: #e36464; }
          .finding.watch { border-left-color: #f0c56c; }
          .finding.passing { border-left-color: #47bf8f; }
          .finding h3 { margin: 0 0 10px; color: #f7fbff; font-size: 16px; }
          .finding p { margin: 0; color: #dbe6f4; line-height: 1.65; }
          .signal-list { margin: 14px 0 0; padding-left: 18px; color: #dbe6f4; }
          .signal-list li { margin-bottom: 10px; line-height: 1.6; }
          .table-shell {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 22px;
            overflow: hidden;
          }
          .chart-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 22px;
            padding: 18px;
          }
          .chart-shell {
            width: 100%;
            height: auto;
            display: block;
            margin-top: 12px;
          }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            padding: 12px 14px;
            text-align: left;
            vertical-align: top;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            color: #dbe6f4;
          }
          th {
            background: rgba(255, 255, 255, 0.04);
            color: #8fa6c3;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.18em;
          }
          tr:last-child td { border-bottom: none; }
          .empty-state { margin: 0; color: #8094ac; line-height: 1.6; }
          @page { margin: 18px; }
        </style>
      </head>
      <body>
        <section class="page-shell">
        <section class="panel hero">
          <div>
            <div class="eyebrow">${escapeHtml(labels.title)}</div>
            <h1>${escapeHtml(report.clientName)}</h1>
            <p>${escapeHtml(report.clientIndustryLabel)} • ${escapeHtml(report.snapshot.platformLabels.join(", "))}</p>
            <div class="hero-meta">
              <span class="meta-chip">${escapeHtml(labels.reportFocus)}: ${escapeHtml(getReportFocusLabel(report.locale, report.reportFocus))}</span>
              <span class="meta-chip">${escapeHtml(labels.reportPeriod)}: ${escapeHtml(periodLabel)}</span>
              ${report.reportPeriod.baselinePeriodKey ? `<span class="meta-chip">Compared with: ${escapeHtml(report.reportPeriod.baselinePeriodKey)}</span>` : ""}
              <span class="meta-chip">${escapeHtml(labels.generated)} ${escapeHtml(new Date(report.generatedAt).toLocaleString(report.locale))}</span>
            </div>
            <p class="hero-summary">${escapeHtml(executiveSummary)}</p>
          </div>
          <div class="score-panel">
            <div class="score-card">
              <div class="eyebrow">Report month</div>
              <div class="score-value" style="font-size: 34px;">${escapeHtml(report.reportPeriod.periodKey)}</div>
              <div class="score-sub">${escapeHtml(report.reportPeriod.periodStart)} → ${escapeHtml(report.reportPeriod.periodEnd)}</div>
            </div>
            <div class="score-card">
              <div class="eyebrow">Compared with</div>
              <div class="score-value" style="font-size: 30px;">${escapeHtml(report.reportPeriod.baselinePeriodKey ?? "N/A")}</div>
              <div class="score-sub">${report.execution.includedIntegrations.length} connected sources</div>
            </div>
          </div>
        </section>

        <section class="metric-band">
          ${metricBandMarkup}
        </section>

        <section class="story-grid">
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.executiveSummary)}</div>
            <h2 class="section-title">Key outcomes</h2>
            ${renderNarrativeList(framework.whatHappened)}
          </section>
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.executiveSummary)}</div>
            <h2 class="section-title">What influenced the month</h2>
            ${renderNarrativeList(framework.whyItHappened)}
          </section>
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.executiveSummary)}</div>
            <h2 class="section-title">Next actions</h2>
            ${renderNarrativeList(framework.whatWeAreDoing)}
          </section>
        </section>

        ${acquisitionChartMarkup || paidChartMarkup ? `
          <section class="panel">
            <div class="section-label">Visual summary</div>
            <h2 class="section-title">Performance charts</h2>
            <div class="chart-grid">
              ${acquisitionChartMarkup || `<p class="empty-state">${escapeHtml(labels.healthyBaseline)}</p>`}
              ${paidChartMarkup || `<p class="empty-state">${escapeHtml(labels.healthyBaseline)}</p>`}
            </div>
          </section>
        ` : ""}

        <section class="detail-grid">
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.snapshotHighlights)}</div>
            <h2 class="section-title">${escapeHtml(labels.snapshotHighlights)}</h2>
            <div class="signals-grid">
              <article class="signal-card">
                <div class="story-kicker">${escapeHtml(labels.acquisitionCrosswalk)}</div>
                <p>${acquisitionRows ? `${escapeHtml(labels.source)} + ${escapeHtml(labels.medium)} + outcome (${escapeHtml(labels.pageViews)}, ${escapeHtml(labels.keyEvents)}, ${escapeHtml(labels.revenue)}).` : escapeHtml(labels.healthyBaseline)}</p>
              </article>
              <article class="signal-card">
                <div class="story-kicker">${escapeHtml(labels.paidMediaSummary)}</div>
                <p>${report.snapshot.paidMedia ? objective.kind === "lead_generation" ? `${escapeHtml(labels.spend)} ${formatNumber(report.locale, report.snapshot.paidMedia.spend, 2)} • ${escapeHtml(objective.primaryConversionLabel)} ${formatNumber(report.locale, report.snapshot.paidMedia.purchases)} • ${escapeHtml(labels.costPerLead)} ${formatNumber(report.locale, costPerConversion(report.snapshot.paidMedia), 2)}` : `${escapeHtml(labels.spend)} ${formatNumber(report.locale, report.snapshot.paidMedia.spend, 2)} • ${escapeHtml(labels.purchases)} ${formatNumber(report.locale, report.snapshot.paidMedia.purchases)} • ${escapeHtml(labels.roas)} ${formatNumber(report.locale, report.snapshot.paidMedia.roas, 2)}` : escapeHtml(labels.healthyBaseline)}</p>
              </article>
              <article class="signal-card">
                <div class="story-kicker">${escapeHtml(labels.ga4ConversionRate)}</div>
                <p>${formatPercent(report.locale, report.snapshot.trafficAttribution?.conversionRate)}</p>
              </article>
              <article class="signal-card">
                <div class="story-kicker">${escapeHtml(labels.organicCtr)}</div>
                <p>${formatPercent(report.locale, report.snapshot.search?.ctr)}</p>
              </article>
            </div>
          </section>

          <section class="panel">
            <div class="section-label">Signals</div>
            <h2 class="section-title">${escapeHtml(labels.topRisks)}</h2>
            ${topRisksMarkup}
            <h2 class="section-title" style="margin-top: 20px;">${escapeHtml(labels.strengths)}</h2>
            ${strengthsMarkup}
          </section>
        </section>

        <section class="detail-grid">
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.section)}</div>
            <h2 class="section-title">Section performance</h2>
            <div class="table-shell">
              <table>
                <thead><tr><th>${escapeHtml(labels.section)}</th><th>${escapeHtml(labels.findings)}</th><th>${escapeHtml(labels.scoreCol)}</th></tr></thead>
                <tbody>${sectionRows}</tbody>
              </table>
            </div>
            ${report.locationScores.length > 0 ? `
              <h2 class="section-title" style="margin-top: 20px;">${escapeHtml(labels.locations)}</h2>
              <div class="table-shell">
                <table>
                  <thead><tr><th>${escapeHtml(labels.locations)}</th><th>${escapeHtml(labels.scoreCol)}</th><th>${escapeHtml(labels.notes)}</th></tr></thead>
                  <tbody>${locationRows}</tbody>
                </table>
              </div>
            ` : ""}
          </section>

          <section class="panel">
            <div class="section-label">Data coverage</div>
            <h2 class="section-title">Data coverage notes</h2>
            <div class="story-list">${confidenceMarkup}</div>
          </section>
        </section>

        ${acquisitionRows ? `
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.acquisitionCrosswalk)}</div>
            <h2 class="section-title">${escapeHtml(labels.acquisitionCrosswalk)}</h2>
            <div class="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>${escapeHtml(labels.source)}</th>
                    <th>${escapeHtml(labels.medium)}</th>
                    <th>${escapeHtml(labels.sessions)}</th>
                    <th>${escapeHtml(labels.pageViews)}</th>
                    <th>${escapeHtml(labels.keyEvents)}</th>
                    <th>${escapeHtml(labels.revenue)}</th>
                    <th>${escapeHtml(labels.ga4ConversionRate)}</th>
                    <th>${escapeHtml(labels.share)}</th>
                  </tr>
                </thead>
                <tbody>${acquisitionRows}</tbody>
              </table>
            </div>
          </section>
        ` : ""}

        ${paidCampaignRows ? `
          <section class="panel">
            <div class="section-label">${escapeHtml(labels.paidMediaSummary)}</div>
            <h2 class="section-title">${escapeHtml(labels.paidMediaSummary)}</h2>
            <div class="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>${escapeHtml(labels.paidMediaSummary)}</th>
                    <th>${escapeHtml(labels.spend)}</th>
                    <th>${escapeHtml(labels.impressions)}</th>
                    <th>${escapeHtml(labels.clicks)}</th>
                    <th>${escapeHtml(labels.ctr)}</th>
                    <th>${escapeHtml(labels.purchases)}</th>
                    <th>${escapeHtml(objective.kind === "lead_generation" ? labels.costPerLead : labels.roas)}</th>
                  </tr>
                </thead>
                <tbody>${paidCampaignRows}</tbody>
              </table>
            </div>
          </section>
        ` : ""}

        <section class="panel">
          <div class="section-label">${escapeHtml(labels.findings)}</div>
          <h2 class="section-title">${escapeHtml(labels.findings)}</h2>
          <div class="findings">${findings || `<p class="empty-state">${escapeHtml(labels.healthyBaseline)}</p>`}</div>
        </section>
        </section>
      </body>
    </html>
  `;
}

export async function renderReportPdf(report: AuditReportPayload): Promise<Buffer> {
  const status = getPdfRendererStatus();
  if (!status.available) {
    throw new Error(status.message);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(renderReportHtml(report), { waitUntil: "networkidle" });
    const buffer = await page.pdf({
      printBackground: true,
      format: "A4",
      margin: { top: "24px", right: "24px", bottom: "24px", left: "24px" },
    });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
