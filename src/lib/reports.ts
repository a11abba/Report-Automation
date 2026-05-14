import { accessSync, constants } from "node:fs";
import { chromium } from "playwright";
import { type AuditReportPayload } from "@/lib/audit/types";
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    ?.map(
      (campaign) => `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${formatNumber(report.locale, campaign.spend, 2)}</td>
          <td>${formatNumber(report.locale, campaign.impressions)}</td>
          <td>${formatNumber(report.locale, campaign.clicks)}</td>
          <td>${formatPercent(report.locale, campaign.ctr)}</td>
          <td>${formatNumber(report.locale, campaign.purchases)}</td>
          <td>${formatNumber(report.locale, campaign.roas, 2)}</td>
        </tr>
      `,
    )
    .join("");

  const renderNarrativeList = (items: AuditReportPayload["dataFacts"]) =>
    items.length === 0
      ? `<p>${escapeHtml(labels.healthyBaseline)}</p>`
      : `<div class="findings">${items
          .map(
            (item) => `
              <article class="finding info">
                <div class="finding-meta">
                  <span>${escapeHtml(item.title)}</span>
                </div>
                <p>${escapeHtml(item.detail)}</p>
                ${item.evidence.length ? `<ul>${item.evidence.map((evidence) => `<li>${escapeHtml(evidence)}</li>`).join("")}</ul>` : ""}
              </article>
            `,
          )
          .join("")}</div>`;

  const periodLabel = report.reportPeriod.periodKey
    ? `${report.reportPeriod.periodKey}${report.reportPeriod.periodStart && report.reportPeriod.periodEnd ? ` (${report.reportPeriod.periodStart} → ${report.reportPeriod.periodEnd})` : ""}`
    : "Ad hoc";

  return `
    <!DOCTYPE html>
    <html lang="${report.locale}">
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: "Segoe UI", sans-serif; color: #14213d; background: linear-gradient(180deg, #f4f1ea 0%, #f8fafc 55%, #ffffff 100%); margin: 0; padding: 40px; }
          .hero { padding: 32px; border-radius: 28px; background: #14213d; color: #fffdf7; }
          .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }
          .card { background: white; border: 1px solid #d7d1c7; border-radius: 20px; padding: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; background: white; border-radius: 18px; overflow: hidden; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ece7de; vertical-align: top; }
          .findings { display: grid; gap: 14px; margin-top: 24px; }
          .finding { background: white; border: 1px solid #ece7de; border-left: 8px solid #8d99ae; border-radius: 18px; padding: 18px; }
          .finding.failing { border-left-color: #c1121f; }
          .finding.watch { border-left-color: #fca311; }
          .finding.passing { border-left-color: #2a9d8f; }
          .finding-meta { display: flex; justify-content: space-between; text-transform: uppercase; font-size: 11px; letter-spacing: 0.12em; }
          ul { padding-left: 18px; }
        </style>
      </head>
      <body>
        <section class="hero">
          <p>${escapeHtml(labels.title)}</p>
          <h1>${escapeHtml(report.clientName)}</h1>
          <p>${escapeHtml(report.clientIndustryLabel)} • ${escapeHtml(report.snapshot.platformLabels.join(", "))}</p>
          <p>${escapeHtml(labels.reportFocus)}: ${escapeHtml(getReportFocusLabel(report.locale, report.reportFocus))}</p>
          <p>${escapeHtml(labels.reportPeriod)}: ${escapeHtml(periodLabel)}</p>
          ${report.reportPeriod.baselinePeriodKey ? `<p>${escapeHtml(labels.baselinePeriod)}: ${escapeHtml(report.reportPeriod.baselinePeriodKey)}</p>` : ""}
          <p>${escapeHtml(labels.generated)} ${escapeHtml(new Date(report.generatedAt).toLocaleString(report.locale))}</p>
        </section>
        <section class="grid">
          <div class="card"><p>${escapeHtml(labels.score)}</p><h2>${report.score}</h2></div>
          <div class="card"><p>${escapeHtml(labels.grade)}</p><h2>${report.grade}</h2></div>
          <div class="card"><p>${escapeHtml(labels.findings)}</p><h2>${report.findings.length}</h2></div>
          <div class="card"><p>${escapeHtml(labels.locations)}</p><h2>${report.summary.locationCount}</h2></div>
        </section>
        <section class="card">
          <h2>${escapeHtml(labels.topRisks)}</h2>
          <ul>${report.summary.topRisks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          <h2>${escapeHtml(labels.strengths)}</h2>
          <ul>${(report.summary.strengths.length ? report.summary.strengths : [labels.noStrengths]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
        <table>
          <thead><tr><th>${escapeHtml(labels.section)}</th><th>${escapeHtml(labels.findings)}</th><th>${escapeHtml(labels.scoreCol)}</th></tr></thead>
          <tbody>${sectionRows}</tbody>
        </table>
        ${report.locationScores.length > 0 ? `<table><thead><tr><th>${escapeHtml(labels.locations)}</th><th>${escapeHtml(labels.scoreCol)}</th><th>${escapeHtml(labels.notes)}</th></tr></thead><tbody>${locationRows}</tbody></table>` : ""}
        ${acquisitionRows ? `
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
        ` : ""}
        ${paidCampaignRows ? `
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(labels.paidMediaSummary)}</th>
                <th>${escapeHtml(labels.spend)}</th>
                <th>${escapeHtml(labels.impressions)}</th>
                <th>${escapeHtml(labels.clicks)}</th>
                <th>${escapeHtml(labels.ctr)}</th>
                <th>${escapeHtml(labels.purchases)}</th>
                <th>${escapeHtml(labels.roas)}</th>
              </tr>
            </thead>
            <tbody>${paidCampaignRows}</tbody>
          </table>
        ` : ""}
        <section class="card" style="margin-top: 20px;">
          <h2>${escapeHtml(labels.snapshotHighlights)}</h2>
          ${acquisitionRows ? `<p><strong>${escapeHtml(labels.acquisitionCrosswalk)}:</strong> ${escapeHtml(labels.source)} + ${escapeHtml(labels.medium)} + outcome (${escapeHtml(labels.pageViews)}, ${escapeHtml(labels.keyEvents)}, ${escapeHtml(labels.revenue)}).</p>` : ""}
          ${report.snapshot.paidMedia ? `<p><strong>${escapeHtml(labels.paidMediaSummary)}:</strong> ${escapeHtml(labels.spend)} ${formatNumber(report.locale, report.snapshot.paidMedia.spend, 2)} • ${escapeHtml(labels.purchases)} ${formatNumber(report.locale, report.snapshot.paidMedia.purchases)} • ${escapeHtml(labels.roas)} ${formatNumber(report.locale, report.snapshot.paidMedia.roas, 2)}</p>` : ""}
          <p>${escapeHtml(labels.organicCtr)}: ${formatPercent(report.locale, report.snapshot.search?.ctr)}</p>
          <p>${escapeHtml(labels.averageRating)}: ${report.snapshot.reputation?.averageRating?.toFixed(1) ?? "N/A"}</p>
          <p>${escapeHtml(labels.ga4ConversionRate)}: ${formatPercent(report.locale, report.snapshot.trafficAttribution?.conversionRate)}</p>
          <p>${escapeHtml(labels.websitePerformanceScore)}: ${report.snapshot.website?.pageSpeedScore ?? "N/A"}</p>
          <p>${escapeHtml(labels.campaignOpenRate)}: ${formatPercent(report.locale, report.snapshot.campaigns?.metrics.openRate.value as number | null | undefined)}</p>
        </section>
        <section class="card" style="margin-top: 20px;">
          <h2>${escapeHtml(labels.dataFacts)}</h2>
          ${renderNarrativeList(report.dataFacts)}
        </section>
        <section class="card" style="margin-top: 20px;">
          <h2>${escapeHtml(labels.providedContext)}</h2>
          ${renderNarrativeList(report.providedContext)}
        </section>
        <section class="card" style="margin-top: 20px;">
          <h2>${escapeHtml(labels.hypotheses)}</h2>
          ${renderNarrativeList(report.hypotheses)}
        </section>
        <section class="card" style="margin-top: 20px;">
          <h2>${escapeHtml(labels.recommendationsNarrative)}</h2>
          ${renderNarrativeList(report.recommendations)}
        </section>
        <section class="card" style="margin-top: 20px;">
          <h2>${escapeHtml(labels.confidenceNotes)}</h2>
          ${renderNarrativeList(
            report.confidenceNotes.map((note) => ({
              title: note.label,
              detail: note.detail,
              evidence: [note.level],
            })),
          )}
        </section>
        <section class="findings">${findings}</section>
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
