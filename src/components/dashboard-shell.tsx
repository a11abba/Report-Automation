"use client";

import {
  useEffect,
  useState,
  useTransition,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { deleteJson, getJson, patchJson, postJson } from "@/lib/api-client";
import type { AuthSession } from "@/lib/auth-session";
import { getReportFocusLabel } from "@/lib/report-focus";
import type {
  AuditRecord,
  ConnectorHealthCheckResult,
  ConnectorMetadataResult,
  ConnectorValidationResult,
  IntegrationConnectionStatus,
  LocationRecord,
  PlatformDefinition,
  RulePackMetadata,
} from "@/lib/audit/types";

interface DashboardData {
  platforms: PlatformDefinition[];
  rulePacks: RulePackMetadata[];
  pdfRenderer: {
    available: boolean;
    message: string;
  };
  clients: Array<{
    id: string;
    name: string;
    industry: string;
    industryLabelPt: string | null;
    operatingModel: "single_source" | "composed_source";
    primaryDomain: string | null;
    reportLanguage: "pt-BR" | "pt-PT" | "en";
    reportFocus: "full_funnel" | "lifecycle_marketing" | "seo_local" | "paid_media";
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
  }>;
  recentAudits: AuditRecord[];
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
  const [message, setMessage] = useState<string | null>(null);
  const [deleteIntentClientId, setDeleteIntentClientId] = useState<string | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getJson<DashboardData>("/api/dashboard"),
    initialData,
  });

  const runTask = (task: () => Promise<unknown>, successMessage: string) => {
    startTransition(async () => {
      try {
        setMessage(null);
        await task();
        setMessage(successMessage);
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "audit-platform:oauth-complete") return;
      const payload = event.data.payload as { ok?: boolean; error?: string; status?: string };
      setMessage(
        payload.ok
          ? payload.status === "connected"
            ? "OAuth connection completed."
            : "OAuth callback received."
          : payload.error ?? "OAuth callback failed.",
      );
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [queryClient]);

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
        if (!opened) {
          throw new Error("The OAuth window was blocked. Please allow popups and try again.");
        }
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
        if (!opened) {
          throw new Error("The OAuth window was blocked. Please allow popups and try again.");
        }
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

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-[color:var(--line)] bg-white/90 px-5 py-4 shadow-[0_10px_30px_rgba(20,33,61,0.06)] backdrop-blur">
        <div className="flex items-center gap-4">
          {viewer.picture ? (
            <div
              aria-label={viewer.name}
              className="h-12 w-12 rounded-full border border-[color:var(--line)] bg-cover bg-center"
              role="img"
              style={{ backgroundImage: `url("${viewer.picture}")` }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] text-sm font-semibold text-[color:var(--ink)]">
              {viewer.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
              Session active
            </p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
              {viewer.name}
            </p>
            <p className="text-sm text-[color:var(--muted)]">{viewer.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[color:var(--muted)]">
            Sessao Google / Google session
          </span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-[color:var(--ink)] px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)]"
            >
              Sair / Sign out
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <div className="rounded-[2rem] border border-[color:var(--line)] bg-[color:var(--ink)] p-8 text-[color:var(--paper)] shadow-[0_30px_80px_rgba(10,13,26,0.18)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--gold)]">
            Open API Audit Studio
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Client-ready growth audits across Google, website, CRM, commerce, and lifecycle.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--mist)]">
            The dashboard is the client-facing product. Your extension becomes the internal
            operator that detects the active account or site and jumps the team into the right audit.
          </p>
          <div className="mt-6 inline-flex rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.22em] text-[color:var(--mist)]">
            Login bilingue com Google ativo
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            <StatCard label="Clients" value={String(data.clients.length)} />
            <StatCard label="Audits" value={String(data.recentAudits.length)} />
            <StatCard label="Platforms" value={String(data.platforms.length)} />
            <StatCard label="Rule Packs" value={String(data.rulePacks.length)} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-[color:var(--line)] bg-white p-6 shadow-[0_16px_40px_rgba(20,33,61,0.08)]">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">New client</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Create the client, set the primary domain, then attach the data sources you want to audit.
          </p>
          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const name = String(formData.get("name") ?? "");
              const industry = String(formData.get("industry") ?? "");
              const industryLabelPt = String(formData.get("industryLabelPt") ?? "");
              const primaryDomain = String(formData.get("primaryDomain") ?? "");
              const operatingModel = String(formData.get("operatingModel") ?? "single_source");
              const reportLanguage = String(formData.get("reportLanguage") ?? "pt-BR");
              const reportFocus = String(formData.get("reportFocus") ?? "full_funnel");
              runTask(
                () =>
                  postJson("/api/clients", {
                    name,
                    industry,
                    industryLabelPt: industryLabelPt || null,
                    operatingModel,
                    primaryDomain: primaryDomain || null,
                    reportLanguage,
                    reportFocus,
                  }),
                `Client "${name}" created.`,
              );
              event.currentTarget.reset();
            }}
          >
            <Input name="name" placeholder="Client name" required />
            <Input name="industry" placeholder="Industry or vertical" required />
            <Input
              name="industryLabelPt"
              placeholder="Portuguese report label (optional, used only for PT reports)"
            />
            <Input name="primaryDomain" placeholder="https://example.com" />
            <select
              name="reportLanguage"
              className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm outline-none"
              defaultValue="pt-BR"
            >
              <option value="pt-BR">Report in pt-BR</option>
              <option value="pt-PT">Report in pt-PT</option>
              <option value="en">Report in English</option>
            </select>
            <select
              name="operatingModel"
              className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm outline-none"
              defaultValue="single_source"
            >
              <option value="single_source">Single source</option>
              <option value="composed_source">Composed source</option>
            </select>
            <select
              name="reportFocus"
              className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm outline-none"
              defaultValue="full_funnel"
            >
              <option value="full_funnel">Full funnel report</option>
              <option value="lifecycle_marketing">Lifecycle / Email report</option>
              <option value="seo_local">SEO / Local report</option>
              <option value="paid_media">Paid media report</option>
            </select>
            <button
              type="submit"
              className="rounded-full bg-[color:var(--signal)] px-5 py-3 text-sm font-semibold text-[color:var(--paper)] disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving..." : "Create client"}
            </button>
          </form>
          {message ? <p className="mt-4 text-sm text-[color:var(--muted)]">{message}</p> : null}
          {!data.pdfRenderer.available ? (
            <p className="mt-2 text-sm text-amber-700">{data.pdfRenderer.message}</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[2rem] border border-[color:var(--line)] bg-white p-6 shadow-[0_16px_40px_rgba(20,33,61,0.08)]">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
            Client Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            Brand summary, Google setup, locations, and report runs
          </h2>

          <div className="mt-6 grid gap-4">
            {data.clients.length === 0 ? (
              <EmptyState text="Create your first client to unlock integrations, locations, and reports." />
            ) : (
              data.clients.map((client) => {
                const connectedIntegrations = client.integrations.filter(
                  (integration) => integration.connectionStatus === "ready",
                );

                return (
                  <article
                    key={client.id}
                    className="rounded-[1.5rem] border border-[color:var(--line)] bg-[color:var(--shell)] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold">{client.name}</h3>
                        <p className="mt-1 text-sm text-[color:var(--muted)]">
                          {client.industry} {"\u00b7"} {client.operatingModel.replace("_", " ")}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--muted)]">
                          {client.primaryDomain ?? "No primary domain"}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--muted)]">
                          Report language: {client.reportLanguage}
                          {client.industryLabelPt ? ` \u00b7 PT label: ${client.industryLabelPt}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--muted)]">
                          Report focus: {getReportFocusLabel("en", client.reportFocus)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 transition hover:bg-rose-100"
                          onClick={() => {
                            setDeleteIntentClientId(client.id);
                            setDeleteConfirmationText("");
                            setMessage(null);
                          }}
                          type="button"
                        >
                          Remove client
                        </button>
                        <button
                          className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm"
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
                          className="rounded-full border border-[color:var(--ink)] px-4 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)] disabled:opacity-50"
                          disabled={pending || connectedIntegrations.length === 0}
                          onClick={() =>
                            runTask(
                              () => postJson(`/api/clients/${client.id}/audits`, {}),
                              `Audit requested for ${client.name}.`,
                            )
                          }
                        >
                          Run brand audit
                        </button>
                      </div>
                    </div>

                    {deleteIntentClientId === client.id ? (
                      <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50/80 p-4">
                        <p className="text-sm font-medium text-rose-800">
                          Confirm client removal
                        </p>
                        <p className="mt-2 text-sm leading-6 text-rose-700">
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
                            className="rounded-full border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700"
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

                    <form
                      className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
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
                            }),
                          `Client preferences updated for ${client.name}.`,
                        );
                      }}
                    >
                      <select
                        name="reportLanguage"
                        className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none"
                        defaultValue={client.reportLanguage}
                      >
                        <option value="pt-BR">Report in pt-BR</option>
                        <option value="pt-PT">Report in pt-PT</option>
                        <option value="en">Report in English</option>
                      </select>
                      <select
                        name="reportFocus"
                        className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none"
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
                        className="rounded-full border border-[color:var(--line)] bg-white px-4 py-3 text-sm"
                      >
                        Save report settings
                      </button>
                    </form>

                    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                      <select
                        form={`integration-${client.id}`}
                        name="platformKey"
                        className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none"
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
                        className="rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-[color:var(--paper)]"
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
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs uppercase tracking-[0.2em]"
                        onClick={() => launchGoogleOAuth(client.id, "google_search_console")}
                      >
                        Connect Search Console
                      </button>
                      <button
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs uppercase tracking-[0.2em]"
                        onClick={() => launchGoogleOAuth(client.id, "google_business_profile")}
                      >
                        Connect Business Profile
                      </button>
                      <button
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs uppercase tracking-[0.2em]"
                        onClick={() => launchGoogleOAuth(client.id, "google_analytics")}
                      >
                        Connect GA4
                      </button>
                      <button
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs uppercase tracking-[0.2em]"
                        onClick={() => launchMicrosoftOAuth(client.id, "microsoft_ads")}
                      >
                        Connect Microsoft Ads
                      </button>
                      <button
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs uppercase tracking-[0.2em]"
                        onClick={() => launchMicrosoftOAuth(client.id, "microsoft_merchant_center")}
                      >
                        Connect Merchant Center
                      </button>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {client.integrations.length === 0 ? (
                        <EmptyPill text="No integrations yet" />
                      ) : (
                        client.integrations.map((integration) => (
                          <article
                            key={integration.id}
                            className="rounded-[1.25rem] border border-[color:var(--line)] bg-white p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-[color:var(--ink)]">
                                  {integration.displayName}
                                </p>
                                <p className="mt-1 text-sm text-[color:var(--muted)]">
                                  {integration.platformKey}
                                  {integration.credentials.authOrigin
                                    ? ` \u00b7 ${integration.credentials.authOrigin}`
                                    : ""}
                                </p>
                              </div>
                              <StatusBadge status={integration.connectionStatus} />
                            </div>

                            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                              {integration.validationMessage}
                            </p>

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

                            {integration.platformKey === "google_analytics" ? (
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
                                  className="rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm"
                                >
                                  Save GA4 property
                                </button>
                              </form>
                            ) : null}

                            {integration.platformKey === "meta_ads" ? (
                              <form
                                className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const formData = new FormData(event.currentTarget);
                                  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
                                  runTask(
                                    () =>
                                      patchJson(
                                        `/api/clients/${client.id}/integrations/${integration.id}`,
                                        {
                                          adAccountId: adAccountId || null,
                                          demoMode: false,
                                        },
                                      ),
                                    `Meta ad account updated for ${client.name}.`,
                                  );
                                }}
                              >
                                <Input
                                  name="adAccountId"
                                  placeholder="Meta ad account ID (1234567890 or act_1234567890)"
                                  defaultValue={integration.settings.adAccountId ?? ""}
                                />
                                <button
                                  type="submit"
                                  className="rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm"
                                >
                                  Save ad account
                                </button>
                              </form>
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
                                  className="w-full rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm lg:w-auto"
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
                                  className="w-full rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm lg:w-auto"
                                >
                                  Save Merchant Center IDs
                                </button>
                              </form>
                            ) : null}

                            {integration.platformKey === "google_analytics" &&
                            integration.metadata?.propertySummaries?.length ? (
                              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">
                                {integration.metadata.propertySummaries.length} accessible GA4
                                properties detected
                              </p>
                            ) : null}
                          </article>
                        ))
                      )}
                    </div>

                    {connectedIntegrations.length === 0 ? (
                      <p className="mt-3 text-sm text-amber-700">
                        Configure at least one integration until it reaches live-ready status before running a client-facing audit.
                      </p>
                    ) : null}

                    <div className="mt-5 rounded-[1.25rem] border border-[color:var(--line)] bg-white p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Locations</h4>
                        <span className="text-sm text-[color:var(--muted)]">
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
                              className="rounded-[1rem] border border-[color:var(--line)] bg-[color:var(--shell)] p-3 text-sm"
                            >
                              <p className="font-medium">{location.label}</p>
                              <p className="text-[color:var(--muted)]">
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
                            className="rounded-[1.25rem] border border-[color:var(--line)] bg-white p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">
                                  Audit {audit.id.slice(-6)}
                                </p>
                                <p className="mt-2 text-sm text-[color:var(--muted)]">
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
                            <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
                              {audit.score ?? "--"}
                              {audit.grade ? (
                                <span className="ml-2 text-base text-[color:var(--muted)]">
                                  {audit.grade}
                                </span>
                              ) : null}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3 text-sm">
                              <a
                                className="text-[color:var(--signal)] underline"
                                href={`/api/audits/${audit.id}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Details
                              </a>
                              <a
                                className="text-[color:var(--signal)] underline"
                                href={`/api/audits/${audit.id}/locations`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Locations
                              </a>
                              <a
                                className="text-[color:var(--signal)] underline"
                                href={`/api/audits/${audit.id}/report.json`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                JSON
                              </a>
                              {data.pdfRenderer.available ? (
                                <a
                                  className="text-[color:var(--signal)] underline"
                                  href={`/api/audits/${audit.id}/report.pdf`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  PDF
                                </a>
                              ) : (
                                <span className="text-[color:var(--muted)]">PDF unavailable</span>
                              )}
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <aside className="grid gap-6">
          <section className="rounded-[2rem] border border-[color:var(--line)] bg-white p-6 shadow-[0_16px_40px_rgba(20,33,61,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Extension Kit
            </p>
            <h3 className="mt-3 text-xl font-semibold">Internal browser extension flow</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              Use the extension to detect the current Google, website, or platform context and jump
              straight into the correct client audit. The dashboard remains the source of truth.
            </p>
            <a
              className="mt-4 inline-block text-sm text-[color:var(--signal)] underline"
              href="apps/extension/README.md"
            >
              Open extension scaffold
            </a>
          </section>

          <section className="rounded-[2rem] border border-[color:var(--line)] bg-white p-6 shadow-[0_16px_40px_rgba(20,33,61,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
              Platforms
            </p>
            <div className="mt-4 grid gap-3">
              {data.platforms.map((platform) => (
                <article
                  key={platform.key}
                  className="rounded-[1.25rem] border border-[color:var(--line)] bg-[color:var(--shell)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{platform.name}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-[color:var(--muted)]">
                      {platform.launchStage}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                    {platform.description}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4">
      <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--mist)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
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
      <span className="flex items-center gap-2 text-sm font-medium text-[color:var(--ink)]">
        {label}
        <HelpPopover title={helpTitle}>{helpBody}</HelpPopover>
      </span>
      {children}
    </label>
  );
}

function HelpPopover({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group relative inline-block">
      <summary className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--shell)] text-[11px] font-semibold text-[color:var(--signal)] transition hover:border-[color:var(--signal)]">
        ?
      </summary>
      <div className="absolute left-0 top-full z-20 mt-3 w-[min(22rem,calc(100vw-4rem))] rounded-[1.25rem] border border-[color:var(--line)] bg-white p-4 text-sm font-normal leading-6 text-[color:var(--muted)] shadow-[0_20px_45px_rgba(20,33,61,0.14)]">
        <p className="font-semibold text-[color:var(--ink)]">{title}</p>
        <div className="mt-2 space-y-2">{children}</div>
      </div>
    </details>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--shell)] px-4 py-3 text-sm outline-none"
    />
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-[1.25rem] border border-dashed border-[color:var(--line)] bg-white text-[color:var(--muted)]",
        compact ? "p-4 text-sm" : "p-6 text-sm",
      )}
    >
      {text}
    </div>
  );
}

function EmptyPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-dashed border-[color:var(--line)] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
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
        status === "demo" && "bg-slate-100 text-slate-700",
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
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-[color:var(--line)] bg-[color:var(--shell)] text-[color:var(--muted)]",
      )}
    >
      {label}
    </span>
  );
}
