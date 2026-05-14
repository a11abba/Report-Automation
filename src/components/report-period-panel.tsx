"use client";

import type { InputHTMLAttributes } from "react";
import { patchJson, postJson } from "@/lib/api-client";

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

const guidedChecklistItems = [
  {
    key: "budget",
    label: "Budget changed",
    entryType: "budget_change" as const,
    description: "Use this when media budgets, pacing, or spend caps moved during the month.",
    placeholder: "Example: Paid search budget was reduced 20% after CPL spiked in the second half of the month.",
    defaultText: "Budget or spend pacing changed during the period.",
    tags: ["guided-checklist", "budget"],
  },
  {
    key: "campaign",
    label: "Campaigns launched or paused",
    entryType: "campaign_change" as const,
    description: "Use this when campaigns, audiences, or creative rotations changed materially.",
    placeholder: "Example: We paused non-brand prospecting and launched a local offer campaign on April 12.",
    defaultText: "Campaign coverage changed during the period.",
    tags: ["guided-checklist", "campaign"],
  },
  {
    key: "landing-page",
    label: "Landing page or offer changed",
    entryType: "landing_page" as const,
    description: "Use this when forms, pages, CTAs, pricing, or promotions changed.",
    placeholder: "Example: The lead form was shortened and the main offer changed on the home page.",
    defaultText: "Landing page, form, or offer experience changed during the period.",
    tags: ["guided-checklist", "landing-page"],
  },
  {
    key: "tracking",
    label: "Tracking issue",
    entryType: "tracking_issue" as const,
    description: "Use this when GA4, pixels, UTMs, CRM sync, or attribution tracking broke.",
    placeholder: "Example: Meta conversions stopped syncing for three days after a site deployment.",
    defaultText: "Tracking reliability changed during the period.",
    tags: ["guided-checklist", "tracking"],
  },
  {
    key: "sales",
    label: "Sales or lead quality issue",
    entryType: "sales_issue" as const,
    description: "Use this when close rate, qualification, operations, or response time changed.",
    placeholder: "Example: Sales follow-up slowed down because the team was onboarding a new rep.",
    defaultText: "Sales operations or lead quality changed during the period.",
    tags: ["guided-checklist", "sales"],
  },
  {
    key: "seo",
    label: "SEO or local profile change",
    entryType: "seo_change" as const,
    description: "Use this when listings, categories, pages, content, or technical SEO changed.",
    placeholder: "Example: The GBP categories were updated and two location pages were refreshed mid-month.",
    defaultText: "SEO or local profile setup changed during the period.",
    tags: ["guided-checklist", "seo"],
  },
] as const;

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
  clientName,
  reportPeriods,
  readyIntegrationCount,
  runTask,
}: {
  clientId: string;
  clientName: string;
  reportPeriods: ReportPeriodView[];
  readyIntegrationCount: number;
  runTask: (task: () => Promise<unknown>, successMessage: string) => void;
}) {
  return (
    <section className="mt-5 rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">Monthly report runs</h4>
          <p className="mt-1 text-sm text-slate-400">
            Create a period, log context, save manual business inputs, and generate a client-facing report.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
          {readyIntegrationCount} live-ready
        </span>
      </div>

      <form
        className="mt-4 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const periodKey = String(formData.get("periodKey") ?? "").trim();
          const baselinePeriodId = String(formData.get("baselinePeriodId") ?? "").trim();
          runTask(
            () =>
              postJson(`/api/clients/${clientId}/report-periods`, {
                periodKey,
                baselinePeriodId: baselinePeriodId || null,
              }),
            `Monthly report period ${periodKey} created for ${clientName}.`,
          );
          event.currentTarget.reset();
        }}
      >
        <input
          name="periodKey"
          type="month"
          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
          required
        />
        <select
          name="baselinePeriodId"
          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
          defaultValue=""
        >
          <option value="">No baseline</option>
          {reportPeriods.map((reportPeriod) => (
            <option key={reportPeriod.id} value={reportPeriod.id}>
              {reportPeriod.periodKey}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
        >
          Create period
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
                  <p className="text-sm font-semibold text-white">{reportPeriod.periodKey}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {reportPeriod.periodStart} to {reportPeriod.periodEnd}
                    {reportPeriod.baselinePeriodKey ? ` · baseline ${reportPeriod.baselinePeriodKey}` : ""}
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
                      runTask(
                        () => postJson(`/api/report-periods/${reportPeriod.id}/generate`, {}),
                        `Monthly report generation requested for ${clientName} ${reportPeriod.periodKey}.`,
                      )
                    }
                  >
                    Generate report
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

              <form
                className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
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
                      patchJson(`/api/report-periods/${reportPeriod.id}`, {
                        baselinePeriodId:
                          String(formData.get("baselinePeriodId") ?? "").trim() || null,
                        manualInputs: {
                          leads: toNullableNumber(formData.get("leads")),
                          qualifiedLeads: toNullableNumber(formData.get("qualifiedLeads")),
                          sales: toNullableNumber(formData.get("sales")),
                          revenue: toNullableNumber(formData.get("revenue")),
                          notes: String(formData.get("notes") ?? "").trim() || null,
                        },
                      }),
                    `Manual inputs saved for ${clientName} ${reportPeriod.periodKey}.`,
                  );
                }}
              >
                <select
                  name="baselinePeriodId"
                  className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                  defaultValue={reportPeriod.baselinePeriodId ?? ""}
                >
                  <option value="">No baseline</option>
                  {reportPeriods
                    .filter((item) => item.id !== reportPeriod.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.periodKey}
                      </option>
                    ))}
                </select>
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
                <button
                  type="submit"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                >
                  Save inputs
                </button>
                <textarea
                  name="notes"
                  placeholder="Business notes or manual outcome comments"
                  defaultValue={reportPeriod.manualInputs.notes ?? ""}
                  className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 lg:col-span-6"
                />
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
                    `Business metrics imported for ${clientName} ${reportPeriod.periodKey}.`,
                  );
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Business metrics import</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Import leads, qualified leads, sales, revenue, and notes from pasted CSV/TSV
                      data or a Google Sheets export.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    Import business inputs
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

              <form
                className="mt-4 rounded-[1rem] border border-white/10 bg-[#0f1723] p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  const selectedEntries = guidedChecklistItems
                    .filter((item) => String(formData.get(`selected-${item.key}`) ?? "") === "on")
                    .map((item) => {
                      const note = String(formData.get(`note-${item.key}`) ?? "").trim();
                      return {
                        entryType: item.entryType,
                        channel: String(formData.get("checklistChannel") ?? "").trim() || null,
                        source: String(formData.get("checklistSource") ?? "").trim() || null,
                        campaignReference:
                          String(formData.get("checklistCampaignReference") ?? "").trim() || null,
                        text: note || item.defaultText,
                        tags: [
                          ...new Set([
                            ...item.tags,
                            ...parseTags(String(formData.get("checklistTags") ?? "")),
                          ]),
                        ],
                        effectiveStartDate:
                          String(formData.get("checklistEffectiveStartDate") ?? "").trim() || null,
                        effectiveEndDate:
                          String(formData.get("checklistEffectiveEndDate") ?? "").trim() || null,
                      };
                    });

                  runTask(async () => {
                    if (selectedEntries.length === 0) {
                      throw new Error("Select at least one guided checklist item before saving.");
                    }

                    await Promise.all(
                      selectedEntries.map((entry) =>
                        postJson(`/api/report-periods/${reportPeriod.id}/context`, entry),
                      ),
                    );
                  }, `${selectedEntries.length} guided context item(s) added to ${clientName} ${reportPeriod.periodKey}.`);
                  event.currentTarget.reset();
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Guided context checklist</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Capture structured operational context before generating the report. Each
                      selected item becomes its own context entry.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    Save checklist items
                  </button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {guidedChecklistItems.map((item) => (
                    <label
                      key={item.key}
                      className="rounded-[1rem] border border-white/10 bg-[#111925] p-4"
                    >
                      <span className="flex items-start gap-3">
                        <input
                          name={`selected-${item.key}`}
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-white">{item.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">
                            {item.description}
                          </span>
                        </span>
                      </span>
                      <textarea
                        name={`note-${item.key}`}
                        placeholder={item.placeholder}
                        className="mt-3 min-h-20 w-full rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <CompactInput name="checklistChannel" placeholder="Channel (optional)" />
                  <CompactInput name="checklistSource" placeholder="Source (optional)" />
                  <CompactInput
                    name="checklistCampaignReference"
                    placeholder="Campaign reference (optional)"
                  />
                  <CompactInput
                    name="checklistTags"
                    placeholder="Extra tags comma-separated"
                  />
                  <div className="rounded-2xl border border-dashed border-white/12 px-4 py-3 text-xs leading-5 text-slate-400">
                    Use the fields on this row to attach the same channel, source, campaign, or
                    tags to every selected checklist item.
                  </div>
                  <CompactInput
                    name="checklistEffectiveStartDate"
                    placeholder="Effective start"
                    type="date"
                  />
                  <CompactInput
                    name="checklistEffectiveEndDate"
                    placeholder="Effective end"
                    type="date"
                  />
                </div>
              </form>

              <form
                className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  const tags = parseTags(String(formData.get("tags") ?? ""));
                  runTask(
                    () =>
                      postJson(`/api/report-periods/${reportPeriod.id}/context`, {
                        entryType: String(formData.get("entryType") ?? "note"),
                        channel: String(formData.get("channel") ?? "").trim() || null,
                        source: String(formData.get("source") ?? "").trim() || null,
                        campaignReference:
                          String(formData.get("campaignReference") ?? "").trim() || null,
                        text: String(formData.get("text") ?? ""),
                        tags,
                        effectiveStartDate:
                          String(formData.get("effectiveStartDate") ?? "").trim() || null,
                        effectiveEndDate:
                          String(formData.get("effectiveEndDate") ?? "").trim() || null,
                      }),
                    `Context entry added to ${clientName} ${reportPeriod.periodKey}.`,
                  );
                  event.currentTarget.reset();
                }}
              >
                <select
                  name="entryType"
                  className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                  defaultValue="note"
                >
                  <option value="note">Operator note</option>
                  <option value="budget_change">Budget change</option>
                  <option value="campaign_change">Campaign change</option>
                  <option value="landing_page">Landing page change</option>
                  <option value="tracking_issue">Tracking issue</option>
                  <option value="sales_issue">Sales issue</option>
                  <option value="seo_change">SEO change</option>
                  <option value="other">Other</option>
                </select>
                <CompactInput name="channel" placeholder="Channel" />
                <CompactInput name="source" placeholder="Source" />
                <CompactInput name="campaignReference" placeholder="Campaign reference" />
                <button
                  type="submit"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                >
                  Add context
                </button>
                <CompactInput
                  name="tags"
                  placeholder="Tags comma-separated"
                  className="lg:col-span-2"
                />
                <CompactInput
                  name="effectiveStartDate"
                  placeholder="Effective start"
                  type="date"
                />
                <CompactInput
                  name="effectiveEndDate"
                  placeholder="Effective end"
                  type="date"
                />
                <textarea
                  name="text"
                  required
                  placeholder="What changed during the period, and why does it matter?"
                  className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 lg:col-span-5"
                />
              </form>

              <div className="mt-4 grid gap-2">
                {reportPeriod.contextEntries.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-white/12 px-3 py-3 text-sm text-slate-400">
                    No context entries yet for this period.
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
                        <p className="text-xs text-slate-500">
                          {entry.authorName} · {new Date(entry.createdAt).toLocaleDateString()}
                        </p>
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
