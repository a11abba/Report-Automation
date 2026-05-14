import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getReportPeriodDetail } from "@/lib/audit-engine";
import { redirectIfUnauthenticated } from "@/lib/auth-session-server";
import { loadReportPeriodForViewer } from "@/lib/route-auth";
import type {
  AuditReportPayload,
  ContextEntryRecord,
  ReportConfidenceNote,
  ReportNarrativeItem,
  ReportPeriodRecord,
} from "@/lib/audit/types";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

interface ReportPeriodPageView {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  baselinePeriodId: string | null;
  baselinePeriodKey: string | null;
  status: ReportPeriodRecord["status"];
  auditId: string | null;
  generatedAt: string | null;
  manualInputs: ReportPeriodRecord["manualInputs"];
}

function resolveLocale(locale?: AuditReportPayload["locale"]) {
  return locale === "en" ? "en-US" : locale ?? "pt-BR";
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "Not available";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale);
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString(locale);
}

function formatNumber(value: number | null | undefined, locale: string) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(locale).format(value);
}

function confidenceTone(level: ReportConfidenceNote["level"]) {
  switch (level) {
    case "warning":
      return "border-amber-500/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-100";
  }
}

function statusTone(status: ReportPeriodRecord["status"]) {
  switch (status) {
    case "completed":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-100";
    case "failed":
      return "border-rose-500/20 bg-rose-500/10 text-rose-100";
    case "running":
    case "queued":
      return "border-amber-500/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/[0.04] text-slate-300";
  }
}

function NarrativeSection({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: ReportNarrativeItem[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {items.length} items
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyMessage}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article
              key={`${item.title}-${item.detail}`}
              className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4"
            >
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
              {item.evidence.length > 0 ? (
                <ul className="mt-3 grid gap-2 text-sm text-slate-400">
                  {item.evidence.map((entry) => (
                    <li key={entry} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      {entry}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ContextTimeline({
  contextEntries,
  locale,
}: {
  contextEntries: ContextEntryRecord[];
  locale: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Context timeline</h2>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {contextEntries.length} entries
        </span>
      </div>
      {contextEntries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No operational context was added for this period yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {contextEntries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {entry.entryType.replaceAll("_", " ")}
                    {entry.channel ? ` · ${entry.channel}` : ""}
                    {entry.source ? ` · ${entry.source}` : ""}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                    {entry.authorName} · {formatDateTime(entry.createdAt, locale)}
                  </p>
                </div>
                {(entry.effectiveStartDate || entry.effectiveEndDate) ? (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    {formatDate(entry.effectiveStartDate, locale)} to {formatDate(entry.effectiveEndDate, locale)}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{entry.text}</p>
              {entry.tags.length > 0 ? (
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {entry.tags.join(" · ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ReportPage({ params }: ReportPageProps) {
  const viewer = await redirectIfUnauthenticated();
  const { id } = await params;
  const access = await loadReportPeriodForViewer(viewer, id);

  if (access.response) {
    if (access.response.status === 403) {
      redirect("/");
    }
    notFound();
  }

  const detail = await getReportPeriodDetail(id);
  if (!detail.reportPeriod || !access.client) {
    notFound();
  }

  const locale = resolveLocale(detail.report?.locale ?? access.client.reportLanguage);
  const report = detail.report;
  const reportPeriod: ReportPeriodPageView = report
    ? {
        id: report.reportPeriod.id ?? detail.reportPeriod.id,
        periodKey: report.reportPeriod.periodKey ?? detail.reportPeriod.periodKey,
        periodStart: report.reportPeriod.periodStart ?? detail.reportPeriod.periodStart,
        periodEnd: report.reportPeriod.periodEnd ?? detail.reportPeriod.periodEnd,
        baselinePeriodId: report.reportPeriod.baselinePeriodId ?? detail.reportPeriod.baselinePeriodId,
        baselinePeriodKey: report.reportPeriod.baselinePeriodKey ?? detail.baselinePeriod?.periodKey ?? null,
        manualInputs: report.reportPeriod.manualInputs ?? detail.reportPeriod.manualInputs,
        status: detail.reportPeriod.status,
        auditId: detail.reportPeriod.auditId,
        generatedAt: detail.reportPeriod.generatedAt,
      }
    : {
        id: detail.reportPeriod.id,
        periodKey: detail.reportPeriod.periodKey,
        periodStart: detail.reportPeriod.periodStart,
        periodEnd: detail.reportPeriod.periodEnd,
        baselinePeriodId: detail.reportPeriod.baselinePeriodId,
        baselinePeriodKey: detail.baselinePeriod?.periodKey ?? null,
        status: detail.reportPeriod.status,
        auditId: detail.reportPeriod.auditId,
        generatedAt: detail.reportPeriod.generatedAt,
        manualInputs: detail.reportPeriod.manualInputs,
      };

  const summaryPills = report
    ? [
        `${report.score} score`,
        `${report.grade} grade`,
        `${report.summary.locationCount} locations`,
        `${report.execution.includedIntegrations.length} included integrations`,
      ]
    : [`${detail.contextEntries.length} context entries`, `${detail.reportPeriod.status} status`];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(243,193,91,0.12),transparent_24%),radial-gradient(circle_at_85%_12%,rgba(53,130,246,0.16),transparent_18%),linear-gradient(180deg,#091019_0%,#0b111a_48%,#0a0f16_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,#182230_0%,#121a26_58%,#20251f_100%)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.34em] text-[#f3c15b]">
                Monthly report workspace
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                {access.client.name} · {reportPeriod.periodKey}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Structured monthly reporting with period metadata, business context, hypothesis framing, and exportable client output.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.22em] ${statusTone(detail.reportPeriod.status)}`}>
                  {detail.reportPeriod.status}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                  {formatDate(reportPeriod.periodStart, locale)} to {formatDate(reportPeriod.periodEnd, locale)}
                </span>
                {reportPeriod.baselinePeriodKey ? (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    Baseline {reportPeriod.baselinePeriodKey}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[22rem]">
              <Link
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-200 transition hover:bg-white/[0.08]"
                href="/"
              >
                Back to dashboard
              </Link>
              <a
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-200 transition hover:bg-white/[0.08]"
                href={`/api/report-periods/${id}/report.json`}
                rel="noreferrer"
                target="_blank"
              >
                Open JSON
              </a>
              <a
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-200 transition hover:bg-white/[0.08]"
                href={`/api/report-periods/${id}/report.pdf`}
                rel="noreferrer"
                target="_blank"
              >
                Open PDF
              </a>
              <Link
                className="rounded-full border border-[#8f7a2f] bg-[linear-gradient(135deg,#f3c15b_0%,#dba93a_100%)] px-4 py-3 text-center text-sm font-medium text-[#11161f]"
                href={`/#client-${access.client.id}`}
              >
                Open client workspace
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {summaryPills.map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300"
              >
                {pill}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-4">
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Generated</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              {formatDateTime(reportPeriod.generatedAt, locale)}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Leads</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              {formatNumber(reportPeriod.manualInputs.leads, locale)}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Sales</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              {formatNumber(reportPeriod.manualInputs.sales, locale)}
            </p>
          </article>
          <article className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Revenue</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              {formatNumber(reportPeriod.manualInputs.revenue, locale)}
            </p>
          </article>
        </section>

        {reportPeriod.manualInputs.notes ? (
          <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
            <h2 className="text-lg font-semibold text-white">Manual business notes</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {reportPeriod.manualInputs.notes}
            </p>
          </section>
        ) : null}

        {report ? (
          <>
            <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Executive summary</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {report.clientIndustryLabel} report focused on {report.reportFocus.replaceAll("_", " ")} with {report.summary.supportedSections.length} supported sections.
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-slate-300">
                  <span>Top risks: {report.summary.topRisks.length}</span>
                  <span>Strengths: {report.summary.strengths.length}</span>
                  <span>Findings: {report.findings.length}</span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Included integrations</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.execution.includedIntegrations.map((integration) => (
                      <span
                        key={integration.id}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300"
                      >
                        {integration.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Top risks</p>
                  <div className="mt-3 grid gap-2">
                    {report.summary.topRisks.length === 0 ? (
                      <p className="text-sm text-slate-400">No major risks were flagged in the current payload.</p>
                    ) : (
                      report.summary.topRisks.map((risk) => (
                        <p
                          key={risk}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300"
                        >
                          {risk}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 xl:grid-cols-2">
              <NarrativeSection
                title="Data facts"
                items={report.dataFacts}
                emptyMessage="No data facts were generated for this period."
              />
              <NarrativeSection
                title="Provided context"
                items={report.providedContext}
                emptyMessage="No contextual inputs were attached to the report payload."
              />
              <NarrativeSection
                title="Hypotheses"
                items={report.hypotheses}
                emptyMessage="No explanatory hypotheses were generated yet."
              />
              <NarrativeSection
                title="Recommendations"
                items={report.recommendations}
                emptyMessage="No next-step recommendations were generated yet."
              />
            </section>

            <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Confidence notes</h2>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {report.confidenceNotes.length} notes
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {report.confidenceNotes.map((note) => (
                  <article
                    key={`${note.label}-${note.detail}`}
                    className={`rounded-[1.25rem] border p-4 ${confidenceTone(note.level)}`}
                  >
                    <p className="text-sm font-semibold">{note.label}</p>
                    <p className="mt-2 text-sm leading-6 opacity-90">{note.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="mt-6 rounded-[1.5rem] border border-amber-500/20 bg-amber-500/10 p-5 text-amber-100">
            <h2 className="text-lg font-semibold">Report not generated yet</h2>
            <p className="mt-2 text-sm leading-6">
              This period already has saved context and manual inputs, but the structured report payload has not been generated yet.
            </p>
          </section>
        )}

        <div className="mt-6">
          <ContextTimeline contextEntries={detail.contextEntries} locale={locale} />
        </div>
      </div>
    </main>
  );
}
