"use client";

import { useState, type InputHTMLAttributes } from "react";
import { deleteJson, patchJson, postJson } from "@/lib/api-client";
import { getPreviousMonthKey } from "@/lib/report-scheduler-utils";

interface ContextEntryView {
  id: string;
  channel: string | null;
  source: string | null;
  campaignReference: string | null;
  entryType:
    | "note"
    | "budget_change"
    | "campaign_change"
    | "landing_page"
    | "tracking_issue"
    | "sales_issue"
    | "seo_change"
    | "other";
  text: string;
  tags: string[];
  authorName: string;
  createdAt: string;
}

type ContextEntryType = ContextEntryView["entryType"];

interface ContextTemplate {
  entryType: ContextEntryType;
  label: string;
  description: string;
  placeholder: string;
  tags: readonly string[];
}

const contextEntryTemplates: readonly ContextTemplate[] = [
  {
    entryType: "note",
    label: "Operator note",
    description: "Use this for a general observation that helps explain the month.",
    placeholder: "Example: Lead quality improved after the team started calling new leads within 5 minutes.",
    tags: [],
  },
  {
    entryType: "budget_change",
    label: "Budget changed",
    description: "Use this when media budgets, pacing, or spend caps moved during the month.",
    placeholder: "Example: Paid search budget was reduced 20% after CPL spiked in the second half of the month.",
    tags: ["guided-checklist", "budget"],
  },
  {
    entryType: "campaign_change",
    label: "Campaigns launched or paused",
    description: "Use this when campaigns, audiences, or creative rotations changed materially.",
    placeholder: "Example: We paused non-brand prospecting and launched a local offer campaign on April 12.",
    tags: ["guided-checklist", "campaign"],
  },
  {
    entryType: "landing_page",
    label: "Landing page or offer changed",
    description: "Use this when forms, pages, CTAs, pricing, or promotions changed.",
    placeholder: "Example: The lead form was shortened and the main offer changed on the home page.",
    tags: ["guided-checklist", "landing-page"],
  },
  {
    entryType: "tracking_issue",
    label: "Tracking issue",
    description: "Use this when GA4, pixels, UTMs, CRM sync, or attribution tracking broke.",
    placeholder: "Example: Meta conversions stopped syncing for three days after a site deployment.",
    tags: ["guided-checklist", "tracking"],
  },
  {
    entryType: "sales_issue",
    label: "Sales or lead quality issue",
    description: "Use this when close rate, qualification, operations, or response time changed.",
    placeholder: "Example: Sales follow-up slowed down because the team was onboarding a new rep.",
    tags: ["guided-checklist", "sales"],
  },
  {
    entryType: "seo_change",
    label: "SEO or local profile change",
    description: "Use this when listings, categories, pages, content, or technical SEO changed.",
    placeholder: "Example: The GBP categories were updated and two location pages were refreshed mid-month.",
    tags: ["guided-checklist", "seo"],
  },
  {
    entryType: "other",
    label: "Other",
    description: "Use this when the change matters for the report but does not fit the presets above.",
    placeholder: "Example: The client changed call routing and weekend leads stopped reaching the sales team.",
    tags: [],
  },
] as const;

const defaultContextEntryType: ContextEntryType = "note";

interface ReportPeriodMutationResponse {
  reportPeriod: ReportPeriodView;
}

function formatMonthLabel(periodKey: string | null | undefined) {
  if (!periodKey) return "No comparison month";
  const [year, month] = periodKey.split("-").map((item) => Number(item));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return periodKey;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function summarizeBusinessInputs(reportPeriod: ReportPeriodView) {
  const parts: string[] = [];
  if (reportPeriod.manualInputs.leads != null) parts.push(`${reportPeriod.manualInputs.leads} leads`);
  if (reportPeriod.manualInputs.sales != null) parts.push(`${reportPeriod.manualInputs.sales} sales`);
  if (reportPeriod.manualInputs.revenue != null) parts.push(`${reportPeriod.manualInputs.revenue} revenue`);
  if (reportPeriod.manualInputs.notes) parts.push("notes added");
  return parts.length > 0 ? parts.join(" · ") : "Using connected data only";
}

export interface ReportPeriodView {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  baselinePeriodId: string | null;
  baselinePeriodKey: string | null;
  status: "draft" | "queued" | "running" | "completed" | "failed";
  auditId: string | null;
  generatedAt: string | null;
  manualInputs: {
    leads: number | null;
    qualifiedLeads: number | null;
    sales: number | null;
    revenue: number | null;
    notes: string | null;
  };
  contextEntries: ContextEntryView[];
}

export function ReportPeriodPanel({
  clientId,
  reportPeriods,
  readyIntegrationCount,
  runTask,
}: {
  clientId: string;
  reportPeriods: ReportPeriodView[];
  readyIntegrationCount: number;
  runTask: <T>(
    task: () => Promise<T>,
    successMessage: string,
    onSuccess?: (result: T) => void,
  ) => void;
}) {
  const [prepPeriodId, setPrepPeriodId] = useState<string | null>(null);
  const [newPeriodKey, setNewPeriodKey] = useState("");
  const [newComparisonMonth, setNewComparisonMonth] = useState("");

  return (
    <section className="mt-5 rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">Monthly reports</h4>
          <p className="mt-1 text-sm text-slate-400">
            Choose the month you want to report on, pick the month to compare against, then open
            that month to add optional context right before generating the client-facing report.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
          {readyIntegrationCount} live-ready
        </span>
      </div>

      <form
        className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const periodKey = newPeriodKey.trim();
          const baselinePeriodKey =
            newComparisonMonth.trim() ||
            getPreviousMonthKey(periodKey) ||
            "";
          runTask(
            () =>
              postJson<ReportPeriodMutationResponse>(`/api/clients/${clientId}/report-periods`, {
                periodKey,
                baselinePeriodKey: baselinePeriodKey || null,
              }),
            `Report month ${periodKey} created.`,
            (result) => {
              setPrepPeriodId(result.reportPeriod.id);
              setNewPeriodKey("");
              setNewComparisonMonth("");
            },
          );
        }}
      >
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            1. Report month
          </span>
          <input
            name="periodKey"
            type="month"
            value={newPeriodKey}
            onChange={(event) => setNewPeriodKey(event.currentTarget.value)}
            className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
            required
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            2. Compare against
          </span>
          <input
            name="baselinePeriodKey"
            type="month"
            value={newComparisonMonth}
            onChange={(event) => setNewComparisonMonth(event.currentTarget.value)}
            className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
        >
          Create month
        </button>
      </form>

      <div className="mt-4 grid gap-4">
        {reportPeriods.length === 0 ? (
          <div className="rounded-[1rem] border border-dashed border-white/12 px-4 py-4 text-sm text-slate-400">
            No monthly periods yet.
          </div>
        ) : (
          reportPeriods.map((reportPeriod) => (
            <article
              key={reportPeriod.id}
              className="rounded-[1.25rem] border border-white/10 bg-[#182230] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {formatMonthLabel(reportPeriod.periodKey)}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {reportPeriod.periodStart} to {reportPeriod.periodEnd}
                    {reportPeriod.baselinePeriodKey
                      ? ` · compared with ${formatMonthLabel(reportPeriod.baselinePeriodKey)}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                    {reportPeriod.status}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-[#8f7a2f] bg-[linear-gradient(135deg,#f3c15b_0%,#dba93a_100%)] px-4 py-2 text-sm font-medium text-[#11161f] disabled:opacity-50"
                    disabled={readyIntegrationCount === 0}
                    onClick={() =>
                      setPrepPeriodId((current) =>
                        current === reportPeriod.id ? null : reportPeriod.id,
                      )
                    }
                  >
                    {prepPeriodId === reportPeriod.id
                      ? "Close month setup"
                      : "Open month setup"}
                  </button>
                  <a
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                    href={`/reports/${reportPeriod.id}`}
                  >
                    Open page
                  </a>
                  <a
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                    href={`/api/report-periods/${reportPeriod.id}/report.json`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    JSON
                  </a>
                  <a
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                    href={`/api/report-periods/${reportPeriod.id}/report.pdf`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    PDF
                  </a>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-[1rem] border border-white/10 bg-[#0f1723] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Report month</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatMonthLabel(reportPeriod.periodKey)}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {reportPeriod.periodStart} to {reportPeriod.periodEnd}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-[#0f1723] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Comparison month</p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {formatMonthLabel(reportPeriod.baselinePeriodKey)}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {reportPeriod.baselinePeriodKey
                      ? "Used only to compare this month's performance."
                      : "Add one when you want month-over-month analysis."}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-[#0f1723] px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Optional business inputs</p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {summarizeBusinessInputs(reportPeriod)}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    {reportPeriod.contextEntries.length} context note
                    {reportPeriod.contextEntries.length === 1 ? "" : "s"} attached.
                  </p>
                </div>
              </div>

              {prepPeriodId === reportPeriod.id ? (
                <div className="mt-4 rounded-[1rem] border border-[#8f7a2f]/30 bg-[#111925] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Month setup and report generation
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Keep this flow simple: confirm the comparison month, import or add any
                        optional offline notes, then generate the report.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-[#8f7a2f] bg-[linear-gradient(135deg,#f3c15b_0%,#dba93a_100%)] px-4 py-2 text-sm font-medium text-[#11161f] disabled:opacity-50"
                      disabled={readyIntegrationCount === 0}
                      onClick={() =>
                        runTask(
                          () => postJson(`/api/report-periods/${reportPeriod.id}/generate`, {}),
                          `Monthly report requested for ${reportPeriod.periodKey}.`,
                        )
                      }
                    >
                      Generate monthly report
                    </button>
                  </div>

                  <form
                    className="mt-4 rounded-[1rem] border border-white/10 bg-[#0f1723] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      runTask(
                        () =>
                          patchJson<ReportPeriodMutationResponse>(`/api/report-periods/${reportPeriod.id}`, {
                            baselinePeriodKey:
                              String(formData.get("baselinePeriodKey") ?? "").trim() || null,
                          }),
                        `Comparison month saved for ${reportPeriod.periodKey}.`,
                      );
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Comparison month</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Choose the month that should be used for month-over-month comparison in
                          this report.
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        Save comparison month
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <div className="rounded-2xl border border-white/10 bg-[#111925] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Report month
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {formatMonthLabel(reportPeriod.periodKey)}
                        </p>
                      </div>
                      <label className="grid gap-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          Compare against
                        </span>
                        <CompactInput
                          name="baselinePeriodKey"
                          type="month"
                          defaultValue={
                            reportPeriod.baselinePeriodKey ??
                            getPreviousMonthKey(reportPeriod.periodKey) ??
                            ""
                          }
                        />
                      </label>
                    </div>
                  </form>

                  <form
                    className="mt-4 rounded-[1rem] border border-white/10 bg-[#0f1723] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const toNullableNumber = (value: FormDataEntryValue | null) => {
                        const normalized = String(value ?? "").trim();
                        if (!normalized) return null;
                        const numeric = Number(normalized);
                        return Number.isFinite(numeric) ? numeric : null;
                      };
                      runTask(
                        () =>
                          patchJson<ReportPeriodMutationResponse>(`/api/report-periods/${reportPeriod.id}`, {
                            manualInputs: {
                              leads: toNullableNumber(formData.get("leads")),
                              qualifiedLeads: toNullableNumber(formData.get("qualifiedLeads")),
                              sales: toNullableNumber(formData.get("sales")),
                              revenue: toNullableNumber(formData.get("revenue")),
                              notes: String(formData.get("notes") ?? "").trim() || null,
                            },
                          }),
                        `Optional business inputs saved for ${reportPeriod.periodKey}.`,
                      );
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Optional offline notes and totals</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Only use this when the report needs CRM totals, offline revenue, or extra
                          business notes that do not already come from the connected sources.
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        Save optional inputs
                      </button>
                    </div>
                    <textarea
                      name="notes"
                      placeholder="Optional business notes, sales context, or offline outcomes"
                      defaultValue={reportPeriod.manualInputs.notes ?? ""}
                      className="mt-4 min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <details className="mt-3 rounded-2xl border border-white/10 bg-[#111925]">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">
                        Enter manual totals only if needed
                        <span className="ml-2 text-xs font-normal text-slate-500">(optional)</span>
                      </summary>
                      <div className="grid gap-3 border-t border-white/10 px-4 py-4 lg:grid-cols-4">
                        <CompactInput
                          name="leads"
                          placeholder="Leads"
                          defaultValue={reportPeriod.manualInputs.leads ?? ""}
                        />
                        <CompactInput
                          name="qualifiedLeads"
                          placeholder="Qualified leads"
                          defaultValue={reportPeriod.manualInputs.qualifiedLeads ?? ""}
                        />
                        <CompactInput
                          name="sales"
                          placeholder="Sales"
                          defaultValue={reportPeriod.manualInputs.sales ?? ""}
                        />
                        <CompactInput
                          name="revenue"
                          placeholder="Revenue"
                          defaultValue={reportPeriod.manualInputs.revenue ?? ""}
                        />
                      </div>
                    </details>
                  </form>

                  <form
                    className="mt-4 rounded-[1rem] border border-white/10 bg-[#0f1723] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const sourceType = String(formData.get("sourceType") ?? "paste");
                      const payload = String(formData.get("payload") ?? "");
                      const sheetUrl = String(formData.get("sheetUrl") ?? "").trim();
                      runTask(
                        () =>
                          postJson(`/api/report-periods/${reportPeriod.id}/import`, {
                            sourceType,
                            payload,
                            sheetUrl,
                          }),
                        `Business metrics imported for ${reportPeriod.periodKey}.`,
                      );
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Import optional business totals</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Paste CSV or use a Google Sheets URL only when you want to bring offline
                          business totals into this month. If multiple months are included, the
                          matching row is picked automatically.
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        Import totals
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
                      <select
                        name="sourceType"
                        className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                        defaultValue="paste"
                      >
                        <option value="paste">Paste CSV / TSV</option>
                        <option value="sheet_url">Google Sheets URL</option>
                      </select>
                      <CompactInput
                        name="sheetUrl"
                        placeholder="Google Sheets URL (used only when source = Google Sheets URL)"
                      />
                      <textarea
                        name="payload"
                        placeholder="Paste a table with headers like periodKey, leads, qualifiedLeads, sales, revenue, notes"
                        className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 lg:col-span-2"
                      />
                    </div>
                  </form>

                  <ContextComposer
                    periodKey={reportPeriod.periodKey}
                    reportPeriodId={reportPeriod.id}
                    runTask={runTask}
                  />

                  <div className="mt-4 grid gap-2">
                    {reportPeriod.contextEntries.length === 0 ? (
                      <div className="rounded-[1rem] border border-dashed border-white/12 px-3 py-3 text-sm text-slate-400">
                        No context notes added yet for this report month.
                      </div>
                    ) : (
                      reportPeriod.contextEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-[1rem] border border-white/10 bg-[#0e1621] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-medium text-white">
                              {entry.entryType.replaceAll("_", " ")}
                              {entry.channel ? ` · ${entry.channel}` : ""}
                              {entry.source ? ` · ${entry.source}` : ""}
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xs text-slate-500">
                                {entry.authorName} · {new Date(entry.createdAt).toLocaleDateString()}
                              </p>
                              <button
                                type="button"
                                className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/15"
                                onClick={() => {
                                  if (!window.confirm("Remove this context note?")) {
                                    return;
                                  }
                                  runTask(
                                    () => deleteJson(`/api/context-entries/${entry.id}`),
                                    `Context note removed from ${reportPeriod.periodKey}.`,
                                  );
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{entry.text}</p>
                          {entry.tags.length > 0 ? (
                            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                              {entry.tags.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getContextTemplate(entryType: ContextEntryType) {
  return (
    contextEntryTemplates.find((item) => item.entryType === entryType) ??
    contextEntryTemplates[0]
  );
}

function ContextComposer({
  periodKey,
  reportPeriodId,
  runTask,
}: {
  periodKey: string;
  reportPeriodId: string;
  runTask: <T>(
    task: () => Promise<T>,
    successMessage: string,
    onSuccess?: (result: T) => void,
  ) => void;
}) {
  const [entryType, setEntryType] = useState<ContextEntryType>(defaultContextEntryType);
  const selectedTemplate = getContextTemplate(entryType);

  return (
    <form
      className="mt-4 rounded-[1rem] border border-white/10 bg-[#0f1723] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const nextEntryType = String(
          formData.get("entryType") ?? defaultContextEntryType,
        ) as ContextEntryType;
        const template = getContextTemplate(nextEntryType);
        const text = String(formData.get("text") ?? "").trim();
        const tags = [
          ...new Set([
            ...template.tags,
            ...parseTags(String(formData.get("tags") ?? "")),
          ]),
        ];

        runTask(
          () =>
            postJson(`/api/report-periods/${reportPeriodId}/context`, {
              entryType: nextEntryType,
              channel: String(formData.get("channel") ?? "").trim() || null,
              source: String(formData.get("source") ?? "").trim() || null,
              campaignReference: String(formData.get("campaignReference") ?? "").trim() || null,
              text,
              tags,
              effectiveStartDate:
                String(formData.get("effectiveStartDate") ?? "").trim() || null,
              effectiveEndDate:
                String(formData.get("effectiveEndDate") ?? "").trim() || null,
            }),
          `Context note added to ${periodKey}.`,
        );

        event.currentTarget.reset();
        setEntryType(defaultContextEntryType);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Context note</p>
          <p className="mt-1 text-sm text-slate-400">
            Choose the type of change, then describe what happened and why it matters for the
            report.
          </p>
        </div>
        <button
          type="submit"
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
        >
          Add context
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <select
          name="entryType"
          value={entryType}
          onChange={(event) => setEntryType(event.currentTarget.value as ContextEntryType)}
          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
        >
          {contextEntryTemplates.map((item) => (
            <option key={item.entryType} value={item.entryType}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="rounded-2xl border border-white/10 bg-[#111925] px-4 py-3">
          <p className="text-sm font-medium text-white">{selectedTemplate.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{selectedTemplate.description}</p>
        </div>
      </div>

      <textarea
        name="text"
        required
        placeholder={selectedTemplate.placeholder}
        className="mt-3 min-h-28 w-full rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />

      <details className="mt-3 rounded-2xl border border-white/10 bg-[#111925]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">
          Add details like channel, source, tags, or dates
          <span className="ml-2 text-xs font-normal text-slate-500">(optional)</span>
        </summary>
        <div className="grid gap-3 border-t border-white/10 px-4 py-4 lg:grid-cols-2">
          <CompactInput name="channel" placeholder="Channel" />
          <CompactInput name="source" placeholder="Source" />
          <CompactInput name="campaignReference" placeholder="Campaign reference" />
          <CompactInput name="tags" placeholder="Tags comma-separated" />
          <CompactInput name="effectiveStartDate" placeholder="Effective start" type="date" />
          <CompactInput name="effectiveEndDate" placeholder="Effective end" type="date" />
        </div>
      </details>
    </form>
  );
}

function CompactInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 ${className}`}
    />
  );
}
