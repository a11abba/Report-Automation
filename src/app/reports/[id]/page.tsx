import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getReportPeriodDetail } from "@/lib/audit-engine";
import { redirectIfUnauthenticated } from "@/lib/auth-session-server";
import { deriveHeadlineMetrics, getMeaningfulPaidCampaigns } from "@/lib/report-metrics";
import {
  campaignCostPerConversion,
  costPerConversion,
  inferObjectiveForReport,
} from "@/lib/report-objective";
import { loadReportPeriodForViewer } from "@/lib/route-auth";
import type {
  AuditReportPayload,
  ContextEntryRecord,
  ReportConfidenceNote,
  ReportNarrativeItem,
  ReportPeriodRecord,
  TaskManagementItemSnapshot,
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

function formatNumber(value: number | null | undefined, locale: string, digits = 0) {
  if (value == null) return "N/A";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function sanitizeNarrativeText(value: string) {
  return value
    .replace(/most likely driver:\s*/gi, "")
    .replace(/next action:\s*/gi, "")
    .replace(/principal explicação:\s*/gi, "")
    .replace(/próximo passo:\s*/gi, "")
    .replace(/this is a likely driver behind the period's result set\.?/gi, "")
    .replace(/esse contexto é um provável fator por trás do resultado do período\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeNarrativeTitle(value: string) {
  if (/open investigation point/i.test(value) || /ponto em investigacao/i.test(value)) {
    return "Context note";
  }
  if (/operator note/i.test(value) || /nota operacional/i.test(value)) {
    return "Business context";
  }
  return value;
}

function sanitizeNarrativeItems(items: ReportNarrativeItem[]) {
  return items.map((item) => ({
    ...item,
    title: sanitizeNarrativeTitle(item.title),
    detail: sanitizeNarrativeText(item.detail),
  }));
}

function confidenceTone(level: ReportConfidenceNote["level"]) {
  switch (level) {
    case "warning":
      return "border-amber-500/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-100";
  }
}

function isInternalConfidenceNote(note: ReportConfidenceNote) {
  return /\b(ai|ia)\b/i.test(`${note.label} ${note.detail}`);
}

function getClientVisibleConfidenceNotes(report: AuditReportPayload) {
  return report.confidenceNotes.filter((note) => !isInternalConfidenceNote(note));
}

function getNarrativeHeadline(
  framework: NonNullable<ReturnType<typeof buildFrameworkFallback>>,
  report: AuditReportPayload,
) {
  return (
    sanitizeNarrativeTitle(framework.whatHappened[0]?.title ?? "") ||
    report.summary.topRisks[0] ||
    report.summary.strengths[0] ||
    "Monthly performance narrative"
  );
}

function buildFrameworkFallback(report: AuditReportPayload | null) {
  if (!report) return null;

  return {
    executiveSummary:
      report.framework.executiveSummary ||
      report.dataFacts[0]?.detail ||
      report.hypotheses[0]?.detail ||
      report.recommendations[0]?.detail ||
      "Healthy baseline.",
    clientEmailDraft:
      report.framework.clientEmailDraft ||
      [
        report.locale === "en"
          ? `Subject: ${report.reportPeriod.periodKey ?? "Monthly"} performance update`
          : `Assunto: Atualização de performance de ${report.reportPeriod.periodKey ?? "este mês"}`,
        report.locale === "en"
          ? `We reviewed the report and wanted to share the main read: ${report.framework.executiveSummary || report.dataFacts[0]?.detail || "the month is ready for review."}`
          : `Revisamos o relatório e queríamos compartilhar a principal leitura: ${report.framework.executiveSummary || report.dataFacts[0]?.detail || "o mês está pronto para revisão."}`,
        report.framework.whatWeAreDoing[0]?.detail
          ? report.locale === "en"
            ? `Our next step is: ${report.framework.whatWeAreDoing[0].detail}`
            : `Nosso próximo passo é: ${report.framework.whatWeAreDoing[0].detail}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
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
            label: "Clear",
            status: "watch" as const,
            detail: "Legacy report payload loaded before the CCIPA structure was added.",
          },
          {
            key: "concise",
            label: "Concise",
            status: "watch" as const,
            detail: "Regenerate the report to see the full framework-driven version.",
          },
          {
            key: "insightful",
            label: "Insightful",
            status:
              report.hypotheses.length > 0 || report.providedContext.length > 0
                ? ("strong" as const)
                : ("watch" as const),
            detail: "Insight fallback was reconstructed from stored narrative sections.",
          },
          {
            key: "precise",
            label: "Precise",
            status: "watch" as const,
            detail: "A regenerated payload will include the upgraded precision assessment.",
          },
          {
            key: "actionable",
            label: "Actionable",
            status: report.recommendations.length > 0 ? ("strong" as const) : ("watch" as const),
            detail: "Recommendations were recovered from the existing report payload.",
          },
        ],
  };
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

function coverageTone(status: AuditReportPayload["execution"]["coverage"][number]["status"]) {
  switch (status) {
    case "included":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-100";
    case "skipped":
      return "border-rose-500/20 bg-rose-500/10 text-rose-100";
    default:
      return "border-amber-500/20 bg-amber-500/10 text-amber-100";
  }
}

function coverageLabel(status: AuditReportPayload["execution"]["coverage"][number]["status"]) {
  switch (status) {
    case "included":
      return "Live-ready included";
    case "skipped":
      return "Skipped during run";
    default:
      return "Not live-ready";
  }
}

function taskDateLabel(task: TaskManagementItemSnapshot, locale: string) {
  if (!task.updatedAt && !task.dueDate) {
    return "No date";
  }
  if (task.updatedAt) {
    return `Updated ${formatDateTime(task.updatedAt, locale)}`;
  }
  return `Due ${formatDate(task.dueDate, locale)}`;
}

interface ChartDatum {
  label: string;
  value: number;
  secondary?: string;
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
              <h3 className="text-sm font-semibold text-white">{sanitizeNarrativeTitle(item.title)}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{sanitizeNarrativeText(item.detail)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MiniBarChart({
  title,
  items,
  emptyMessage,
  locale,
}: {
  title: string;
  items: ChartDatum[];
  emptyMessage: string;
  locale: string;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 0);

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
          {items.map((item) => {
            const width = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 8) : 8;
            return (
              <article
                key={item.label}
                className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    {item.secondary ? (
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {item.secondary}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-200">
                    {formatNumber(item.value, locale)}
                  </p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/5">
                  <div
                    className="h-2 rounded-full bg-[linear-gradient(90deg,#f3c15b_0%,#47bf8f_100%)]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function IntegrationCoverageSection({
  coverage,
}: {
  coverage: AuditReportPayload["execution"]["coverage"];
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Integration coverage</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Only live-ready integrations are used as performance evidence in this report.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {coverage.length} checked
        </span>
      </div>
      {coverage.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No integration coverage details were stored with this report.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {coverage.map((item) => (
            <article
              key={item.id}
              className={`rounded-[1.25rem] border p-4 ${coverageTone(item.status)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] opacity-75">
                    {item.platformKey.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="rounded-full border border-current/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em]">
                  {coverageLabel(item.status)}
                </span>
              </div>
              {item.reason ? (
                <p className="mt-3 text-sm leading-6 opacity-90">{item.reason}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskList({
  title,
  tasks,
  locale,
}: {
  title: string;
  tasks: TaskManagementItemSnapshot[];
  locale: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No matching tasks for this report month.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {tasks.slice(0, 6).map((task) => (
            <article
              key={`${task.id}-${task.updatedAt ?? task.dueDate ?? task.title}`}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <p className="text-sm font-medium text-slate-200">{task.title}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                {task.status} · {taskDateLabel(task, locale)}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskActionsSection({
  taskManagement,
  locale,
}: {
  taskManagement: AuditReportPayload["snapshot"]["taskManagement"];
  locale: string;
}) {
  if (!taskManagement) {
    return null;
  }

  const actionedTasks = taskManagement.actionedTasks ?? [];
  const completedTasks = taskManagement.completedTasksInPeriod ?? [];
  const activeTouchedTasks = taskManagement.activeTasksTouchedInPeriod ?? [];
  const overdueOrBlockedTasks = taskManagement.overdueOrBlockedTasks ?? [];

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Actions performed this month</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {taskManagement.provider} context from {taskManagement.folderName ?? taskManagement.folderId ?? "the client workspace"}.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {actionedTasks.length} touched
        </span>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <TaskList title="Completed in period" tasks={completedTasks} locale={locale} />
        <TaskList title="Active touched in period" tasks={activeTouchedTasks} locale={locale} />
        <TaskList title="Overdue or blocked" tasks={overdueOrBlockedTasks} locale={locale} />
      </div>
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
        `${report.summary.locationCount} locations`,
        `${report.execution.includedIntegrations.length} connected sources`,
        reportPeriod.baselinePeriodKey
          ? `Compared with ${reportPeriod.baselinePeriodKey}`
          : "No comparison month selected",
        `${report.findings.length} findings reviewed`,
      ]
    : [`${detail.contextEntries.length} context entries`, `${detail.reportPeriod.status} status`];
  const framework = buildFrameworkFallback(report);
  const visibleConfidenceNotes = report ? getClientVisibleConfidenceNotes(report) : [];
  const acquisitionChart = report
    ? (report.snapshot.trafficAttribution?.topSourceMediums ?? [])
        .slice(0, 5)
        .map((item) => ({
          label: `${item.source} / ${item.medium}`,
          value: item.sessions,
          secondary: `${Math.round(item.share * 100)}% share`,
        }))
    : [];
  const campaignChart = report
    ? getMeaningfulPaidCampaigns(report)
        .slice(0, 5)
        .map((campaign) => ({
          label: campaign.name,
          value: campaign.spend,
          secondary: report && inferObjectiveForReport(report).kind === "lead_generation"
            ? `CPL ${formatNumber(campaignCostPerConversion(campaign), locale, 2)}`
            : campaign.roas == null
              ? "ROAS N/A"
              : `ROAS ${campaign.roas.toFixed(2)}`,
        }))
    : [];
  const headlineMetrics = report ? deriveHeadlineMetrics(report) : [];
  const objective = report ? inferObjectiveForReport(report) : null;

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
                Monthly performance report built from connected platform data, comparison periods,
                and operational context captured by the team.
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
                    Compared with {reportPeriod.baselinePeriodKey}
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

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {headlineMetrics.map((metric) => (
            <article
              key={metric.key}
              className="rounded-[1.5rem] border border-white/10 bg-[#111925] p-5"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{metric.label}</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                {formatNumber(metric.value, locale, metric.digits ?? 0)}
              </p>
            </article>
          ))}
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
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    {getNarrativeHeadline(framework!, report)}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">Executive summary</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {sanitizeNarrativeText(framework?.executiveSummary ?? "")}
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-slate-300">
                  <span>Top risks: {report.summary.topRisks.length}</span>
                  <span>Strengths: {report.summary.strengths.length}</span>
                  <span>Compared with: {reportPeriod.baselinePeriodKey ?? "none"}</span>
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

            <div className="mt-6">
              <IntegrationCoverageSection coverage={report.execution.coverage ?? []} />
            </div>

            {report.snapshot.taskManagement ? (
              <div className="mt-6">
                <TaskActionsSection
                  taskManagement={report.snapshot.taskManagement}
                  locale={locale}
                />
              </div>
            ) : null}

            {report && objective?.kind === "lead_generation" ? (
              <section className="mt-6 rounded-[1.5rem] border border-[#8f7a2f]/30 bg-[#161a16] p-5">
                <h2 className="text-lg font-semibold text-white">Lead generation lens</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  This report is being interpreted as a lead-generation report. Paid media performance
                  is prioritized around {objective.primaryConversionLabel.toLowerCase()}, spend, and cost per lead
                  rather than ROAS.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{objective.primaryConversionLabel}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatNumber(report.snapshot.paidMedia?.purchases, locale, 0)}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Spend</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatNumber(report.snapshot.paidMedia?.spend, locale, 2)}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Cost per lead</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatNumber(costPerConversion(report.snapshot.paidMedia), locale, 2)}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {report.snapshot.paidMediaSources.length > 1 ? (
              <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Paid media by source</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Rollup metrics are aggregated, while each live-ready ad platform remains visible by source.
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    {report.snapshot.paidMediaSources.length} sources
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {report.snapshot.paidMediaSources.map((source) => (
                    <article
                      key={`${source.platformKey}-${source.adAccountId ?? source.platformLabel}`}
                      className="rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4"
                    >
                      <p className="text-sm font-semibold text-white">{source.platformLabel}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-300">
                        <span>Spend: {formatNumber(source.spend, locale, 2)}</span>
                        <span>Clicks: {formatNumber(source.clicks, locale)}</span>
                        <span>Conversions: {formatNumber(source.purchases, locale)}</span>
                        <span>
                          {objective?.kind === "lead_generation"
                            ? `CPL: ${formatNumber(costPerConversion(source), locale, 2)}`
                            : `ROAS: ${source.roas == null ? "N/A" : formatNumber(source.roas, locale, 2)}`}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-6 grid gap-4 xl:grid-cols-3">
              <NarrativeSection
                title="Key outcomes"
                items={sanitizeNarrativeItems(framework?.whatHappened ?? [])}
                emptyMessage="No primary result narrative was generated for this period."
              />
              <NarrativeSection
                title="What influenced the month"
                items={sanitizeNarrativeItems(framework?.whyItHappened ?? [])}
                emptyMessage="No explanation layer was generated yet."
              />
              <NarrativeSection
                title="Next actions"
                items={sanitizeNarrativeItems(framework?.whatWeAreDoing ?? [])}
                emptyMessage="No next-step plan was generated yet."
              />
            </section>

            {framework?.clientEmailDraft ? (
              <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Client-ready follow-up
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-white">Client email draft</h2>
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-100">
                    Human agency POV
                  </span>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-[1.25rem] border border-white/10 bg-[#0d1520] p-4 font-sans text-sm leading-6 text-slate-300">
                  {framework.clientEmailDraft}
                </pre>
              </section>
            ) : null}

            <section className="mt-6 grid gap-4 xl:grid-cols-2">
              <MiniBarChart
                title="Acquisition mix"
                items={acquisitionChart}
                emptyMessage="No acquisition mix data is available yet."
                locale={locale}
              />
              <MiniBarChart
                title="Paid spend by campaign"
                items={campaignChart}
                emptyMessage="No paid media campaign data is available yet."
                locale={locale}
              />
            </section>

            <section className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#111925] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Data coverage notes</h2>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {visibleConfidenceNotes.length} notes
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {visibleConfidenceNotes.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No special data coverage limitations were flagged for this report.
                  </p>
                ) : (
                  visibleConfidenceNotes.map((note) => (
                  <article
                    key={`${note.label}-${note.detail}`}
                    className={`rounded-[1.25rem] border p-4 ${confidenceTone(note.level)}`}
                  >
                    <p className="text-sm font-semibold">{note.label}</p>
                    <p className="mt-2 text-sm leading-6 opacity-90">{note.detail}</p>
                  </article>
                  ))
                )}
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
