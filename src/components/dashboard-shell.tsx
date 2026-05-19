"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ReportPeriodPanel,
  type ReportPeriodView,
} from "@/components/report-period-panel";
import { deleteJson, getJson, patchJson, postForm, postJson } from "@/lib/api-client";
import type { AuthSession } from "@/lib/auth-session";
import { getReportFocusLabel } from "@/lib/report-focus";
import type {
  AppRole,
  AuditRecord,
  ConnectorHealthCheckResult,
  ConnectorMetadataResult,
  ConnectorValidationResult,
  IntegrationConnectionStatus,
  IntegrationPropertySummary,
  LocationRecord,
  PlatformDefinition,
  ReportFeedbackRating,
  RulePackMetadata,
} from "@/lib/audit/types";

function getRoleLabel(role: AppRole): string {
  switch (role) {
    case "platform_admin":
      return "Platform admin";
    case "account_admin":
      return "Client admin";
    case "account_operator":
      return "Client operator";
    case "account_user":
      return "Client admin";
  }
}

function getFeedbackLabel(rating: ReportFeedbackRating) {
  switch (rating) {
    case "approve":
      return "Approved";
    case "revise":
      return "Needs revision";
    case "reject":
      return "Rejected";
  }
}

function getFeedbackToneClasses(rating: ReportFeedbackRating) {
  switch (rating) {
    case "approve":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    case "revise":
      return "border-amber-500/20 bg-amber-500/10 text-amber-200";
    case "reject":
      return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  }
}

interface DashboardData {
  accounts: Array<{
    id: string;
    name: string;
    slug: string;
    subscriptionStatus: "trialing" | "active" | "past_due" | "paused" | "canceled";
    serviceTier: string;
    billingCycleAnchor: string | null;
    trialEndsAt: string | null;
    clientCount: number;
    readyIntegrations: number;
    lastAuditAt: string | null;
    members: Array<{
      id: string;
      accountId: string;
      userId: string | null;
      invitedEmail: string;
      role: "platform_admin" | "account_admin" | "account_operator";
      status: "invited" | "active" | "revoked";
      invitedByUserId: string | null;
      activatedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  currentAccount: {
    id: string;
    name: string;
    slug: string;
    subscriptionStatus: "trialing" | "active" | "past_due" | "paused" | "canceled" | null;
    serviceTier: string | null;
    billingCycleAnchor: string | null;
    trialEndsAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  platforms: PlatformDefinition[];
  rulePacks: RulePackMetadata[];
  pdfRenderer: {
    available: boolean;
    message: string;
  };
  reportMemories: Array<{
    id: string;
    accountId: string;
    title: string;
    sourceClientName: string | null;
    periodLabel: string | null;
    notes: string | null;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  clients: Array<{
    id: string;
    accountId: string;
    name: string;
    industry: string;
    industryLabelPt: string | null;
    operatingModel: "single_source" | "composed_source";
    primaryDomain: string | null;
    reportLanguage: "pt-BR" | "pt-PT" | "en";
    reportFocus: "full_funnel" | "lifecycle_marketing" | "seo_local" | "paid_media";
    reportIntro: string | null;
    reportBenchmarks: string | null;
    referenceReportNotes: string | null;
    monthlyReportEnabled: boolean;
    monthlyReportDay: number | null;
    monthlyReportAutoGenerate: boolean;
    integrations: Array<{
      id: string;
      platformKey: string;
      platformType: string;
      displayName: string;
      connectionStatus: IntegrationConnectionStatus;
      validationMessage: string;
      connectionDetails: ConnectorValidationResult;
      healthCheck: ConnectorHealthCheckResult | null;
      metadata: ConnectorMetadataResult | null;
      credentials: { authOrigin?: string };
      settings: {
        demoMode?: boolean;
        targetUrl?: string | null;
        ga4PropertyId?: string | null;
        adAccountId?: string | null;
        googleAdsCustomerId?: string | null;
        googleAdsLoginCustomerId?: string | null;
        propertyId?: string | null;
        businessAccountId?: string | null;
        businessProfileId?: string | null;
        microsoftCustomerId?: string | null;
        microsoftAccountId?: string | null;
        merchantStoreId?: string | null;
        merchantFeedId?: string | null;
      };
    }>;
    locations: LocationRecord[];
    audits: AuditRecord[];
    reportMemories: Array<{
      id: string;
      accountId: string;
      title: string;
      sourceClientName: string | null;
      periodLabel: string | null;
      notes: string | null;
      content: string;
      createdAt: string;
      updatedAt: string;
    }>;
    reportFeedback: Array<{
      id: string;
      accountId: string;
      clientId: string;
      auditId: string;
      rating: ReportFeedbackRating;
      notes: string;
      createdAt: string;
      updatedAt: string;
    }>;
    reportPeriods: ReportPeriodView[];
  }>;
  recentAudits: AuditRecord[];
}

type DashboardClient = DashboardData["clients"][number];
type DashboardIntegration = DashboardClient["integrations"][number];

interface ResourceOption {
  value: string;
  label: string;
}

interface AutoConfigurationPlan {
  attemptKey: string;
  patch: Record<string, unknown>;
  successMessage: string;
}

interface BannerMessage {
  tone: "success" | "error";
  text: string;
}

const ignoredMatchTokens = new Set([
  "com",
  "net",
  "org",
  "www",
  "http",
  "https",
  "google",
  "account",
  "property",
  "profile",
  "business",
  "analytics",
  "ads",
  "meta",
  "merchant",
]);

function getHostname(url: string | null | undefined) {
  if (!url) return null;

  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeMatchText(value: string | null | undefined) {
  return normalizeMatchText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !ignoredMatchTokens.has(token));
}

function getClientMatchTokens(client: DashboardClient) {
  const tokens = new Set<string>();
  const hostname = getHostname(client.primaryDomain);

  for (const token of tokenizeMatchText(client.name)) {
    tokens.add(token);
  }
  for (const token of tokenizeMatchText(client.industry)) {
    tokens.add(token);
  }
  if (hostname) {
    for (const token of tokenizeMatchText(hostname)) {
      tokens.add(token);
    }
  }

  return [...tokens];
}

function getSummarySearchText(summary: IntegrationPropertySummary) {
  return normalizeMatchText(
    [
      summary.displayName,
      summary.parentAccountName,
      summary.propertyId,
      summary.resourceName,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function scoreSummaryForClient(
  client: DashboardClient,
  summary: IntegrationPropertySummary,
) {
  const haystack = getSummarySearchText(summary);
  const hostname = getHostname(client.primaryDomain);
  let score = 0;

  if (hostname) {
    if (haystack.includes(hostname)) {
      score += 12;
    }
    for (const token of tokenizeMatchText(hostname)) {
      if (haystack.includes(token)) {
        score += token.length >= 6 ? 4 : 3;
      }
    }
  }

  for (const token of getClientMatchTokens(client)) {
    if (haystack.includes(token)) {
      score += token.length >= 6 ? 3 : 2;
    }
  }

  return score;
}

function pickRecommendedSummary(
  client: DashboardClient,
  summaries: IntegrationPropertySummary[] | undefined,
) {
  if (!summaries?.length) return null;
  if (summaries.length === 1) return summaries[0];

  const ranked = summaries
    .map((summary) => ({
      summary,
      score: scoreSummaryForClient(client, summary),
    }))
    .sort((left, right) => right.score - left.score);

  const [best, second] = ranked;
  if (!best || best.score <= 0) return null;
  if (second && best.score - second.score < 2) return null;
  return best.summary;
}

function getSummaryOptionLabel(summary: IntegrationPropertySummary) {
  const context = summary.parentAccountName?.trim();
  if (!context || context === summary.displayName) {
    return summary.displayName;
  }
  return `${summary.displayName} · ${context}`;
}

function toResourceOptions(summaries: IntegrationPropertySummary[] | undefined): ResourceOption[] {
  return (summaries ?? []).map((summary) => ({
    value: summary.propertyId,
    label: getSummaryOptionLabel(summary),
  }));
}

function resolveSuggestedValue(
  client: DashboardClient,
  currentValue: string | null | undefined,
  summaries: IntegrationPropertySummary[] | undefined,
) {
  if (currentValue) return currentValue;
  return pickRecommendedSummary(client, summaries)?.propertyId ?? "";
}

function getAutoConfigurationPlan(
  client: DashboardClient,
  integration: DashboardIntegration,
): AutoConfigurationPlan | null {
  if (!integration.connectionDetails.authenticated) {
    return null;
  }

  if (
    integration.platformKey === "google_search_console" &&
    !integration.settings.propertyId
  ) {
    const recommended = pickRecommendedSummary(
      client,
      integration.metadata?.propertySummaries,
    );
    if (!recommended) return null;
    return {
      attemptKey: `${integration.id}:propertyId:${recommended.propertyId}`,
      patch: {
        propertyId: recommended.propertyId,
        demoMode: false,
      },
      successMessage: `Search Console property auto-selected for ${client.name}.`,
    };
  }

  if (
    integration.platformKey === "google_business_profile" &&
    !integration.settings.businessAccountId
  ) {
    const recommended = pickRecommendedSummary(
      client,
      integration.metadata?.accountSummaries,
    );
    if (!recommended) return null;
    return {
      attemptKey: `${integration.id}:businessAccountId:${recommended.propertyId}`,
      patch: {
        businessAccountId: recommended.propertyId,
        demoMode: false,
      },
      successMessage: `Business Profile account auto-selected for ${client.name}.`,
    };
  }

  if (
    integration.platformKey === "google_business_profile" &&
    integration.settings.businessAccountId &&
    !integration.settings.businessProfileId &&
    integration.metadata?.locationSummaries?.length === 1
  ) {
    const [location] = integration.metadata.locationSummaries;
    if (!location) return null;
    return {
      attemptKey: `${integration.id}:businessProfileId:${location.propertyId}`,
      patch: {
        businessProfileId: location.propertyId,
        demoMode: false,
      },
      successMessage: `Business Profile location auto-selected for ${client.name}.`,
    };
  }

  if (
    integration.platformKey === "google_analytics" &&
    !integration.settings.ga4PropertyId
  ) {
    const recommended = pickRecommendedSummary(
      client,
      integration.metadata?.propertySummaries,
    );
    if (!recommended) return null;
    return {
      attemptKey: `${integration.id}:ga4PropertyId:${recommended.propertyId}`,
      patch: {
        ga4PropertyId: recommended.propertyId,
        demoMode: false,
      },
      successMessage: `GA4 property auto-selected for ${client.name}.`,
    };
  }

  if (
    integration.platformKey === "google_ads" &&
    !integration.settings.googleAdsCustomerId
  ) {
    const recommended = pickRecommendedSummary(
      client,
      integration.metadata?.propertySummaries,
    );
    if (!recommended) return null;
    return {
      attemptKey: `${integration.id}:googleAdsCustomerId:${recommended.propertyId}`,
      patch: {
        googleAdsCustomerId: recommended.propertyId,
        demoMode: false,
      },
      successMessage: `Google Ads customer auto-selected for ${client.name}.`,
    };
  }

  if (
    integration.platformKey === "meta_ads" &&
    !integration.settings.adAccountId
  ) {
    const recommended = pickRecommendedSummary(
      client,
      integration.metadata?.propertySummaries,
    );
    if (!recommended) return null;
    return {
      attemptKey: `${integration.id}:adAccountId:${recommended.propertyId}`,
      patch: {
        adAccountId: recommended.propertyId,
        demoMode: false,
      },
      successMessage: `Meta ad account auto-selected for ${client.name}.`,
    };
  }

  return null;
}

export function DashboardShell({
  initialData,
  viewer,
}: {
  initialData: DashboardData;
  viewer: AuthSession;
}) {
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<BannerMessage | null>(null);
  const [deleteIntentClientId, setDeleteIntentClientId] = useState<string | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [expandedClientIds, setExpandedClientIds] = useState<string[]>(() =>
    initialData.clients[0] ? [initialData.clients[0].id] : [],
  );
  const [expandedIntegrationIds, setExpandedIntegrationIds] = useState<Record<string, boolean>>({});
  const [isReportLibraryExpanded, setIsReportLibraryExpanded] = useState(false);
  const attemptedAutoConfigurations = useRef(new Set<string>());
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getJson<DashboardData>("/api/dashboard"),
    initialData,
  });

  const runTask = <T,>(
    task: () => Promise<T>,
    successMessage: string,
    onSuccess?: (result: T) => void,
  ) => {
    startTransition(async () => {
      try {
        setMessage(null);
        const result = await task();
        setMessage({ tone: "success", text: successMessage });
        onSuccess?.(result);
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    });
  };

  useEffect(() => {
    if (!message) {
      return;
    }
    const timeoutId = window.setTimeout(() => setMessage(null), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "audit-platform:oauth-complete") return;
      const payload = event.data.payload as { ok?: boolean; error?: string; status?: string };
      setMessage({
        tone: payload.ok ? "success" : "error",
        text: payload.ok
          ? payload.status === "connected"
            ? "OAuth connection completed."
            : "OAuth callback received."
          : payload.error ?? "OAuth callback failed.",
      });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [queryClient]);

  const toggleClientExpanded = (clientId: string) => {
    setExpandedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId],
    );
  };

  const toggleIntegrationExpanded = (integrationId: string, nextDefault: boolean) => {
    setExpandedIntegrationIds((current) => ({
      ...current,
      [integrationId]: !(current[integrationId] ?? nextDefault),
    }));
  };

  useEffect(() => {
    let cancelled = false;

    const autoConfigureIntegration = async () => {
      for (const client of data.clients) {
        for (const integration of client.integrations) {
          const plan = getAutoConfigurationPlan(client, integration);
          if (!plan) continue;
          if (attemptedAutoConfigurations.current.has(plan.attemptKey)) continue;

          attemptedAutoConfigurations.current.add(plan.attemptKey);

          try {
            await patchJson(`/api/clients/${client.id}/integrations/${integration.id}`, plan.patch);
            if (cancelled) return;
            setMessage({ tone: "success", text: plan.successMessage });
            await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          } catch (error) {
            if (cancelled) return;
            setMessage({
              tone: "error",
              text:
                error instanceof Error ? error.message : "Automatic configuration failed.",
            });
          }

          return;
        }
      }
    };

    void autoConfigureIntegration();

    return () => {
      cancelled = true;
    };
  }, [data.clients, queryClient]);

  const launchGoogleOAuth = (clientId: string, platformKey: string) => {
    runTask(async () => {
      const payload = await postJson<{ authUrl?: string }>(
        `/api/clients/${clientId}/integrations/google/oauth/start`,
        { platformKey },
      );
      if (payload.authUrl) {
        const desktopRuntime = (window as Window & {
          desktopRuntime?: { openExternal?: (url: string) => Promise<unknown> };
        }).desktopRuntime;
        if (desktopRuntime?.openExternal) {
          await desktopRuntime.openExternal(payload.authUrl);
          return;
        }

        const opened = window.open(payload.authUrl, "_blank", "width=920,height=780");
        if (opened) {
          return;
        }
        window.location.assign(payload.authUrl);
        return;
      }
      throw new Error("OAuth URL was not returned.");
    }, "OAuth window opened.");
  };

  const launchMicrosoftOAuth = (clientId: string, platformKey: string) => {
    runTask(async () => {
      const payload = await postJson<{ authUrl?: string }>(
        `/api/clients/${clientId}/integrations/microsoft/oauth/start`,
        { platformKey },
      );
      if (payload.authUrl) {
        const desktopRuntime = (window as Window & {
          desktopRuntime?: { openExternal?: (url: string) => Promise<unknown> };
        }).desktopRuntime;
        if (desktopRuntime?.openExternal) {
          await desktopRuntime.openExternal(payload.authUrl);
          return;
        }

        const opened = window.open(payload.authUrl, "_blank", "width=920,height=780");
        if (opened) {
          return;
        }
        window.location.assign(payload.authUrl);
        return;
      }
      throw new Error("OAuth URL was not returned.");
    }, "OAuth window opened.");
  };

  const resolveDemoMode = (platformKey: string, apiKey: string) => {
    const platform = data.platforms.find((item) => item.key === platformKey);
    if (!platform) return apiKey.length === 0;
    if (platformKey === "pagespeed_insights") return apiKey.length === 0;
    if (platform.authModes.includes("none")) return false;
    return apiKey.length === 0;
  };

  const totalLocations = data.clients.reduce((sum, client) => sum + client.locations.length, 0);
  const liveReadyIntegrations = data.clients.reduce(
    (sum, client) =>
      sum + client.integrations.filter((integration) => integration.connectionStatus === "ready").length,
    0,
  );
  const statusPills = [
    pending ? "Operation running" : "API online",
    `${liveReadyIntegrations} live integrations`,
    `${totalLocations} synced locations`,
    data.pdfRenderer.available ? "PDF export ready" : "PDF export pending",
  ];
  const isPlatformAdmin = viewer.role === "platform_admin";
  const canViewBilling = viewer.role === "platform_admin" || viewer.role === "account_admin";
  const accountOptions = isPlatformAdmin ? data.accounts : data.currentAccount ? [data.currentAccount] : [];
  const currentAccountId =
    data.currentAccount?.id ?? (viewer.role === "platform_admin" ? accountOptions[0]?.id ?? null : viewer.accountId);
  const scopedReportMemories = isPlatformAdmin
    ? data.reportMemories
    : currentAccountId
      ? data.reportMemories.filter((memory) => memory.accountId === currentAccountId)
      : data.reportMemories;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(243,193,91,0.12),transparent_24%),radial-gradient(circle_at_85%_12%,rgba(53,130,246,0.16),transparent_18%),linear-gradient(180deg,#091019_0%,#0b111a_48%,#0a0f16_100%)] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[284px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(20,28,41,0.96)_0%,rgba(16,23,35,0.96)_100%)] px-5 py-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-[linear-gradient(135deg,#f3c15b_0%,#d9a930_100%)] text-lg font-semibold tracking-[-0.04em] text-[#11161f] shadow-[0_20px_40px_rgba(243,193,91,0.24)]">
              OA
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-[-0.05em] text-white">
                Audit Studio
              </p>
              <p className="mt-1 text-sm text-slate-400">Client-ready growth operations</p>
            </div>
          </div>

          <nav className="mt-10 grid gap-3">
            <a
              href="#overview-title"
              className="flex items-center justify-between rounded-[1.25rem] border border-[#8f7a2f] bg-[#ffffff10] px-4 py-4 text-sm font-medium text-[#f4d98c] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <span>Overview</span>
              <span className="text-xs uppercase tracking-[0.24em] text-[#d8be6c]">Live</span>
            </a>
            <a
              href="#workspace-title"
              className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm font-medium text-slate-300 transition hover:border-white/16 hover:bg-white/[0.05]"
            >
              Workspace
            </a>
            <a
              href="#new-client-title"
              className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm font-medium text-slate-300 transition hover:border-white/16 hover:bg-white/[0.05]"
            >
              New client
            </a>
            <a
              href="#report-library"
              className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm font-medium text-slate-300 transition hover:border-white/16 hover:bg-white/[0.05]"
            >
              Report library
            </a>
          </nav>

          <div className="mt-10 rounded-[1.75rem] border border-white/10 bg-[#111925] p-5 shadow-[0_24px_55px_rgba(0,0,0,0.25)]">
            <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">
              Session active
            </p>
            <div className="mt-4 flex items-center gap-4">
              {viewer.picture ? (
                <div
                  aria-label={viewer.name}
                  className="h-12 w-12 rounded-full border border-white/10 bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url("${viewer.picture}")` }}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#1a2433] text-sm font-semibold text-white">
                  {viewer.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{viewer.name}</p>
                <p className="truncate text-sm text-slate-400">{viewer.email}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-emerald-200">
                Google session
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                {getRoleLabel(viewer.role)}
              </span>
              {data.currentAccount ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  {data.currentAccount.name}
                </span>
              ) : null}
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Bilingual access
              </span>
            </div>

            <form action="/api/auth/logout" method="post" className="mt-5">
              <button
                type="submit"
                className="w-full rounded-full border border-white/12 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-white/24 hover:bg-white/[0.08]"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-[#0f1723] p-5">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Run summary</p>
            <div className="mt-4 grid gap-4">
              <div>
                <p className="text-3xl font-semibold tracking-[-0.04em] text-white">
                  {data.recentAudits.length}
                </p>
                <p className="mt-1 text-sm text-slate-400">Recent audits</p>
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-[-0.04em] text-white">
                  {liveReadyIntegrations}
                </p>
                <p className="mt-1 text-sm text-slate-400">Integrations ready</p>
              </div>
            </div>
          </div>

          <section className="mt-6 rounded-[2rem] border border-white/10 bg-[#151d29] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Extension Kit</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Internal browser extension flow
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Use the extension to detect the current Google, website, or platform context and jump
              straight into the correct client audit. The dashboard remains the source of truth.
            </p>
            <a
              className="mt-4 inline-block text-sm text-[#f3c15b] underline"
              href="apps/extension/README.md"
            >
              Open extension scaffold
            </a>
          </section>

          <section
            id="platforms"
            className="mt-6 rounded-[2rem] border border-white/10 bg-[#151d29] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Platforms</p>
            <div className="mt-4 grid gap-3">
              {data.platforms.map((platform) => (
                <article
                  key={platform.key}
                  className="rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-white">{platform.name}</h3>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-slate-400">
                      {platform.launchStage}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {platform.description}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b111a]/90 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">
                    Prospecting-style dashboard
                  </p>
                  <h1
                    id="overview-title"
                    className="mt-2 scroll-mt-32 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl"
                  >
                    Guided client audit operations
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      runTask(
                        () => postJson("/api/reporting/monthly/run", {}),
                        "Monthly scheduler executed for the visible clients.",
                      )
                    }
                  >
                    Run monthly scheduler
                  </button>
                  {statusPills.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
              {message ? (
                <div
                  className={clsx(
                    "rounded-[1.25rem] px-4 py-3 text-sm",
                    message.tone === "success"
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                      : "border border-rose-500/20 bg-rose-500/10 text-rose-100",
                  )}
                >
                  {message.text}
                </div>
              ) : null}
              {!data.pdfRenderer.available ? (
                <div className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {data.pdfRenderer.message}
                </div>
              ) : null}
            </div>
          </header>

          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <section id="overview" className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
              <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,#182230_0%,#121a26_58%,#20251f_100%)] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
                <p className="text-xs uppercase tracking-[0.34em] text-[#f3c15b]">
                  Open API Audit Studio
                </p>
                <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Structure the workspace like an operator cockpit, not a generic admin page.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                  The dashboard now moves toward a guided layout: tighter navigation, stronger
                  hierarchy, and clearer staging between summary, setup, and report execution.
                </p>
                <div className="mt-7 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs uppercase tracking-[0.22em] text-slate-300">
                  Google login active and client workspace live
                </div>
                <div className="mt-8">
                  <FastNavigationCard clients={data.clients} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <StatCard label="Audits" value={String(data.recentAudits.length)} />
                  <StatCard label="Platforms" value={String(data.platforms.length)} />
                  <StatCard label="Rule Packs" value={String(data.rulePacks.length)} />
                </div>
              </div>

              <div
                id="new-client"
                className="rounded-[2rem] border border-white/10 bg-[#151d29] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      {isPlatformAdmin ? "New client" : "Account access"}
                    </p>
                    <h2
                      id="new-client-title"
                      className="mt-3 scroll-mt-32 text-2xl font-semibold tracking-[-0.04em] text-white"
                    >
                      {isPlatformAdmin ? "Start a new audit workspace" : "Use your shared customer workspace"}
                    </h2>
                  </div>
                  <span className="rounded-full border border-[#8f7a2f] bg-[#f3c15b14] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-[#f3d78f]">
                    {isPlatformAdmin ? "Setup" : "Live"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {isPlatformAdmin
                    ? "Create the client, choose the report lens, and attach it to the right customer account."
                    : "Connect your integrations, run audits manually, and review reports inside the account we provisioned for you."}
                </p>
                {isPlatformAdmin ? (
                  <form
                    className="mt-6 flex flex-col gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const requestBody = new FormData(event.currentTarget);
                      const name = String(formData.get("name") ?? "");
                      runTask(
                        () => postForm("/api/clients", requestBody),
                        `Client "${name}" created.`,
                      );
                      event.currentTarget.reset();
                    }}
                  >
                    <select
                      name="accountId"
                      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                      defaultValue={accountOptions[0]?.id ?? ""}
                      required
                    >
                      {accountOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                    <Input name="name" placeholder="Client name" required />
                    <Input name="industry" placeholder="Industry or vertical" required />
                    <Input
                      name="industryLabelPt"
                      placeholder="Portuguese report label (optional, used only for PT reports)"
                    />
                    <Input name="primaryDomain" placeholder="https://example.com" />
                    <select
                      name="reportLanguage"
                      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                      defaultValue="pt-BR"
                    >
                      <option value="pt-BR">Report in pt-BR</option>
                      <option value="pt-PT">Report in pt-PT</option>
                      <option value="en">Report in English</option>
                    </select>
                    <select
                      name="operatingModel"
                      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                      defaultValue="single_source"
                    >
                      <option value="single_source">Single source</option>
                      <option value="composed_source">Composed source</option>
                    </select>
                    <select
                      name="reportFocus"
                      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                      defaultValue="full_funnel"
                    >
                      <option value="full_funnel">Full funnel report</option>
                      <option value="lifecycle_marketing">Lifecycle / Email report</option>
                      <option value="seo_local">SEO / Local report</option>
                      <option value="paid_media">Paid media report</option>
                    </select>
                    <textarea
                      name="reportIntro"
                      placeholder="Internal client intro for AI: what the business does, main offer, priorities, conversion goal, and current focus."
                      className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <textarea
                      name="reportBenchmarks"
                      placeholder="Internal benchmarks: seasonality, expected CPL/ROAS, lead quality notes, sales cycle, service-level issues, or success thresholds."
                      className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <textarea
                      name="referenceReportNotes"
                      placeholder="Reference report notes: preferred narrative style, how the client likes insights framed, and what should always be emphasized or avoided."
                      className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <select
                      name="initialReportMemoryId"
                      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                      defaultValue=""
                    >
                      <option value="">No reference report selected</option>
                      {scopedReportMemories.map((memory) => (
                        <option key={memory.id} value={memory.id}>
                          {memory.title}
                          {memory.sourceClientName ? ` · ${memory.sourceClientName}` : ""}
                          {memory.periodLabel ? ` · ${memory.periodLabel}` : ""}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-[1.5rem] border border-dashed border-white/12 bg-[#0e1621] px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        Latest report PDF
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Upload the client&apos;s latest PDF report and the platform will extract the
                        text, save it to the reference library, and attach it to this new client
                        automatically.
                      </p>
                      <input
                        name="latestReferenceReportPdf"
                        type="file"
                        accept="application/pdf,.pdf"
                        className="mt-4 block w-full rounded-2xl border border-white/10 bg-[#111925] px-4 py-3 text-sm text-slate-100 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#101720]"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-full bg-[linear-gradient(135deg,#f3c15b_0%,#dba93a_100%)] px-5 py-3 text-sm font-semibold text-[#11161f] shadow-[0_18px_40px_rgba(243,193,91,0.25)] disabled:opacity-50"
                      disabled={pending}
                    >
                      {pending ? "Saving..." : "Create client"}
                    </button>
                  </form>
                ) : (
                  <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-[#0e1621] p-5">
                    <p className="text-sm text-slate-300">
                      Account: <span className="font-semibold text-white">{data.currentAccount?.name ?? "Assigned workspace"}</span>
                    </p>
                    {canViewBilling ? (
                      <p className="mt-2 text-sm text-slate-400">
                        Plan: {data.currentAccount?.serviceTier ?? "starter"} · Status: {data.currentAccount?.subscriptionStatus ?? "active"}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {canViewBilling
                        ? "Client creation stays with the platform admin. Your team can use the workspace below to connect APIs, manage operations, and generate reports."
                        : "Client creation and billing changes stay with the platform admin or your client admin. Your team can use the workspace below to connect APIs and generate reports."}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section
              id="report-library"
              className="mt-6 rounded-[2rem] border border-white/10 bg-[#121a26] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.24)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Report memory library
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                    Feed the assistant with strong legacy examples
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                    Paste old reports that represent the quality, tone, and framing you want.
                    They do not train the model globally. They work as account-scoped reference
                    material that can be attached to new clients when you create them.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    {scopedReportMemories.length} saved
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    {isReportLibraryExpanded ? "Open" : "Closed"}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                    onClick={() => setIsReportLibraryExpanded((current) => !current)}
                  >
                    {isReportLibraryExpanded ? "Collapse library" : "Open library"}
                  </button>
                </div>
              </div>

              {!isReportLibraryExpanded ? (
                <div className="mt-5 rounded-[1.5rem] border border-dashed border-white/12 bg-[#0f1723] px-5 py-4 text-sm text-slate-400">
                  Keep this closed until you need to upload or review legacy reference reports.
                </div>
              ) : (
                <div className="mt-6 grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                  <div>
                    <form
                      className="mt-5 grid gap-3"
                      onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const accountId = String(formData.get("accountId") ?? currentAccountId ?? "");
                      const title = String(formData.get("title") ?? "").trim();
                      const sourceClientName = String(formData.get("sourceClientName") ?? "").trim();
                      const periodLabel = String(formData.get("periodLabel") ?? "").trim();
                      const notes = String(formData.get("notes") ?? "").trim();
                      const content = String(formData.get("content") ?? "").trim();
                      runTask(
                        () =>
                          postJson("/api/report-memories", {
                            accountId,
                            title,
                            sourceClientName: sourceClientName || null,
                            periodLabel: periodLabel || null,
                            notes: notes || null,
                            content,
                          }),
                        `Reference report "${title}" saved to the library.`,
                      );
                      event.currentTarget.reset();
                    }}
                  >
                    {isPlatformAdmin ? (
                      <select
                        name="accountId"
                        className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                        defaultValue={currentAccountId ?? accountOptions[0]?.id ?? ""}
                      >
                        {accountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <Input name="title" placeholder="Reference title" required />
                    <div className="grid gap-3 lg:grid-cols-2">
                      <Input
                        name="sourceClientName"
                        placeholder="Source client name (optional)"
                      />
                      <Input name="periodLabel" placeholder="Period label (optional)" />
                    </div>
                    <textarea
                      name="notes"
                      placeholder="Why this example matters: tone, structure, business framing, or style cues."
                      className="min-h-20 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <textarea
                      name="content"
                      placeholder="Paste the old report text here."
                      className="min-h-40 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      required
                    />
                    <button
                      type="submit"
                      className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                      disabled={pending}
                    >
                      {pending ? "Saving..." : "Save to library"}
                    </button>
                  </form>
                  </div>

                  <div className="grid gap-3">
                    {scopedReportMemories.length === 0 ? (
                      <EmptyState
                        text="No reference reports saved yet. Paste one strong legacy report and it will become reusable context for future clients."
                        compact
                      />
                    ) : (
                      scopedReportMemories.map((memory) => (
                        <article
                          key={memory.id}
                          className="rounded-[1.5rem] border border-white/10 bg-[#182230] p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-white">
                                {memory.title}
                              </h3>
                              <p className="mt-1 text-sm text-slate-400">
                                {[memory.sourceClientName, memory.periodLabel]
                                  .filter(Boolean)
                                  .join(" · ") || "General reference"}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/15"
                              onClick={() => {
                                if (!window.confirm(`Remove reference "${memory.title}"?`)) {
                                  return;
                                }
                                runTask(
                                  () => deleteJson(`/api/report-memories/${memory.id}`),
                                  `Reference report "${memory.title}" removed.`,
                                );
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          {memory.notes ? (
                            <p className="mt-3 text-sm leading-6 text-slate-300">{memory.notes}</p>
                          ) : null}
                          <p className="mt-3 text-sm leading-6 text-slate-400">
                            {memory.content.length > 300
                              ? `${memory.content.slice(0, 300).trimEnd()}...`
                              : memory.content}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>

            <section id="workspace" className="mt-6">
              {isPlatformAdmin ? (
                <section className="mb-6 rounded-[2rem] border border-white/10 bg-[#121a26] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
                  <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                        Accounts
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
                        Provision customer access
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        Create the customer account, set subscription metadata, and invite the first workspace user before wiring clients and integrations.
                      </p>
                      <form
                        className="mt-5 grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const formData = new FormData(event.currentTarget);
                          const name = String(formData.get("name") ?? "");
                          const primaryUserEmail = String(formData.get("primaryUserEmail") ?? "");
                          const serviceTier = String(formData.get("serviceTier") ?? "starter");
                          const subscriptionStatus = String(formData.get("subscriptionStatus") ?? "trialing");
                          runTask(
                            () =>
                              postJson("/api/accounts", {
                                name,
                                primaryUserEmail: primaryUserEmail || null,
                                serviceTier,
                                subscriptionStatus,
                              }),
                            `Account "${name}" provisioned.`,
                          );
                          event.currentTarget.reset();
                        }}
                      >
                        <Input name="name" placeholder="Account name" required />
                        <Input name="primaryUserEmail" placeholder="First user email (optional)" />
                        <select
                          name="serviceTier"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue="starter"
                        >
                          <option value="starter">Starter</option>
                          <option value="growth">Growth</option>
                          <option value="agency">Agency</option>
                        </select>
                        <select
                          name="subscriptionStatus"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue="trialing"
                        >
                          <option value="trialing">Trialing</option>
                          <option value="active">Active</option>
                          <option value="past_due">Past due</option>
                          <option value="paused">Paused</option>
                          <option value="canceled">Canceled</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-full bg-[linear-gradient(135deg,#f3c15b_0%,#dba93a_100%)] px-5 py-3 text-sm font-semibold text-[#11161f] shadow-[0_18px_40px_rgba(243,193,91,0.25)] disabled:opacity-50"
                          disabled={pending}
                        >
                          {pending ? "Saving..." : "Create account"}
                        </button>
                      </form>
                    </div>

                    <div className="grid gap-4">
                      {data.accounts.map((account) => (
                        <article
                          key={account.id}
                          className="rounded-[1.5rem] border border-white/10 bg-[#182230] p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-white">{account.name}</h3>
                              <p className="mt-1 text-sm text-slate-400">
                                {account.serviceTier} · {account.subscriptionStatus} · {account.clientCount} clients
                              </p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                              {account.readyIntegrations} ready
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {account.members.length === 0 ? (
                              <EmptyPill text="No invited users yet" />
                            ) : (
                              account.members.map((member) => (
                                <span
                                  key={member.id}
                                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300"
                                >
                                  {member.invitedEmail} · {getRoleLabel(member.role)} · {member.status}
                                </span>
                              ))
                            )}
                          </div>
                          <form
                            className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const formData = new FormData(event.currentTarget);
                              const email = String(formData.get("email") ?? "");
                              const role = String(formData.get("role") ?? "account_operator");
                              runTask(
                                () =>
                                  postJson(`/api/accounts/${account.id}/members`, {
                                    email,
                                    role,
                                  }),
                                `Invite created for ${email}.`,
                              );
                              event.currentTarget.reset();
                            }}
                          >
                            <Input name="email" placeholder="Invite user by email" required />
                            <select
                              name="role"
                              className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                              defaultValue="account_operator"
                            >
                              <option value="account_operator">Client operator</option>
                              <option value="account_admin">Client admin</option>
                            </select>
                            <button
                              type="submit"
                              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                            >
                              Invite user
                            </button>
                          </form>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
              <div className="rounded-[2rem] border border-white/10 bg-[#121a26] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Client Workspace
                </p>
                <h2
                  id="workspace-title"
                  className="mt-2 scroll-mt-32 text-2xl font-semibold tracking-[-0.03em] text-white"
                >
                  Brand summary, integrations, locations, and report runs
                </h2>

                <div className="mt-6 grid gap-4">
            {data.clients.length === 0 ? (
              <EmptyState text="Create your first client to unlock integrations, locations, and reports." />
            ) : (
              data.clients.map((client) => {
                const connectedIntegrations = client.integrations.filter(
                  (integration) => integration.connectionStatus === "ready",
                );
                const isClientExpanded = expandedClientIds.includes(client.id);

                return (
                  <article
                    key={client.id}
                    className="rounded-[1.75rem] border border-white/10 bg-[#182230] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => toggleClientExpanded(client.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            id={`client-${client.id}`}
                            className="scroll-mt-32 text-xl font-semibold text-white"
                          >
                            {client.name}
                          </h3>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                            {isClientExpanded ? "Open" : "Closed"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-[#0f1723] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                            {client.integrations.length} connectors
                          </span>
                          <span className="rounded-full border border-white/10 bg-[#0f1723] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                            {client.reportPeriods.length} reports
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          {client.industry} {"\u00b7"} {client.operatingModel.replace("_", " ")}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {client.primaryDomain ?? "No primary domain"}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {connectedIntegrations.length} live-ready {"\u00b7"} Report language: {client.reportLanguage} {"\u00b7"} Focus: {getReportFocusLabel("en", client.reportFocus)}
                        </p>
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                          onClick={() => toggleClientExpanded(client.id)}
                        >
                          {isClientExpanded ? "Collapse client" : "Open client"}
                        </button>
                        {isPlatformAdmin ? (
                          <button
                            className="rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/15"
                            onClick={() => {
                              setDeleteIntentClientId(client.id);
                              setDeleteConfirmationText("");
                              setMessage(null);
                            }}
                            type="button"
                          >
                            Remove client
                          </button>
                        ) : null}
                        <button
                          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                          onClick={() =>
                            runTask(
                              () => postJson(`/api/clients/${client.id}/locations/sync`, {}),
                              `Locations synced for ${client.name}.`,
                            )
                          }
                        >
                          Sync locations
                        </button>
                        <button
                          className="rounded-full border border-[#8f7a2f] bg-[linear-gradient(135deg,#f3c15b_0%,#dba93a_100%)] px-4 py-2 text-sm font-medium text-[#11161f] transition hover:brightness-105 disabled:opacity-50"
                          disabled={pending || connectedIntegrations.length === 0}
                          onClick={() =>
                            runTask(
                              () => postJson(`/api/clients/${client.id}/audits`, {}),
                              `Audit requested for ${client.name}.`,
                            )
                          }
                        >
                          Run diagnostic audit
                        </button>
                      </div>
                    </div>

                    {isClientExpanded ? (
                      <p className="mt-3 text-xs leading-6 text-slate-500">
                        Diagnostic audit runs the live connector data right now. Monthly reports
                        below use report month, comparison month, business inputs, and optional
                        context.
                      </p>
                    ) : null}

                    {isClientExpanded && deleteIntentClientId === client.id ? (
                      <div className="mt-4 rounded-[1.25rem] border border-rose-500/20 bg-rose-500/10 p-4">
                        <p className="text-sm font-medium text-rose-100">
                          Confirm client removal
                        </p>
                        <p className="mt-2 text-sm leading-6 text-rose-200/90">
                          This removes the client, integrations, synced locations, and audit
                          history. Type <strong>{client.name}</strong> to confirm.
                        </p>
                        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                          <Input
                            value={deleteConfirmationText}
                            onChange={(event) => setDeleteConfirmationText(event.target.value)}
                            placeholder={`Type ${client.name}`}
                          />
                          <button
                            type="button"
                            className="rounded-full border border-rose-500/20 bg-white/5 px-4 py-3 text-sm text-rose-100"
                            onClick={() => {
                              setDeleteIntentClientId(null);
                              setDeleteConfirmationText("");
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-full bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={pending || deleteConfirmationText !== client.name}
                            onClick={() =>
                              runTask(async () => {
                                await deleteJson(`/api/clients/${client.id}`);
                                setDeleteIntentClientId(null);
                                setDeleteConfirmationText("");
                              }, `Client "${client.name}" removed.`)
                            }
                          >
                            Delete permanently
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {isClientExpanded ? (
                    <>
                    <form
                      className="mt-4 grid gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        runTask(
                          () =>
                            patchJson(`/api/clients/${client.id}`, {
                              reportLanguage: String(
                                formData.get("reportLanguage") ?? client.reportLanguage,
                              ),
                              reportFocus: String(formData.get("reportFocus") ?? client.reportFocus),
                              industryLabelPt: String(formData.get("industryLabelPt") ?? "") || null,
                              reportIntro: String(formData.get("reportIntro") ?? "").trim() || null,
                              reportBenchmarks:
                                String(formData.get("reportBenchmarks") ?? "").trim() || null,
                              referenceReportNotes:
                                String(formData.get("referenceReportNotes") ?? "").trim() || null,
                            }),
                          `Client preferences updated for ${client.name}.`,
                        );
                      }}
                    >
                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
                        <select
                          name="reportLanguage"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue={client.reportLanguage}
                        >
                          <option value="pt-BR">Report in pt-BR</option>
                          <option value="pt-PT">Report in pt-PT</option>
                          <option value="en">Report in English</option>
                        </select>
                        <select
                          name="reportFocus"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue={client.reportFocus}
                        >
                          <option value="full_funnel">Full funnel report</option>
                          <option value="lifecycle_marketing">Lifecycle / Email report</option>
                          <option value="seo_local">SEO / Local report</option>
                          <option value="paid_media">Paid media report</option>
                        </select>
                        <Input
                          name="industryLabelPt"
                          placeholder="Portuguese report label (used only for PT reports)"
                          defaultValue={client.industryLabelPt ?? ""}
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                        >
                          Save report settings
                        </button>
                      </div>
                      <textarea
                        name="reportIntro"
                        defaultValue={client.reportIntro ?? ""}
                        placeholder="Internal client intro for AI: business model, main offer, conversion target, priority channels, and strategic context."
                        className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <textarea
                        name="reportBenchmarks"
                        defaultValue={client.reportBenchmarks ?? ""}
                        placeholder="Internal benchmarks: seasonality, expected CPL/ROAS, quality thresholds, pipeline realities, and what 'good' looks like for this client."
                        className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <textarea
                        name="referenceReportNotes"
                        defaultValue={client.referenceReportNotes ?? ""}
                        placeholder="Reference report notes: preferred narrative tone, points that must always be emphasized, and framing from pre-platform reports."
                        className="min-h-24 rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                    </form>

                    <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-[#111925] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                            Reference reports
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            Attach legacy examples that should guide this client&apos;s report tone and
                            structure.
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                          {client.reportMemories.length} attached
                        </span>
                      </div>
                      <form
                        className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const formData = new FormData(event.currentTarget);
                          const reportMemoryId = String(formData.get("reportMemoryId") ?? "");
                          if (!reportMemoryId) {
                            setMessage({
                              tone: "error",
                              text: "Choose a reference report before attaching it to the client.",
                            });
                            return;
                          }
                          runTask(
                            () =>
                              postJson(`/api/clients/${client.id}/report-memories`, {
                                reportMemoryId,
                              }),
                            `Reference report attached to ${client.name}.`,
                          );
                          event.currentTarget.reset();
                        }}
                      >
                        <select
                          name="reportMemoryId"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue=""
                        >
                          <option value="">Choose a saved reference report</option>
                          {scopedReportMemories
                            .filter(
                              (memory) =>
                                memory.accountId === client.accountId &&
                                !client.reportMemories.some((attached) => attached.id === memory.id),
                            )
                            .map((memory) => (
                              <option key={memory.id} value={memory.id}>
                                {memory.title}
                                {memory.sourceClientName ? ` · ${memory.sourceClientName}` : ""}
                                {memory.periodLabel ? ` · ${memory.periodLabel}` : ""}
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                        >
                          Attach reference
                        </button>
                      </form>
                      <div className="mt-4 grid gap-3">
                        {client.reportMemories.length === 0 ? (
                          <EmptyState
                            text="No reference reports attached to this client yet."
                            compact
                          />
                        ) : (
                          client.reportMemories.map((memory) => (
                            <div
                              key={memory.id}
                              className="rounded-[1rem] border border-white/10 bg-[#182230] p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-white">
                                    {memory.title}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-400">
                                    {[memory.sourceClientName, memory.periodLabel]
                                      .filter(Boolean)
                                      .join(" · ") || "General reference"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/[0.08]"
                                  onClick={() =>
                                    runTask(
                                      () =>
                                        deleteJson(
                                          `/api/clients/${client.id}/report-memories/${memory.id}`,
                                        ),
                                      `Reference report detached from ${client.name}.`,
                                    )
                                  }
                                >
                                  Detach
                                </button>
                              </div>
                              {memory.notes ? (
                                <p className="mt-3 text-sm leading-6 text-slate-300">
                                  {memory.notes}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-[#111925] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        Monthly automation
                      </p>
                      <form
                        className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_0.8fr_0.9fr_auto]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const formData = new FormData(event.currentTarget);
                          const monthlyReportEnabled =
                            String(formData.get("monthlyReportEnabled") ?? "false") === "true";
                          const monthlyReportAutoGenerate =
                            String(formData.get("monthlyReportAutoGenerate") ?? "true") === "true";
                          const monthlyReportDayRaw = String(
                            formData.get("monthlyReportDay") ?? "",
                          ).trim();
                          runTask(
                            () =>
                              patchJson(`/api/clients/${client.id}`, {
                                monthlyReportEnabled,
                                monthlyReportDay: monthlyReportDayRaw
                                  ? Number(monthlyReportDayRaw)
                                  : null,
                                monthlyReportAutoGenerate,
                              }),
                            `Monthly automation updated for ${client.name}.`,
                          );
                        }}
                      >
                        <select
                          name="monthlyReportEnabled"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue={client.monthlyReportEnabled ? "true" : "false"}
                        >
                          <option value="false">Automation disabled</option>
                          <option value="true">Automation enabled</option>
                        </select>
                        <Input
                          name="monthlyReportDay"
                          type="number"
                          min={1}
                          max={31}
                          placeholder="Day of month"
                          defaultValue={client.monthlyReportDay ?? ""}
                        />
                        <select
                          name="monthlyReportAutoGenerate"
                          className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                          defaultValue={client.monthlyReportAutoGenerate ? "true" : "false"}
                        >
                          <option value="true">Auto-generate report</option>
                          <option value="false">Create draft only</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                        >
                          Save monthly automation
                        </button>
                      </form>
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                      <select
                        form={`integration-${client.id}`}
                        name="platformKey"
                        className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                        defaultValue="website_crawler"
                      >
                        {data.platforms.map((platform) => (
                          <option key={platform.key} value={platform.key}>
                            {platform.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        form={`integration-${client.id}`}
                        name="displayName"
                        placeholder="Integration label"
                        required
                      />
                      <Input
                        form={`integration-${client.id}`}
                        name="apiKey"
                        placeholder="API key / token (optional)"
                      />
                      <Input
                        form={`integration-${client.id}`}
                        name="targetUrl"
                        placeholder="Target URL / property hint"
                      />
                      <Input
                        form={`integration-${client.id}`}
                        name="adAccountId"
                        placeholder="Meta ad account ID"
                      />
                      <button
                        form={`integration-${client.id}`}
                        type="submit"
                        className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#101720]"
                      >
                        Add integration
                      </button>
                    </div>
                    <form
                      id={`integration-${client.id}`}
                      className="hidden"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        const platformKey = String(formData.get("platformKey") ?? "website_crawler");
                        const displayName = String(formData.get("displayName") ?? platformKey);
                        const apiKey = String(formData.get("apiKey") ?? "");
                        const targetUrl = String(formData.get("targetUrl") ?? "");
                        const adAccountId = String(formData.get("adAccountId") ?? "");
                        runTask(
                          () =>
                            postJson(`/api/clients/${client.id}/integrations`, {
                              platformKey,
                              displayName,
                              apiKey,
                              demoMode: resolveDemoMode(platformKey, apiKey),
                              authOrigin: apiKey.length === 0 ? "none" : "api_key",
                              targetUrl: targetUrl || client.primaryDomain || null,
                              adAccountId: adAccountId || null,
                            }),
                          `Integration added to ${client.name}.`,
                        );
                      }}
                    />

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
                        onClick={() => launchGoogleOAuth(client.id, "google_search_console")}
                      >
                        Connect Search Console
                      </button>
                      <button
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
                        onClick={() => launchGoogleOAuth(client.id, "google_business_profile")}
                      >
                        Connect Business Profile
                      </button>
                      <button
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
                        onClick={() => launchGoogleOAuth(client.id, "google_analytics")}
                      >
                        Connect GA4
                      </button>
                      <button
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
                        onClick={() => launchGoogleOAuth(client.id, "google_ads")}
                      >
                        Connect Google Ads
                      </button>
                      <button
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
                        onClick={() => launchMicrosoftOAuth(client.id, "microsoft_ads")}
                      >
                        Connect Microsoft Ads
                      </button>
                      <button
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200"
                        onClick={() => launchMicrosoftOAuth(client.id, "microsoft_merchant_center")}
                      >
                        Connect Merchant Center
                      </button>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {client.integrations.length === 0 ? (
                        <EmptyPill text="No integrations yet" />
                      ) : (
                        client.integrations.map((integration) => {
                          const propertyOptions = toResourceOptions(
                            integration.metadata?.propertySummaries,
                          );
                          const accountOptions = toResourceOptions(
                            integration.metadata?.accountSummaries,
                          );
                          const locationOptions = toResourceOptions(
                            integration.metadata?.locationSummaries,
                          );
                          const recommendedProperty = pickRecommendedSummary(
                            client,
                            integration.metadata?.propertySummaries,
                          );
                          const recommendedAccount = pickRecommendedSummary(
                            client,
                            integration.metadata?.accountSummaries,
                          );
                          const searchConsoleValue = resolveSuggestedValue(
                            client,
                            integration.settings.propertyId ?? null,
                            integration.metadata?.propertySummaries,
                          );
                          const ga4Value = resolveSuggestedValue(
                            client,
                            integration.settings.ga4PropertyId ?? null,
                            integration.metadata?.propertySummaries,
                          );
                          const googleAdsValue = resolveSuggestedValue(
                            client,
                            integration.settings.googleAdsCustomerId ?? null,
                            integration.metadata?.propertySummaries,
                          );
                          const metaAdsValue = resolveSuggestedValue(
                            client,
                            integration.settings.adAccountId ?? null,
                            integration.metadata?.propertySummaries,
                          );
                          const businessAccountValue = resolveSuggestedValue(
                            client,
                            integration.settings.businessAccountId ?? null,
                            integration.metadata?.accountSummaries,
                          );
                          const showRecommendedPropertyHint =
                            !integration.connectionDetails.resourceSelected &&
                            Boolean(recommendedProperty) &&
                            (integration.metadata?.propertySummaries?.length ?? 0) > 1;
                          const showRecommendedAccountHint =
                            !integration.settings.businessAccountId &&
                            Boolean(recommendedAccount) &&
                            (integration.metadata?.accountSummaries?.length ?? 0) > 1;
                          const defaultExpanded = !integration.connectionDetails.liveReady;
                          const isIntegrationExpanded =
                            expandedIntegrationIds[integration.id] ?? defaultExpanded;

                          return (
                            <article
                              key={integration.id}
                              className="rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4"
                            >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() =>
                                  toggleIntegrationExpanded(integration.id, defaultExpanded)
                                }
                              >
                                <p className="font-medium text-white">
                                  {integration.displayName}
                                </p>
                                <p className="mt-1 text-sm text-slate-400">
                                  {integration.platformKey}
                                  {integration.credentials.authOrigin
                                    ? ` \u00b7 ${integration.credentials.authOrigin}`
                                    : ""}
                                </p>
                              </button>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/[0.08]"
                                  onClick={() =>
                                    toggleIntegrationExpanded(integration.id, defaultExpanded)
                                  }
                                >
                                  {isIntegrationExpanded ? "Collapse" : "Open"}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/15"
                                  onClick={() => {
                                    if (
                                      !window.confirm(
                                        `Remove connector "${integration.displayName}" from ${client.name}?`,
                                      )
                                    ) {
                                      return;
                                    }
                                    runTask(
                                      () =>
                                        deleteJson(
                                          `/api/clients/${client.id}/integrations/${integration.id}`,
                                        ),
                                      `Connector removed from ${client.name}.`,
                                    );
                                  }}
                                >
                                  Remove connector
                                </button>
                                <StatusBadge status={integration.connectionStatus} />
                              </div>
                            </div>

                            {!isIntegrationExpanded ? null : (
                            <>
                            <p className="mt-3 text-sm leading-6 text-slate-400">
                              {integration.validationMessage}
                            </p>

                            {(integration.platformKey === "google_search_console" ||
                              integration.platformKey === "google_business_profile" ||
                              integration.platformKey === "google_analytics" ||
                              integration.platformKey === "google_ads") &&
                            !integration.connectionDetails.authenticated ? (
                              <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                                <p>
                                  OAuth is not connected yet. Saving IDs below does not register the
                                  Google account by itself.
                                </p>
                                <div className="mt-3">
                                  <button
                                    className="rounded-full border border-amber-300/30 bg-amber-200/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-50"
                                    onClick={() => {
                                      if (integration.platformKey === "google_search_console") {
                                        launchGoogleOAuth(client.id, "google_search_console");
                                        return;
                                      }
                                      if (integration.platformKey === "google_business_profile") {
                                        launchGoogleOAuth(client.id, "google_business_profile");
                                        return;
                                      }
                                      if (integration.platformKey === "google_analytics") {
                                        launchGoogleOAuth(client.id, "google_analytics");
                                        return;
                                      }
                                      launchGoogleOAuth(client.id, "google_ads");
                                    }}
                                  >
                                    {integration.platformKey === "google_analytics"
                                      ? "Connect GA4 first"
                                      : integration.platformKey === "google_ads"
                                        ? "Connect Google Ads first"
                                        : integration.platformKey === "google_business_profile"
                                          ? "Connect Business Profile first"
                                          : "Connect Search Console first"}
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <StatusChip
                                label="Env"
                                ready={integration.connectionDetails.environmentConfigured}
                              />
                              <StatusChip
                                label="OAuth"
                                ready={integration.connectionDetails.authenticated}
                              />
                              <StatusChip
                                label="Resource"
                                ready={integration.connectionDetails.resourceSelected}
                              />
                              <StatusChip
                                label="Live"
                                ready={integration.connectionDetails.liveReady}
                              />
                              <StatusChip
                                label="Health"
                                ready={integration.healthCheck?.ok ?? integration.connectionStatus === "ready"}
                              />
                            </div>

                            {integration.platformKey === "google_search_console" ? (
                              <div className="mt-4 grid gap-4">
                                {propertyOptions.length > 0 ? (
                                  <>
                                    <div className="grid gap-2">
                                      <ResourceSelectField
                                        label="Property"
                                        helpTitle="Which Search Console property should we use?"
                                        helpBody={
                                          <>
                                            <p>
                                              Pick the Search Console property that matches this
                                              client. The system will save it immediately.
                                            </p>
                                            <p>
                                              When the domain match is clear, the dashboard now
                                              preselects it for you.
                                            </p>
                                          </>
                                        }
                                        value={searchConsoleValue}
                                        placeholder="Select an accessible Search Console property"
                                        options={propertyOptions}
                                        onChange={(value) =>
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  propertyId: value || null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `Search Console property updated for ${client.name}.`,
                                          )
                                        }
                                      />
                                      {showRecommendedPropertyHint && recommendedProperty ? (
                                        <p className="text-xs text-slate-500">
                                          Recommended: {getSummaryOptionLabel(recommendedProperty)}
                                        </p>
                                      ) : null}
                                    </div>

                                    <details className="rounded-[1rem] border border-white/10 bg-[#111925] p-4">
                                      <summary className="cursor-pointer text-sm font-medium text-slate-200">
                                        Open manual property entry
                                      </summary>
                                      <form
                                        className="mt-4 grid gap-4"
                                        onSubmit={(event) => {
                                          event.preventDefault();
                                          const formData = new FormData(event.currentTarget);
                                          const propertyId = String(formData.get("propertyId") ?? "").trim();
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  propertyId: propertyId || null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `Search Console property updated for ${client.name}.`,
                                          );
                                        }}
                                      >
                                        <Input
                                          name="propertyId"
                                          placeholder="sc-domain:example.com or https://example.com/"
                                          defaultValue={integration.settings.propertyId ?? ""}
                                        />
                                        <button
                                          type="submit"
                                          className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                        >
                                          Save manual property
                                        </button>
                                      </form>
                                    </details>
                                  </>
                                ) : (
                                  <form
                                    className="grid gap-4"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const formData = new FormData(event.currentTarget);
                                      const propertyId = String(formData.get("propertyId") ?? "").trim();
                                      runTask(
                                        () =>
                                          patchJson(
                                            `/api/clients/${client.id}/integrations/${integration.id}`,
                                            {
                                              propertyId: propertyId || null,
                                              demoMode: false,
                                            },
                                          ),
                                        `Search Console property updated for ${client.name}.`,
                                      );
                                    }}
                                  >
                                    <FieldWithHelp
                                      label="Property"
                                      helpTitle="Which Search Console property goes here?"
                                      helpBody={
                                        <>
                                          <p>
                                            Paste the exact Search Console property, such as <code>sc-domain:example.com</code> or <code>https://example.com/</code>.
                                          </p>
                                          <p>
                                            This manual field stays available as a fallback when the accessible property list has not loaded yet.
                                          </p>
                                        </>
                                      }
                                    >
                                      <Input
                                        name="propertyId"
                                        placeholder="sc-domain:example.com or https://example.com/"
                                        defaultValue={integration.settings.propertyId ?? ""}
                                      />
                                    </FieldWithHelp>
                                    <button
                                      type="submit"
                                      className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                    >
                                      Save Search Console property
                                    </button>
                                  </form>
                                )}
                              </div>
                            ) : null}

                            {integration.platformKey === "google_business_profile" ? (
                              <div className="mt-4 grid gap-4">
                                <div className="grid gap-3 lg:grid-cols-2">
                                  {accountOptions.length > 0 ? (
                                    <div className="grid gap-2">
                                      <ResourceSelectField
                                        label="Business account"
                                        helpTitle="Which Business Profile account should we use?"
                                        helpBody={
                                          <>
                                            <p>
                                              Pick the accessible account that matches this client.
                                              The dashboard saves it immediately.
                                            </p>
                                            <p>
                                              If only one account is available, it is auto-selected
                                              for you.
                                            </p>
                                          </>
                                        }
                                        value={businessAccountValue}
                                        placeholder="Select an accessible Business Profile account"
                                        options={accountOptions}
                                        onChange={(value) =>
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  businessAccountId: value || null,
                                                  businessProfileId: null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `Business Profile account updated for ${client.name}.`,
                                          )
                                        }
                                      />
                                      {showRecommendedAccountHint && recommendedAccount ? (
                                        <p className="text-xs text-slate-500">
                                          Recommended: {getSummaryOptionLabel(recommendedAccount)}
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <FieldWithHelp
                                      label="Business account ID"
                                      helpTitle="Which Business Profile account ID goes here?"
                                      helpBody={
                                        <>
                                          <p>
                                            Use the account resource, such as <code>accounts/123456789</code>.
                                          </p>
                                          <p>
                                            This manual field stays available when the account list
                                            cannot be discovered yet.
                                          </p>
                                        </>
                                      }
                                    >
                                      <Input
                                        name="businessAccountId"
                                        form={`business-profile-manual-${integration.id}`}
                                        placeholder="accounts/123456789"
                                        defaultValue={integration.settings.businessAccountId ?? ""}
                                      />
                                    </FieldWithHelp>
                                  )}

                                  {locationOptions.length > 0 ? (
                                    <ResourceSelectField
                                      label="Primary location"
                                      helpTitle="When should I choose a location?"
                                      helpBody={
                                        <>
                                          <p>
                                            Leave the selection on <strong>All accessible locations</strong> to aggregate the entire account.
                                          </p>
                                          <p>
                                            Choose a specific unit only when this client report
                                            should focus on one location.
                                          </p>
                                        </>
                                      }
                                      value={integration.settings.businessProfileId ?? ""}
                                      placeholder="All accessible locations"
                                      options={locationOptions}
                                      onChange={(value) =>
                                        runTask(
                                          () =>
                                            patchJson(
                                              `/api/clients/${client.id}/integrations/${integration.id}`,
                                              {
                                                businessProfileId: value || null,
                                                demoMode: false,
                                              },
                                            ),
                                          `Business Profile location updated for ${client.name}.`,
                                        )
                                      }
                                    />
                                  ) : accountOptions.length > 0 ||
                                    Boolean(integration.settings.businessAccountId) ? (
                                    <div className="rounded-[1rem] border border-white/10 bg-[#111925] p-4 text-sm leading-6 text-slate-400">
                                      <p className="font-medium text-slate-200">Primary location</p>
                                      <p className="mt-2">
                                        All accessible locations stay included by default. Once this
                                        account finishes loading locations, you can optionally narrow
                                        the report to a single unit.
                                      </p>
                                    </div>
                                  ) : (
                                    <FieldWithHelp
                                      label="Primary location ID"
                                      helpTitle="When should I fill the location ID?"
                                      helpBody={
                                        <>
                                          <p>
                                            Leave this blank to aggregate all accessible locations under the account.
                                          </p>
                                          <p>
                                            Fill it with a specific resource like <code>locations/987654321</code> when the report should focus on one unit only.
                                          </p>
                                        </>
                                      }
                                    >
                                      <Input
                                        name="businessProfileId"
                                        form={`business-profile-manual-${integration.id}`}
                                        placeholder="locations/987654321 (optional)"
                                        defaultValue={integration.settings.businessProfileId ?? ""}
                                      />
                                    </FieldWithHelp>
                                  )}
                                </div>

                                <form
                                  id={`business-profile-manual-${integration.id}`}
                                  className={clsx(
                                    "grid gap-4",
                                    accountOptions.length > 0 || locationOptions.length > 0
                                      ? "hidden"
                                      : "",
                                  )}
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const formData = new FormData(event.currentTarget);
                                    const businessAccountId = String(
                                      formData.get("businessAccountId") ?? "",
                                    ).trim();
                                    const businessProfileId = String(
                                      formData.get("businessProfileId") ?? "",
                                    ).trim();
                                    runTask(
                                      () =>
                                        patchJson(
                                          `/api/clients/${client.id}/integrations/${integration.id}`,
                                          {
                                            businessAccountId: businessAccountId || null,
                                            businessProfileId: businessProfileId || null,
                                            demoMode: false,
                                          },
                                        ),
                                      `Business Profile IDs updated for ${client.name}.`,
                                    );
                                  }}
                                >
                                  <button
                                    type="submit"
                                    className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                  >
                                    Save Business Profile IDs
                                  </button>
                                </form>

                                {accountOptions.length > 0 || locationOptions.length > 0 ? (
                                  <details className="rounded-[1rem] border border-white/10 bg-[#111925] p-4">
                                    <summary className="cursor-pointer text-sm font-medium text-slate-200">
                                      Open manual fallback fields
                                    </summary>
                                    <form
                                      className="mt-4 grid gap-4"
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        const formData = new FormData(event.currentTarget);
                                        const businessAccountId = String(
                                          formData.get("businessAccountId") ?? "",
                                        ).trim();
                                        const businessProfileId = String(
                                          formData.get("businessProfileId") ?? "",
                                        ).trim();
                                        runTask(
                                          () =>
                                            patchJson(
                                              `/api/clients/${client.id}/integrations/${integration.id}`,
                                              {
                                                businessAccountId: businessAccountId || null,
                                                businessProfileId: businessProfileId || null,
                                                demoMode: false,
                                              },
                                            ),
                                          `Business Profile IDs updated for ${client.name}.`,
                                        );
                                      }}
                                    >
                                      <div className="grid gap-3 lg:grid-cols-2">
                                        <Input
                                          name="businessAccountId"
                                          placeholder="accounts/123456789"
                                          defaultValue={integration.settings.businessAccountId ?? ""}
                                        />
                                        <Input
                                          name="businessProfileId"
                                          placeholder="locations/987654321 (optional)"
                                          defaultValue={integration.settings.businessProfileId ?? ""}
                                        />
                                      </div>
                                      <button
                                        type="submit"
                                        className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                      >
                                        Save manual IDs
                                      </button>
                                    </form>
                                  </details>
                                ) : null}
                              </div>
                            ) : null}

                            {integration.platformKey === "google_analytics" ? (
                              <div className="mt-4 grid gap-4">
                                {propertyOptions.length > 0 ? (
                                  <>
                                    <div className="grid gap-2">
                                      <ResourceSelectField
                                        label="GA4 property"
                                        helpTitle="Which GA4 property should we use?"
                                        helpBody={
                                          <>
                                            <p>
                                              Choose the GA4 property that matches this client. The
                                              dashboard saves the selection immediately.
                                            </p>
                                            <p>
                                              We now recommend or auto-select the best match whenever
                                              the property list is clear enough.
                                            </p>
                                          </>
                                        }
                                        value={ga4Value}
                                        placeholder="Select an accessible GA4 property"
                                        options={propertyOptions}
                                        onChange={(value) =>
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  ga4PropertyId: value || null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `GA4 property updated for ${client.name}.`,
                                          )
                                        }
                                      />
                                      {showRecommendedPropertyHint && recommendedProperty ? (
                                        <p className="text-xs text-slate-500">
                                          Recommended: {getSummaryOptionLabel(recommendedProperty)}
                                        </p>
                                      ) : null}
                                    </div>

                                    <details className="rounded-[1rem] border border-white/10 bg-[#111925] p-4">
                                      <summary className="cursor-pointer text-sm font-medium text-slate-200">
                                        Open manual property entry
                                      </summary>
                                      <form
                                        className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
                                        onSubmit={(event) => {
                                          event.preventDefault();
                                          const formData = new FormData(event.currentTarget);
                                          const ga4PropertyId = String(formData.get("ga4PropertyId") ?? "").trim();
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  ga4PropertyId: ga4PropertyId || null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `GA4 property updated for ${client.name}.`,
                                          );
                                        }}
                                      >
                                        <Input
                                          name="ga4PropertyId"
                                          placeholder="GA4 property ID (123456789 or properties/123456789)"
                                          defaultValue={integration.settings.ga4PropertyId ?? ""}
                                        />
                                        <button
                                          type="submit"
                                          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200"
                                        >
                                          Save manual property
                                        </button>
                                      </form>
                                    </details>
                                  </>
                                ) : (
                                  <form
                                    className="grid gap-3 lg:grid-cols-[1fr_auto]"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const formData = new FormData(event.currentTarget);
                                      const ga4PropertyId = String(formData.get("ga4PropertyId") ?? "").trim();
                                      runTask(
                                        () =>
                                          patchJson(
                                            `/api/clients/${client.id}/integrations/${integration.id}`,
                                            {
                                              ga4PropertyId: ga4PropertyId || null,
                                              demoMode: false,
                                            },
                                          ),
                                        `GA4 property updated for ${client.name}.`,
                                      );
                                    }}
                                  >
                                    <Input
                                      name="ga4PropertyId"
                                      placeholder="GA4 property ID (123456789 or properties/123456789)"
                                      defaultValue={integration.settings.ga4PropertyId ?? ""}
                                    />
                                    <button
                                      type="submit"
                                      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200"
                                    >
                                      Save GA4 property
                                    </button>
                                  </form>
                                )}
                              </div>
                            ) : null}

                            {integration.platformKey === "google_ads" ? (
                              <div className="mt-4 grid gap-4">
                                {propertyOptions.length > 0 ? (
                                  <>
                                    <div className="grid gap-2">
                                      <ResourceSelectField
                                        label="Customer"
                                        helpTitle="Which Google Ads customer should we use?"
                                        helpBody={
                                          <>
                                            <p>
                                              Choose the advertiser account you want to report on. The
                                              selection is saved immediately.
                                            </p>
                                            <p>
                                              The manager account ID is now treated as an advanced
                                              option instead of the main setup step.
                                            </p>
                                          </>
                                        }
                                        value={googleAdsValue}
                                        placeholder="Select an accessible Google Ads customer"
                                        options={propertyOptions}
                                        onChange={(value) =>
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  googleAdsCustomerId: value || null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `Google Ads account updated for ${client.name}.`,
                                          )
                                        }
                                      />
                                      {showRecommendedPropertyHint && recommendedProperty ? (
                                        <p className="text-xs text-slate-500">
                                          Recommended: {getSummaryOptionLabel(recommendedProperty)}
                                        </p>
                                      ) : null}
                                    </div>

                                    <details className="rounded-[1rem] border border-white/10 bg-[#111925] p-4">
                                      <summary className="cursor-pointer text-sm font-medium text-slate-200">
                                        Open advanced Google Ads IDs
                                      </summary>
                                      <form
                                        className="mt-4 grid gap-4"
                                        onSubmit={(event) => {
                                          event.preventDefault();
                                          const formData = new FormData(event.currentTarget);
                                          const googleAdsCustomerId = String(
                                            formData.get("googleAdsCustomerId") ?? "",
                                          ).trim();
                                          const googleAdsLoginCustomerId = String(
                                            formData.get("googleAdsLoginCustomerId") ?? "",
                                          ).trim();
                                          runTask(
                                            () =>
                                              patchJson(
                                                `/api/clients/${client.id}/integrations/${integration.id}`,
                                                {
                                                  googleAdsCustomerId: googleAdsCustomerId || null,
                                                  googleAdsLoginCustomerId: googleAdsLoginCustomerId || null,
                                                  demoMode: false,
                                                },
                                              ),
                                            `Google Ads account updated for ${client.name}.`,
                                          );
                                        }}
                                      >
                                        <Input
                                          name="googleAdsCustomerId"
                                          placeholder="Google Ads customer ID"
                                          defaultValue={integration.settings.googleAdsCustomerId ?? ""}
                                        />
                                        <FieldWithHelp
                                          label="Login Customer ID"
                                          helpTitle="When is login customer ID needed?"
                                          helpBody={
                                            <>
                                              <p>
                                                Fill this only when the connected Google user accesses the
                                                advertiser through a <strong>manager account (MCC)</strong>.
                                              </p>
                                              <p>
                                                Use the manager account customer ID, also with or without
                                                hyphens.
                                              </p>
                                            </>
                                          }
                                        >
                                          <Input
                                            name="googleAdsLoginCustomerId"
                                            placeholder="Manager account ID (optional)"
                                            defaultValue={integration.settings.googleAdsLoginCustomerId ?? ""}
                                          />
                                        </FieldWithHelp>
                                        <button
                                          type="submit"
                                          className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                        >
                                          Save advanced IDs
                                        </button>
                                      </form>
                                    </details>
                                  </>
                                ) : (
                                  <form
                                    className="grid gap-4"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const formData = new FormData(event.currentTarget);
                                      const googleAdsCustomerId = String(
                                        formData.get("googleAdsCustomerId") ?? "",
                                      ).trim();
                                      const googleAdsLoginCustomerId = String(
                                        formData.get("googleAdsLoginCustomerId") ?? "",
                                      ).trim();
                                      runTask(
                                        () =>
                                          patchJson(
                                            `/api/clients/${client.id}/integrations/${integration.id}`,
                                            {
                                              googleAdsCustomerId: googleAdsCustomerId || null,
                                              googleAdsLoginCustomerId: googleAdsLoginCustomerId || null,
                                              demoMode: false,
                                            },
                                          ),
                                          `Google Ads account updated for ${client.name}.`,
                                        );
                                    }}
                                  >
                                    <div className="grid gap-3 lg:grid-cols-2">
                                      <FieldWithHelp
                                        label="Customer ID"
                                        helpTitle="Which Google Ads ID goes here?"
                                        helpBody={
                                          <>
                                            <p>
                                              Use the advertiser <strong>Customer ID</strong> you want
                                              to report on.
                                            </p>
                                            <p>
                                              Google Ads usually shows it as <code>123-456-7890</code>.
                                              You can paste it with or without hyphens.
                                            </p>
                                          </>
                                        }
                                      >
                                        <Input
                                          name="googleAdsCustomerId"
                                          placeholder="Google Ads customer ID"
                                          defaultValue={integration.settings.googleAdsCustomerId ?? ""}
                                        />
                                      </FieldWithHelp>
                                      <FieldWithHelp
                                        label="Login Customer ID"
                                        helpTitle="When is login customer ID needed?"
                                        helpBody={
                                          <>
                                            <p>
                                              Fill this only when the connected Google user accesses the
                                              advertiser through a <strong>manager account (MCC)</strong>.
                                            </p>
                                            <p>
                                              Use the manager account customer ID, also with or without
                                              hyphens.
                                            </p>
                                          </>
                                        }
                                      >
                                        <Input
                                          name="googleAdsLoginCustomerId"
                                          placeholder="Manager account ID (optional)"
                                          defaultValue={integration.settings.googleAdsLoginCustomerId ?? ""}
                                        />
                                      </FieldWithHelp>
                                    </div>
                                    <button
                                      type="submit"
                                      className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                    >
                                      Save Google Ads IDs
                                    </button>
                                  </form>
                                )}
                              </div>
                            ) : null}

                            {integration.platformKey === "meta_ads" ? (
                              <div className="mt-4 grid gap-4">
                                {propertyOptions.length > 0 ? (
                                  <div className="grid gap-2">
                                    <ResourceSelectField
                                      label="Ad account"
                                      helpTitle="Which Meta ad account should we use?"
                                      helpBody={
                                        <>
                                          <p>
                                            Choose the discovered Meta ad account that belongs to this client.
                                          </p>
                                          <p>
                                            The dashboard saves it immediately and keeps the token
                                            entry as an advanced step only.
                                          </p>
                                        </>
                                      }
                                      value={metaAdsValue}
                                      placeholder="Select an accessible Meta ad account"
                                      options={propertyOptions}
                                      onChange={(value) =>
                                        runTask(
                                          () =>
                                            patchJson(
                                              `/api/clients/${client.id}/integrations/${integration.id}`,
                                              {
                                                adAccountId: value || null,
                                                demoMode: false,
                                              },
                                            ),
                                          `Meta ad account updated for ${client.name}.`,
                                        )
                                      }
                                    />
                                    {showRecommendedPropertyHint && recommendedProperty ? (
                                      <p className="text-xs text-slate-500">
                                        Recommended: {getSummaryOptionLabel(recommendedProperty)}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}

                                <details className="rounded-[1rem] border border-white/10 bg-[#111925] p-4">
                                  <summary className="cursor-pointer text-sm font-medium text-slate-200">
                                    {propertyOptions.length > 0
                                      ? "Open manual Meta token and ID fields"
                                      : "Configure Meta token and account"}
                                  </summary>
                                  <form
                                    className="mt-4 grid gap-4"
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const formData = new FormData(event.currentTarget);
                                      const apiKey = String(formData.get("apiKey") ?? "").trim();
                                      const adAccountId = String(formData.get("adAccountId") ?? "").trim();
                                      runTask(
                                        () =>
                                          patchJson(
                                            `/api/clients/${client.id}/integrations/${integration.id}`,
                                            {
                                              ...(apiKey
                                                ? {
                                                    apiKey,
                                                    authOrigin: "api_key",
                                                  }
                                                : {}),
                                              adAccountId: adAccountId || null,
                                              demoMode: false,
                                            },
                                          ),
                                        `Meta ad account updated for ${client.name}.`,
                                      );
                                    }}
                                  >
                                    <div className="grid gap-3 lg:grid-cols-2">
                                      <FieldWithHelp
                                        label="Access token"
                                        helpTitle="Which Meta credential goes here?"
                                        helpBody={
                                          <>
                                            <p>
                                              Paste the <strong>Meta Ads access token</strong> used by
                                              your reporting connection.
                                            </p>
                                            <p>
                                              Leave this field blank when you only want to keep the
                                              current token and update the account ID.
                                            </p>
                                          </>
                                        }
                                      >
                                        <Input
                                          name="apiKey"
                                          type="password"
                                          placeholder="Meta access token"
                                        />
                                      </FieldWithHelp>
                                      <FieldWithHelp
                                        label="Ad account ID"
                                        helpTitle="Which Meta ID should I paste?"
                                        helpBody={
                                          <>
                                            <p>
                                              Use the numeric <strong>Ad Account ID</strong> shown in
                                              Meta, such as <code>61589750244560</code>.
                                            </p>
                                            <p>
                                              You can also paste it as <code>act_61589750244560</code>.
                                              The connector accepts both formats.
                                            </p>
                                          </>
                                        }
                                      >
                                        <Input
                                          name="adAccountId"
                                          placeholder="Meta ad account ID"
                                          defaultValue={integration.settings.adAccountId ?? ""}
                                        />
                                      </FieldWithHelp>
                                    </div>
                                    <button
                                      type="submit"
                                      className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                    >
                                      Save Meta connection
                                    </button>
                                  </form>
                                </details>
                              </div>
                            ) : null}

                            {integration.platformKey === "microsoft_ads" ? (
                              <form
                                className="mt-4 grid gap-4"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const formData = new FormData(event.currentTarget);
                                  const microsoftCustomerId = String(formData.get("microsoftCustomerId") ?? "").trim();
                                  const microsoftAccountId = String(formData.get("microsoftAccountId") ?? "").trim();
                                  runTask(
                                    () =>
                                      patchJson(
                                        `/api/clients/${client.id}/integrations/${integration.id}`,
                                        {
                                          microsoftCustomerId: microsoftCustomerId || null,
                                          microsoftAccountId: microsoftAccountId || null,
                                          demoMode: false,
                                        },
                                      ),
                                    `Microsoft Ads account updated for ${client.name}.`,
                                  );
                                }}
                              >
                                <div className="grid gap-3 lg:grid-cols-2">
                                  <FieldWithHelp
                                    label="Customer ID"
                                    helpTitle="Where to find Customer ID"
                                    helpBody={
                                      <>
                                        <p>
                                          Open <strong>Campaigns</strong> in Microsoft Advertising
                                          and look at the browser URL.
                                        </p>
                                        <p>
                                          Copy the numeric value after <code>cid=</code>.
                                        </p>
                                        <p>
                                          Example: <code>...&cid=501071198&aid=149461593</code>
                                        </p>
                                      </>
                                    }
                                  >
                                    <Input
                                      name="microsoftCustomerId"
                                      placeholder="Microsoft Customer ID"
                                      defaultValue={integration.settings.microsoftCustomerId ?? ""}
                                    />
                                  </FieldWithHelp>
                                  <FieldWithHelp
                                    label="Account ID"
                                    helpTitle="Where to find Account ID"
                                    helpBody={
                                      <>
                                        <p>
                                          On the same <strong>Campaigns</strong> page URL, copy the
                                          numeric value after <code>aid=</code>.
                                        </p>
                                        <p>
                                          Do not use the short account code shown in the selector.
                                        </p>
                                      </>
                                    }
                                  >
                                    <Input
                                      name="microsoftAccountId"
                                      placeholder="Microsoft Account ID"
                                      defaultValue={integration.settings.microsoftAccountId ?? ""}
                                    />
                                  </FieldWithHelp>
                                </div>
                                <button
                                  type="submit"
                                  className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                >
                                  Save Microsoft Ads IDs
                                </button>
                              </form>
                            ) : null}

                            {integration.platformKey === "microsoft_merchant_center" ? (
                              <form
                                className="mt-4 grid gap-4"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const formData = new FormData(event.currentTarget);
                                  const microsoftCustomerId = String(formData.get("microsoftCustomerId") ?? "").trim();
                                  const microsoftAccountId = String(formData.get("microsoftAccountId") ?? "").trim();
                                  const merchantStoreId = String(formData.get("merchantStoreId") ?? "").trim();
                                  const merchantFeedId = String(formData.get("merchantFeedId") ?? "").trim();
                                  runTask(
                                    () =>
                                      patchJson(
                                        `/api/clients/${client.id}/integrations/${integration.id}`,
                                        {
                                          microsoftCustomerId: microsoftCustomerId || null,
                                          microsoftAccountId: microsoftAccountId || null,
                                          merchantStoreId: merchantStoreId || null,
                                          merchantFeedId: merchantFeedId || null,
                                          demoMode: false,
                                        },
                                      ),
                                    `Microsoft Merchant Center updated for ${client.name}.`,
                                  );
                                }}
                              >
                                <div className="grid gap-3 lg:grid-cols-2">
                                  <FieldWithHelp
                                    label="Customer ID"
                                    helpTitle="Where to find Customer ID"
                                    helpBody={
                                      <>
                                        <p>
                                          Open <strong>Campaigns</strong> in Microsoft Advertising
                                          and copy the numeric value after <code>cid=</code> in the
                                          URL.
                                        </p>
                                      </>
                                    }
                                  >
                                    <Input
                                      name="microsoftCustomerId"
                                      placeholder="Microsoft Customer ID"
                                      defaultValue={integration.settings.microsoftCustomerId ?? ""}
                                    />
                                  </FieldWithHelp>
                                  <FieldWithHelp
                                    label="Account ID"
                                    helpTitle="Where to find Account ID"
                                    helpBody={
                                      <>
                                        <p>
                                          On the same Microsoft Advertising URL, copy the numeric
                                          value after <code>aid=</code>.
                                        </p>
                                      </>
                                    }
                                  >
                                    <Input
                                      name="microsoftAccountId"
                                      placeholder="Microsoft Account ID"
                                      defaultValue={integration.settings.microsoftAccountId ?? ""}
                                    />
                                  </FieldWithHelp>
                                  <FieldWithHelp
                                    label="Merchant Store ID"
                                    helpTitle="Where to find Merchant Store ID"
                                    helpBody={
                                      <>
                                        <p>
                                          Open <strong>Merchant Center</strong> for the client and
                                          look for the store details page or the store URL.
                                        </p>
                                        <p>
                                          Use the numeric store identifier when available. If the UI
                                          does not expose it clearly, keep this field pending and we
                                          can resolve it in the API adapter step.
                                        </p>
                                      </>
                                    }
                                  >
                                    <Input
                                      name="merchantStoreId"
                                      placeholder="Merchant Store ID"
                                      defaultValue={integration.settings.merchantStoreId ?? ""}
                                    />
                                  </FieldWithHelp>
                                  <FieldWithHelp
                                    label="Feed ID"
                                    helpTitle="Where to find Feed ID"
                                    helpBody={
                                      <>
                                        <p>
                                          Open the feed details screen in Merchant Center and copy
                                          the numeric <strong>Feed ID</strong>.
                                        </p>
                                        <p>
                                          This field is optional for the first connection, but it is
                                          useful for diagnostics and future sync checks.
                                        </p>
                                      </>
                                    }
                                  >
                                    <Input
                                      name="merchantFeedId"
                                      placeholder="Feed ID (optional)"
                                      defaultValue={integration.settings.merchantFeedId ?? ""}
                                    />
                                  </FieldWithHelp>
                                </div>
                                <button
                                  type="submit"
                                  className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 lg:w-auto"
                                >
                                  Save Merchant Center IDs
                                </button>
                              </form>
                            ) : null}

                            {integration.platformKey === "google_search_console" &&
                            integration.metadata?.propertySummaries?.length ? (
                              <>
                                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {integration.metadata.propertySummaries.length} accessible Search
                                  Console properties detected
                                </p>
                                <MetadataSummaryPreview
                                  label="Accessible properties"
                                  summaries={integration.metadata.propertySummaries}
                                />
                              </>
                            ) : null}

                            {integration.platformKey === "google_business_profile" &&
                            integration.metadata?.accountSummaries?.length ? (
                              <>
                                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {integration.metadata.accountSummaries.length} accessible
                                  Business Profile accounts detected
                                  {integration.metadata.locationSummaries?.length
                                    ? ` · ${integration.metadata.locationSummaries.length} locations loaded`
                                    : ""}
                                </p>
                                <MetadataSummaryPreview
                                  label="Accessible accounts"
                                  summaries={integration.metadata.accountSummaries}
                                />
                                {integration.metadata.locationSummaries?.length ? (
                                  <MetadataSummaryPreview
                                    label="Accessible locations"
                                    summaries={integration.metadata.locationSummaries}
                                  />
                                ) : null}
                              </>
                            ) : null}

                            {integration.platformKey === "google_analytics" &&
                            integration.metadata?.propertySummaries?.length ? (
                              <>
                                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {integration.metadata.propertySummaries.length} accessible GA4
                                  properties detected
                                </p>
                                <MetadataSummaryPreview
                                  label="Accessible properties"
                                  summaries={integration.metadata.propertySummaries}
                                />
                              </>
                            ) : null}

                            {integration.platformKey === "google_ads" &&
                            integration.metadata?.propertySummaries?.length ? (
                              <>
                                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {integration.metadata.propertySummaries.length} accessible Google
                                  Ads customers detected
                                </p>
                                <MetadataSummaryPreview
                                  label="Accessible customers"
                                  summaries={integration.metadata.propertySummaries}
                                />
                              </>
                          ) : null}
                          </>
                          )}
                          </article>
                        )})
                      )}
                    </div>

                    {connectedIntegrations.length === 0 ? (
                      <p className="mt-3 text-sm text-amber-200">
                        Configure at least one integration until it reaches live-ready status before running a client-facing audit.
                      </p>
                    ) : null}

                    <ReportPeriodPanel
                      clientId={client.id}
                      reportPeriods={client.reportPeriods}
                      readyIntegrationCount={connectedIntegrations.length}
                      runTask={runTask}
                    />

                    <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-white">Locations</h4>
                        <span className="text-sm text-slate-400">
                          {client.locations.length} synced
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {client.locations.length === 0 ? (
                          <EmptyState text="No synced locations yet." compact />
                        ) : (
                          client.locations.map((location) => (
                            <div
                              key={location.id}
                              className="rounded-[1rem] border border-white/10 bg-[#182230] p-3 text-sm"
                            >
                              <p className="font-medium text-white">{location.label}</p>
                              <p className="text-slate-400">
                                {location.landingPageUrl ?? "No landing page"}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {client.audits.length === 0 ? (
                        <EmptyState text="No audits yet for this client." compact />
                      ) : (
                        client.audits.map((audit) => (
                          <article
                            key={audit.id}
                            className="rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                                  Audit {audit.id.slice(-6)}
                                </p>
                                <p className="mt-2 text-sm text-slate-400">
                                  {new Date(audit.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <span
                                className={clsx(
                                  "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
                                  audit.status === "completed" && "bg-emerald-100 text-emerald-700",
                                  audit.status === "failed" && "bg-rose-100 text-rose-700",
                                  audit.status !== "completed" &&
                                    audit.status !== "failed" &&
                                    "bg-amber-100 text-amber-700",
                                )}
                              >
                                {audit.status}
                              </span>
                            </div>
                            <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">
                              {audit.score ?? "--"}
                              {audit.grade ? (
                                <span className="ml-2 text-base text-slate-400">
                                  {audit.grade}
                                </span>
                              ) : null}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3 text-sm">
                              <a
                                className="text-[#f3c15b] underline"
                                href={`/api/audits/${audit.id}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Details
                              </a>
                              <a
                                className="text-[#f3c15b] underline"
                                href={`/api/audits/${audit.id}/locations`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Locations
                              </a>
                              <a
                                className="text-[#f3c15b] underline"
                                href={`/api/audits/${audit.id}/report.json`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                JSON
                              </a>
                              {data.pdfRenderer.available ? (
                                <a
                                  className="text-[#f3c15b] underline"
                                  href={`/api/audits/${audit.id}/report.pdf`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  PDF
                                </a>
                              ) : (
                                <span className="text-slate-500">PDF unavailable</span>
                              )}
                            </div>
                            <div className="mt-5 rounded-[1rem] border border-white/10 bg-[#182230] p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                                    Report feedback
                                  </p>
                                  <p className="mt-2 text-sm leading-6 text-slate-400">
                                    Capture whether this report was client-ready, needed revision,
                                    or missed the mark. This guides future report drafting for the
                                    same client.
                                  </p>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                                  {
                                    client.reportFeedback.filter(
                                      (feedback) => feedback.auditId === audit.id,
                                    ).length
                                  } logged
                                </span>
                              </div>
                              <form
                                className="mt-4 grid gap-3"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const formData = new FormData(event.currentTarget);
                                  const rating = String(formData.get("rating") ?? "approve");
                                  const notes = String(formData.get("notes") ?? "").trim();
                                  runTask(
                                    () =>
                                      postJson(`/api/audits/${audit.id}/feedback`, {
                                        rating,
                                        notes,
                                      }),
                                    `Feedback saved for audit ${audit.id.slice(-6)}.`,
                                  );
                                  event.currentTarget.reset();
                                }}
                              >
                                <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr_auto]">
                                  <select
                                    name="rating"
                                    className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
                                    defaultValue="approve"
                                  >
                                    <option value="approve">Approved</option>
                                    <option value="revise">Needs revision</option>
                                    <option value="reject">Rejected</option>
                                  </select>
                                  <Input
                                    name="notes"
                                    placeholder="What should the assistant keep, improve, or avoid next time?"
                                    required
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.08]"
                                  >
                                    Save feedback
                                  </button>
                                </div>
                              </form>
                              <div className="mt-4 grid gap-3">
                                {client.reportFeedback
                                  .filter((feedback) => feedback.auditId === audit.id)
                                  .slice(0, 3)
                                  .map((feedback) => (
                                    <div
                                      key={feedback.id}
                                      className="rounded-[1rem] border border-white/10 bg-[#111925] p-3"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span
                                          className={clsx(
                                            "rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.2em]",
                                            getFeedbackToneClasses(feedback.rating),
                                          )}
                                        >
                                          {getFeedbackLabel(feedback.rating)}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          {new Date(feedback.createdAt).toLocaleString()}
                                        </span>
                                      </div>
                                      <p className="mt-3 text-sm leading-6 text-slate-300">
                                        {feedback.notes}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                    </>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}

function FastNavigationCard({
  clients,
}: {
  clients: DashboardData["clients"];
}) {
  const [query, setQuery] = useState("");
  const filteredClients = clients.filter((client) =>
    `${client.name} ${client.industry} ${client.primaryDomain ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <div className="rounded-[1.5rem] border border-[#8f7a2f] bg-[linear-gradient(135deg,rgba(243,193,91,0.12)_0%,rgba(255,255,255,0.04)_100%)] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-[0.28em] text-[#f3d78f]">
            Fast navigation tool
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Jump straight to the client workspace and open the exact client block without scanning
            the full page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#workspace-title"
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.08]"
          >
            Client workspace
          </a>
        </div>
      </div>

      <div className="mt-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find client by name, industry, or domain"
          className="w-full rounded-2xl border border-white/10 bg-[#111925] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 xl:max-w-md"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {clients.length === 0 ? (
          <span className="rounded-[1rem] border border-dashed border-white/12 px-3 py-4 text-sm text-slate-400">
            No clients yet
          </span>
        ) : filteredClients.length === 0 ? (
          <span className="rounded-[1rem] border border-dashed border-white/12 px-3 py-4 text-sm text-slate-400">
            No clients match this search
          </span>
        ) : (
          filteredClients.map((client) => {
            const readyIntegrations = client.integrations.filter(
              (integration) => integration.connectionStatus === "ready",
            ).length;

            return (
              <a
                key={client.id}
                href={`#client-${client.id}`}
                className="min-w-0 rounded-[1rem] border border-white/10 bg-[#111925] px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{client.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {client.primaryDomain ?? client.industry}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    Open
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                    {readyIntegrations} ready
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    {client.locations.length} locations
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    {client.audits.length} audits
                  </span>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}

function FieldWithHelp({
  label,
  helpTitle,
  helpBody,
  children,
}: {
  label: string;
  helpTitle: string;
  helpBody: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
        {label}
        <HelpPopover title={helpTitle}>{helpBody}</HelpPopover>
      </span>
      {children}
    </label>
  );
}

function ResourceSelectField({
  label,
  helpTitle,
  helpBody,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  helpTitle: string;
  helpBody: ReactNode;
  value: string;
  placeholder: string;
  options: ResourceOption[];
  onChange: (value: string) => void;
}) {
  return (
    <FieldWithHelp
      label={label}
      helpTitle={helpTitle}
      helpBody={helpBody}
    >
      <SelectInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </FieldWithHelp>
  );
}

function MetadataSummaryPreview({
  label,
  summaries,
}: {
  label: string;
  summaries: IntegrationPropertySummary[];
}) {
  return (
    <div className="mt-3 rounded-[1rem] border border-white/10 bg-[#111925] p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {summaries.slice(0, 6).map((summary) => (
          <span
            key={summary.resourceName}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300"
            title={summary.resourceName}
          >
            {summary.displayName}
          </span>
        ))}
        {summaries.length > 6 ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
            +{summaries.length - 6} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HelpPopover({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group relative inline-block">
      <summary className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-[11px] font-semibold text-[#f3c15b] transition hover:border-[#f3c15b]">
        ?
      </summary>
      <div className="absolute left-0 top-full z-20 mt-3 w-[min(22rem,calc(100vw-4rem))] rounded-[1.25rem] border border-white/10 bg-[#0f1723] p-4 text-sm font-normal leading-6 text-slate-400 shadow-[0_20px_45px_rgba(0,0,0,0.35)]">
        <p className="font-semibold text-white">{title}</p>
        <div className="mt-2 space-y-2">{children}</div>
      </div>
    </details>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
    />
  );
}

function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="rounded-2xl border border-white/10 bg-[#0e1621] px-4 py-3 text-sm text-slate-100 outline-none"
    />
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-[1.25rem] border border-dashed border-white/12 bg-white/[0.03] text-slate-400",
        compact ? "p-4 text-sm" : "p-6 text-sm",
      )}
    >
      {text}
    </div>
  );
}

function EmptyPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-dashed border-white/12 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-400">
      {text}
    </span>
  );
}

function StatusBadge({ status }: { status: IntegrationConnectionStatus }) {
  return (
    <span
      className={clsx(
        "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]",
        status === "ready" && "bg-emerald-100 text-emerald-700",
        status === "attention" && "bg-amber-100 text-amber-800",
        status === "demo" && "bg-slate-200 text-slate-700",
      )}
    >
      {status === "ready" ? "live-ready" : status}
    </span>
  );
}

function StatusChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={clsx(
        "rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.18em]",
        ready
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          : "border-white/10 bg-white/[0.04] text-slate-400",
      )}
    >
      {label}
    </span>
  );
}
