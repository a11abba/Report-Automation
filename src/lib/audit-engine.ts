import { PgBoss } from "pg-boss";
import {
  type AuditScope,
  type AuditReportPayload,
  type ContextEntryRecord,
  type ClientRecord,
  type ConnectorMetadataResult,
  type ConnectorValidationResult,
  type IntegrationConnectionStatus,
  type IntegrationRecord,
  type LocationRecord,
  type PlatformKey,
  type ReportFeedbackRecord,
  type ReportMemoryRecord,
  type ReportPeriodRecord,
} from "@/lib/audit/types";
import type { AuthSession } from "@/lib/auth-session";
import { canViewAccountBilling, normalizeAppRole } from "@/lib/auth-access";
import {
  getConnector,
  mergeSnapshots,
  platformCatalog,
  type PlatformConnector,
} from "@/lib/connectors";
import {
  buildGoogleOAuthUrl,
  consumeGoogleOAuthCallback,
  getGoogleScopes,
  refreshGoogleAccessToken,
} from "@/lib/google-auth";
import {
  buildMicrosoftOAuthUrl,
  consumeMicrosoftOAuthCallback,
  getMicrosoftScopes,
  refreshMicrosoftAccessToken,
} from "@/lib/microsoft-auth";
import { enhanceReportWithAi } from "@/lib/report-ai";
import { resolveScheduledMonthlyPeriod } from "@/lib/report-scheduler-utils";
import { buildReport, evaluateRules, rulePackCatalog } from "@/lib/rules";
import { getPdfRendererStatus } from "@/lib/reports";
import { deriveMonthRange, emptyReportPeriodManualInputs } from "@/lib/report-period-utils";
import { getStore } from "@/lib/storage";
import {
  createIntegrationWithVault,
  deleteIntegrationWithVault,
  hydrateIntegrationForExecution,
  updateIntegrationWithVault,
} from "@/services/integrations";
import { logEvent } from "@/services/logger";

const AUDIT_QUEUE_NAME = "audit-run";

function getPgBossDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    return null;
  }

  if (!/^postgres(ql)?:\/\//i.test(value)) {
    throw new Error(
      "DATABASE_URL must point to PostgreSQL for pg-boss. On Hostinger managed Node.js hosting, leave DATABASE_URL empty to run audits inline.",
    );
  }

  return value;
}

function deriveConnectionStatus(
  mode: "demo" | "api",
  readyForLiveData: boolean,
): IntegrationConnectionStatus {
  if (readyForLiveData) {
    return "ready";
  }
  return mode === "demo" ? "demo" : "attention";
}

export class AuditPreflightError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "audit_preflight_failed", status = 409) {
    super(message);
    this.name = "AuditPreflightError";
    this.code = code;
    this.status = status;
  }
}

function dedupeExcludedIntegrations(
  items: NonNullable<AuditScope["excludedIntegrations"]>,
) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function buildIntegrationCoverage(
  allIntegrations: IntegrationRecord[],
  includedIntegrations: IntegrationRecord[],
  excludedIntegrations: NonNullable<AuditScope["excludedIntegrations"]>,
  runtimeExcludedIntegrations: NonNullable<AuditScope["excludedIntegrations"]>,
): AuditReportPayload["execution"]["coverage"] {
  const includedIds = new Set(includedIntegrations.map((integration) => integration.id));
  const runtimeExcludedById = new Map(
    runtimeExcludedIntegrations.map((integration) => [integration.id, integration]),
  );
  const excludedById = new Map(
    excludedIntegrations.map((integration) => [integration.id, integration]),
  );

  return allIntegrations.map((integration) => {
    if (includedIds.has(integration.id)) {
      return {
        id: integration.id,
        label: integration.displayName,
        platformKey: integration.platformKey,
        status: "included" as const,
        reason: null,
      };
    }

    const runtimeExcluded = runtimeExcludedById.get(integration.id);
    if (runtimeExcluded) {
      return {
        id: integration.id,
        label: integration.displayName,
        platformKey: integration.platformKey,
        status: "skipped" as const,
        reason: runtimeExcluded.reason,
      };
    }

    const excluded = excludedById.get(integration.id);
    return {
      id: integration.id,
      label: integration.displayName,
      platformKey: integration.platformKey,
      status: "not_live_ready" as const,
      reason: excluded?.reason ?? "Integration was not live-ready for this audit run.",
    };
  });
}

async function getIntegrationExecutionState(client: ClientRecord, integration: IntegrationRecord) {
  try {
    const executableIntegration = await prepareIntegrationForExecution(integration);
    const connector = getConnector(executableIntegration.platformKey);
    const validation = await connector.validateCredentials(executableIntegration);
    let metadata: ConnectorMetadataResult | null = null;

    if (validation.authenticated && connector.discoverMetadata) {
      try {
        metadata = await connector.discoverMetadata({
          client,
          integration: executableIntegration,
          requestedCapabilities: connector.capabilities(),
        });
      } catch {
        metadata = null;
      }
    }

    const healthCheck =
      validation.liveReady && connector.healthCheck
        ? await connector.healthCheck(executableIntegration)
        : validation.liveReady
          ? { ok: true, code: "ok", message: validation.message }
          : null;
    const readyForLiveData = validation.liveReady && (healthCheck?.ok ?? true);
    const connectionStatus = deriveConnectionStatus(validation.mode, readyForLiveData);

    return {
      integration: executableIntegration,
      validation,
      metadata,
      healthCheck,
      readyForLiveData,
      connectionStatus,
      validationMessage: healthCheck && !healthCheck.ok ? healthCheck.message : validation.message,
    };
  } catch (error) {
    const authenticated = Boolean(integration.credentials.accessToken || integration.credentials.apiKey);
    const fallbackValidation: ConnectorValidationResult = {
      valid: false,
      mode: authenticated ? ("api" as const) : ("demo" as const),
      code: "execution_prepare_failed",
      message: error instanceof Error ? error.message : "Integration could not be prepared.",
      environmentConfigured: true,
      authenticated,
      resourceSelected: Boolean(
        integration.settings.ga4PropertyId ||
          integration.settings.propertyId ||
          integration.settings.businessAccountId ||
          integration.settings.businessProfileId ||
          integration.settings.adAccountId ||
          integration.settings.microsoftCustomerId ||
          integration.settings.microsoftAccountId ||
          integration.settings.merchantStoreId ||
          integration.settings.merchantFeedId ||
          integration.settings.targetUrl,
      ),
      liveReady: false,
    };

    return {
      integration,
      validation: fallbackValidation,
      metadata: null,
      healthCheck: null,
      readyForLiveData: false,
      connectionStatus: deriveConnectionStatus(fallbackValidation.mode, false),
      validationMessage: fallbackValidation.message,
    };
  }
}

function getAuditDateRange(scope: AuditScope | null | undefined) {
  if (!scope?.periodStart || !scope.periodEnd) {
    return undefined;
  }
  return {
    startDate: scope.periodStart,
    endDate: scope.periodEnd,
  };
}

async function getReportPeriodBundle(
  reportPeriodId: string | undefined,
): Promise<{
  reportPeriod: ReportPeriodRecord | null;
  contextEntries: ContextEntryRecord[];
  baselinePeriod: ReportPeriodRecord | null;
  baselineReport: AuditReportPayload | null;
}> {
  if (!reportPeriodId) {
    return {
      reportPeriod: null,
      contextEntries: [],
      baselinePeriod: null,
      baselineReport: null,
    };
  }
  const store = await getStore();
  const reportPeriod = await store.getReportPeriod(reportPeriodId);
  if (!reportPeriod) {
    return {
      reportPeriod: null,
      contextEntries: [],
      baselinePeriod: null,
      baselineReport: null,
    };
  }
  const contextEntries = await store.listContextEntriesByReportPeriod(reportPeriodId);
  const baselinePeriod = reportPeriod.baselinePeriodId
    ? await store.getReportPeriod(reportPeriod.baselinePeriodId)
    : null;
  const baselineReport = baselinePeriod?.auditId
    ? await store.getReport(baselinePeriod.auditId)
    : null;
  return {
    reportPeriod,
    contextEntries,
    baselinePeriod,
    baselineReport,
  };
}

function isGoogleOAuthIntegration(integration: IntegrationRecord) {
  return (
    integration.credentials.authOrigin === "oauth" &&
    (integration.platformKey === "google_search_console" ||
      integration.platformKey === "google_business_profile" ||
      integration.platformKey === "google_analytics" ||
      integration.platformKey === "google_ads")
  );
}

function isMicrosoftOAuthIntegration(integration: IntegrationRecord) {
  return (
    integration.credentials.authOrigin === "oauth" &&
    (integration.platformKey === "microsoft_ads" ||
      integration.platformKey === "microsoft_merchant_center")
  );
}

async function prepareIntegrationForExecution(integration: IntegrationRecord) {
  const hydrated = await hydrateIntegrationForExecution(integration);
  if (!isGoogleOAuthIntegration(hydrated) && !isMicrosoftOAuthIntegration(hydrated)) {
    return hydrated;
  }

  if (!hydrated.credentials.expiresAt || !hydrated.credentials.refreshToken) {
    return hydrated;
  }

  const expiresAt = new Date(hydrated.credentials.expiresAt).getTime();
  const needsRefresh = Number.isFinite(expiresAt) && expiresAt - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) {
    return hydrated;
  }

  const refreshed = isGoogleOAuthIntegration(hydrated)
    ? await refreshGoogleAccessToken(
        hydrated.credentials.refreshToken,
        hydrated.credentials.scopes,
      )
    : await refreshMicrosoftAccessToken(
        hydrated.credentials.refreshToken,
        hydrated.credentials.scopes,
      );
  const updated = await updateIntegrationWithVault(hydrated.id, {
    credentials: {
      ...hydrated.credentials,
      ...refreshed,
      authOrigin: "oauth",
      scopes: hydrated.credentials.scopes,
    },
  });
  return updated ? hydrateIntegrationForExecution(updated) : hydrated;
}

export async function listDashboardData(
  viewer: Pick<AuthSession, "role" | "accountId">,
) {
  const store = await getStore();
  const [clients, audits, accounts, reportMemories] = await Promise.all([
    store.listClients(),
    store.listAudits(),
    store.listAccounts(),
    viewer.role === "platform_admin"
      ? store.listReportMemories()
      : store.listReportMemories(viewer.accountId),
  ]);
  const visibleClients =
    viewer.role === "platform_admin"
      ? clients
      : clients.filter((client) => client.accountId === viewer.accountId);
  const visibleAudits =
    viewer.role === "platform_admin"
      ? audits
      : audits.filter((audit) => audit.accountId === viewer.accountId);
  const clientsWithRelations = await Promise.all(
    visibleClients.map(async (client) => {
      const integrations = await store.listIntegrationsByClient(client.id);
      const duplicatePlatformKeys = new Set(
        integrations
          .map((integration) => integration.platformKey)
          .filter((platformKey, index, all) => all.indexOf(platformKey) !== index),
      );
      const integrationStates = await Promise.all(
        integrations.map(async (integration) => {
          const state = await getIntegrationExecutionState(client, integration);
          const duplicateDetected = duplicatePlatformKeys.has(integration.platformKey);
          return {
            ...integration,
            connectionStatus: duplicateDetected ? ("attention" as const) : state.connectionStatus,
            validationMessage: duplicateDetected
              ? `Duplicate ${integration.platformKey} integration detected. Keep one record per platform for reliable monthly reporting.`
              : state.validationMessage,
            connectionDetails: duplicateDetected
              ? {
                  ...state.validation,
                  valid: false,
                  liveReady: false,
                }
              : state.validation,
            healthCheck: state.healthCheck,
            metadata: state.metadata,
          };
        }),
      );
      const reportPeriods = await store.listReportPeriodsByClient(client.id);
      const [clientReportMemories, clientReportFeedback] = await Promise.all([
        store.listReportMemoriesByClient(client.id),
        store.listReportFeedbackByClient(client.id),
      ]);
      const reportPeriodsWithContext = await Promise.all(
        reportPeriods.map(async (reportPeriod) => {
          const [contextEntries, baselinePeriod] = await Promise.all([
            store.listContextEntriesByReportPeriod(reportPeriod.id),
            reportPeriod.baselinePeriodId ? store.getReportPeriod(reportPeriod.baselinePeriodId) : Promise.resolve(null),
          ]);
          return {
            ...reportPeriod,
            baselinePeriodKey: baselinePeriod?.periodKey ?? null,
            contextEntries,
          };
        }),
      );
      return {
        ...client,
        integrations: integrationStates,
        locations: await store.listLocationsByClient(client.id),
        audits: visibleAudits.filter((audit) => audit.clientId === client.id).slice(0, 5),
        reportMemories: clientReportMemories,
        reportFeedback: clientReportFeedback.slice(0, 10),
        reportPeriods: reportPeriodsWithContext,
      };
    }),
  );
  const visibleAccounts =
    viewer.role === "platform_admin"
      ? accounts
      : accounts.filter((account) => account.id === viewer.accountId);
  const accountSummaries = await Promise.all(
    visibleAccounts.map(async (account) => {
      const members = await store.listAccountMemberships(account.id);
      const accountClients = clients.filter((client) => client.accountId === account.id);
      const accountAudits = audits.filter((audit) => audit.accountId === account.id);
      const readyIntegrations = (
        await Promise.all(
          accountClients.map(async (client) => {
            const integrations = await store.listIntegrationsByClient(client.id);
            const states = await Promise.all(
              integrations.map(async (integration) =>
                getIntegrationExecutionState(client, integration),
              ),
            );
            return states.filter((state) => state.connectionStatus === "ready").length;
          }),
        )
      ).reduce((sum, value) => sum + value, 0);
      return {
        ...account,
        members: members.map((member) => ({
          ...member,
          role: normalizeAppRole(member.role),
        })),
        clientCount: accountClients.length,
        lastAuditAt: accountAudits[0]?.createdAt ?? null,
        readyIntegrations,
      };
    }),
  );
  const currentAccount =
    accountSummaries.find((account) => account.id === viewer.accountId) ?? null;
  return {
    platforms: platformCatalog,
    rulePacks: rulePackCatalog,
    accounts: accountSummaries,
    currentAccount:
      currentAccount && !canViewAccountBilling(viewer, currentAccount.id)
        ? {
            ...currentAccount,
            subscriptionStatus: null,
            serviceTier: null,
            billingCycleAnchor: null,
            trialEndsAt: null,
          }
        : currentAccount,
    clients: clientsWithRelations,
    reportMemories,
    recentAudits: visibleAudits.slice(0, 10),
    pdfRenderer: getPdfRendererStatus(),
  };
}

export async function runAudit(auditId: string) {
  const store = await getStore();
  const audit = await store.getAudit(auditId);
  if (!audit) throw new Error(`Audit ${auditId} not found.`);
  const client = await store.getClient(audit.clientId);
  if (!client) throw new Error(`Client ${audit.clientId} not found.`);
  const dateRange = getAuditDateRange(audit.scope);

  const allIntegrations = await store.listIntegrationsByClient(client.id);
  const integrations = allIntegrations.filter((integration) =>
    audit.integrationIds.includes(integration.id),
  );
  if (integrations.length === 0) throw new Error(`Audit ${auditId} has no integrations attached.`);

  const auditJob = (await store.listJobs({ kind: "audit_run" })).find(
    (job) => job.payload["auditId"] === auditId,
  );
  await store.updateAudit(auditId, { status: "running", errorMessage: null });
  if (audit.scope?.reportPeriodId) {
    await store.updateReportPeriod(audit.scope.reportPeriodId, {
      status: "running",
      auditId,
    });
  }
  if (auditJob) {
    await store.updateJob(auditJob.id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });
  }
  await logEvent({
    auditId,
    code: "audit.started",
    message: `Audit ${auditId} started.`,
    detail: { integrationCount: integrations.length },
  });
  try {
    const runtimeExcludedIntegrations: NonNullable<AuditScope["excludedIntegrations"]> = [];
    const collected: Array<{
      integration: IntegrationRecord;
      snapshot: Awaited<ReturnType<PlatformConnector["fetchSnapshot"]>>;
    }> = [];

    for (const integration of integrations) {
      try {
        const executableIntegration = await prepareIntegrationForExecution(integration);
        const connector = getConnector(executableIntegration.platformKey);
        const snapshot = await connector.fetchSnapshot({
          client,
          integration: executableIntegration,
          requestedCapabilities: connector.capabilities(),
          dateRange,
        });
        collected.push({
          integration: executableIntegration,
          snapshot,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Data collection failed.";
        runtimeExcludedIntegrations.push({
          id: integration.id,
          label: integration.displayName,
          platformKey: integration.platformKey,
          reason,
        });
        await logEvent({
          auditId,
          level: "warn",
          code: "audit.integration_skipped",
          message: `${integration.displayName} was skipped during audit execution.`,
          detail: {
            integrationId: integration.id,
            platformKey: integration.platformKey,
            reason,
          },
        });
      }
    }

    if (collected.length === 0) {
      const failureMessage =
        runtimeExcludedIntegrations.length === 1
          ? `${runtimeExcludedIntegrations[0].label}: ${runtimeExcludedIntegrations[0].reason}`
          : "All live integrations failed during data collection.";
      throw new Error(failureMessage);
    }

    const effectiveExcludedIntegrations = dedupeExcludedIntegrations([
      ...(audit.scope?.excludedIntegrations ?? []),
      ...runtimeExcludedIntegrations,
    ]);
    const effectiveIntegrations = collected.map((item) => item.integration);
    const effectiveScope =
      effectiveExcludedIntegrations.length === (audit.scope?.excludedIntegrations?.length ?? 0)
        ? audit.scope
        : {
            ...(audit.scope ?? {}),
            excludedIntegrations: effectiveExcludedIntegrations,
          };

    if (effectiveScope !== audit.scope || effectiveIntegrations.length !== integrations.length) {
      await store.updateAudit(auditId, {
        integrationIds: effectiveIntegrations.map((integration) => integration.id),
        scope: effectiveScope,
      });
    }

    const snapshots = collected.map((item) => item.snapshot);
    const merged = mergeSnapshots(client, snapshots);
    const storedLocations = await store.listLocationsByClient(client.id);
    if (storedLocations.length > 0) {
      const locationMap = new Map(
        storedLocations.map((location) => [
          location.id,
          {
            locationId: location.id,
            label: location.label,
            businessProfileId: location.businessProfileId,
            landingPageUrl: location.landingPageUrl,
            metrics: location.metrics,
            findings: location.findings,
          },
        ]),
      );
      for (const location of merged.locations) {
        const existing = locationMap.get(location.locationId);
        locationMap.set(
          location.locationId,
          existing
            ? {
                locationId: location.locationId,
                label: existing.label || location.label,
                businessProfileId: existing.businessProfileId ?? location.businessProfileId,
                landingPageUrl: existing.landingPageUrl ?? location.landingPageUrl,
                metrics: { ...existing.metrics, ...location.metrics },
                findings: [...existing.findings, ...location.findings],
              }
            : location,
        );
      }
      merged.locations = [...locationMap.values()];
    }
    if (audit.scope?.locationIds?.length) {
      merged.locations = merged.locations.filter((location) =>
        audit.scope?.locationIds?.includes(location.locationId),
      );
    }
    const findings = evaluateRules(merged);
    const reportPeriodBundle = await getReportPeriodBundle(audit.scope?.reportPeriodId);
    const [reportMemories, reportFeedback] = await Promise.all([
      store.listReportMemoriesByClient(client.id),
      store.listReportFeedbackByClient(client.id),
    ]);
    const report = buildReport(auditId, client, merged, findings, {
      execution: {
        includedIntegrations: effectiveIntegrations.map((integration) => ({
          id: integration.id,
          label: integration.displayName,
          platformKey: integration.platformKey,
        })),
        excludedIntegrations: effectiveExcludedIntegrations,
        coverage: buildIntegrationCoverage(
          allIntegrations,
          effectiveIntegrations,
          effectiveExcludedIntegrations,
          runtimeExcludedIntegrations,
        ),
      },
      reportPeriod: reportPeriodBundle.reportPeriod,
      baselineReport: reportPeriodBundle.baselineReport,
      baselinePeriodKey: reportPeriodBundle.baselinePeriod?.periodKey ?? null,
      contextEntries: reportPeriodBundle.contextEntries,
    });
    let finalReport = report;
    try {
      finalReport = await enhanceReportWithAi(report, {
        reportIntro: client.reportIntro,
        reportBenchmarks: client.reportBenchmarks,
        referenceReportNotes: client.referenceReportNotes,
        reportMemories,
        reportFeedback,
      });
      if (finalReport !== report) {
        await logEvent({
          auditId,
          code: "audit.ai_framework_applied",
          message: "AI report framework synthesis applied.",
          detail: {
            frameworkSummary: finalReport.framework.executiveSummary,
          },
        });
      }
    } catch (error) {
      await logEvent({
        auditId,
        level: "warn",
        code: "audit.ai_framework_failed",
        message: error instanceof Error ? error.message : "AI report framework synthesis failed.",
      });
    }
    await store.saveReport(auditId, finalReport);
    await store.updateAudit(auditId, {
      status: "completed",
      score: finalReport.score,
      grade: finalReport.grade,
      completedAt: new Date().toISOString(),
      errorMessage: null,
    });
    if (audit.scope?.reportPeriodId) {
      await store.updateReportPeriod(audit.scope.reportPeriodId, {
        status: "completed",
        auditId,
        generatedAt: finalReport.generatedAt,
      });
    }
    if (auditJob) {
      await store.updateJob(auditJob.id, {
        status: "completed",
        result: { score: finalReport.score, grade: finalReport.grade },
        completedAt: new Date().toISOString(),
      });
    }
    await logEvent({
      auditId,
      code: "audit.completed",
      message: `Audit ${auditId} completed.`,
      detail: { score: finalReport.score, grade: finalReport.grade },
    });
    return finalReport;
  } catch (error) {
    await store.updateAudit(auditId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown audit error",
      completedAt: new Date().toISOString(),
    });
    if (audit.scope?.reportPeriodId) {
      await store.updateReportPeriod(audit.scope.reportPeriodId, {
        status: "failed",
        auditId,
      });
    }
    if (auditJob) {
      await store.updateJob(auditJob.id, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown audit error",
        completedAt: new Date().toISOString(),
      });
    }
    await logEvent({
      auditId,
      level: "error",
      code: "audit.failed",
      message: error instanceof Error ? error.message : "Unknown audit error",
    });
    throw error;
  }
}

export async function getAuditDetail(auditId: string) {
  const store = await getStore();
  const [audit, report, events] = await Promise.all([
    store.getAudit(auditId),
    store.getReport(auditId),
    store.listAuditEvents(auditId),
  ]);
  return { audit, report, events };
}

export async function getAuditLocations(auditId: string) {
  const { report } = await getAuditDetail(auditId);
  return report?.snapshot.locations ?? [];
}

export async function createAuditForClient(clientId: string, scope?: AuditScope) {
  const store = await getStore();
  const client = await store.getClient(clientId);
  if (!client) {
    throw new Error("Client not found.");
  }
  const allIntegrations = await store.listIntegrationsByClient(clientId);
  const requestedIntegrations =
    scope?.integrationIds?.length
      ? allIntegrations.filter((integration) => scope.integrationIds?.includes(integration.id))
      : allIntegrations;
  if (requestedIntegrations.length === 0) {
    throw new Error("Create at least one integration before running an audit.");
  }
  const executionStates = await Promise.all(
    requestedIntegrations.map((integration) => getIntegrationExecutionState(client, integration)),
  );
  const eligibleIntegrations = executionStates.filter((state) => state.readyForLiveData);
  const excludedIntegrations = executionStates
    .filter((state) => !state.readyForLiveData)
    .map((state) => ({
      id: state.integration.id,
      label: state.integration.displayName,
      platformKey: state.integration.platformKey,
      reason: state.validationMessage,
    }));
  if (eligibleIntegrations.length === 0) {
    throw new AuditPreflightError(
      "Connect at least one real integration before running a client-facing audit.",
      "connection_required",
      409,
    );
  }
  const audit = await store.createAudit({
    clientId,
    integrationIds: eligibleIntegrations.map((state) => state.integration.id),
    scope: {
      ...(scope ?? {}),
      excludedIntegrations,
    },
  });
  await store.createJob({
    kind: "audit_run",
    payload: {
      accountId: client.accountId,
      auditId: audit.id,
      clientId,
    },
  });
  await logEvent({
    auditId: audit.id,
    code: "audit.queued",
    message: `Audit ${audit.id} queued.`,
    detail: {
      includedIntegrations: eligibleIntegrations.map((state) => state.integration.id),
      excludedIntegrations: excludedIntegrations.map((item) => item.id),
    },
  });
  await enqueueAudit(audit.id);
  return (await store.getAudit(audit.id)) ?? audit;
}

export async function enqueueAudit(auditId: string) {
  const databaseUrl = getPgBossDatabaseUrl();
  if (databaseUrl) {
    const boss = new PgBoss(databaseUrl);
    await boss.start();
    await boss.createQueue(AUDIT_QUEUE_NAME).catch(() => undefined);
    await boss.send(AUDIT_QUEUE_NAME, { auditId });
    await boss.stop();
    return;
  }
  await runAudit(auditId);
}

export async function startAuditWorker() {
  const databaseUrl = getPgBossDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the pg-boss worker.");
  }
  const boss = new PgBoss(databaseUrl);
  await boss.start();
  await boss.createQueue(AUDIT_QUEUE_NAME).catch(() => undefined);
  await boss.work<{ auditId: string }>(AUDIT_QUEUE_NAME, async (jobs) => {
    for (const job of jobs) {
      await runAudit(job.data.auditId);
    }
    return { ok: true };
  });
  return boss;
}

export async function createClientRecord(
  accountId: string,
  input: Pick<
    ClientRecord,
    | "name"
    | "industry"
    | "industryLabelPt"
    | "operatingModel"
    | "primaryDomain"
    | "reportLanguage"
    | "reportFocus"
    | "reportIntro"
    | "reportBenchmarks"
    | "referenceReportNotes"
  >,
) {
  const store = await getStore();
  return store.createClient(accountId, input);
}

export async function listReportMemoriesForAccount(accountId?: string) {
  const store = await getStore();
  return store.listReportMemories(accountId);
}

export async function createReportMemoryRecord(
  accountId: string,
  input: Pick<
    ReportMemoryRecord,
    "title" | "sourceClientName" | "periodLabel" | "notes" | "content"
  >,
) {
  const store = await getStore();
  return store.createReportMemory(accountId, input);
}

export async function deleteReportMemoryRecord(id: string) {
  const store = await getStore();
  return store.deleteReportMemory(id);
}

export async function listReportMemoriesForClient(clientId: string) {
  const store = await getStore();
  return store.listReportMemoriesByClient(clientId);
}

export async function attachReportMemoryRecordToClient(
  clientId: string,
  reportMemoryId: string,
) {
  const store = await getStore();
  return store.attachReportMemoryToClient(clientId, reportMemoryId);
}

export async function detachReportMemoryRecordFromClient(
  clientId: string,
  reportMemoryId: string,
) {
  const store = await getStore();
  return store.detachReportMemoryFromClient(clientId, reportMemoryId);
}

export async function listReportFeedbackForAudit(auditId: string) {
  const store = await getStore();
  return store.listReportFeedbackByAudit(auditId);
}

export async function createReportFeedbackRecord(
  auditId: string,
  input: Pick<ReportFeedbackRecord, "rating" | "notes">,
) {
  const store = await getStore();
  return store.createReportFeedback(auditId, input);
}

export async function updateClientRecord(
  clientId: string,
  input: Partial<
    Pick<
      ClientRecord,
      | "name"
      | "industry"
      | "industryLabelPt"
      | "operatingModel"
      | "primaryDomain"
      | "reportLanguage"
      | "reportFocus"
      | "reportIntro"
      | "reportBenchmarks"
      | "referenceReportNotes"
      | "monthlyReportEnabled"
      | "monthlyReportDay"
      | "monthlyReportAutoGenerate"
    >
  >,
) {
  const store = await getStore();
  return store.updateClient(clientId, input);
}

export async function deleteClientRecord(clientId: string) {
  const store = await getStore();
  return store.deleteClient(clientId);
}

export async function listReportPeriodsForClient(clientId: string) {
  const store = await getStore();
  const reportPeriods = await store.listReportPeriodsByClient(clientId);
  return Promise.all(
    reportPeriods.map(async (reportPeriod) => {
      const [contextEntries, baselinePeriod] = await Promise.all([
        store.listContextEntriesByReportPeriod(reportPeriod.id),
        reportPeriod.baselinePeriodId ? store.getReportPeriod(reportPeriod.baselinePeriodId) : Promise.resolve(null),
      ]);
      return {
        ...reportPeriod,
        baselinePeriodKey: baselinePeriod?.periodKey ?? null,
        contextEntries,
      };
    }),
  );
}

export async function getReportPeriodDetail(reportPeriodId: string) {
  const store = await getStore();
  const reportPeriod = await store.getReportPeriod(reportPeriodId);
  if (!reportPeriod) {
    return {
      reportPeriod: null,
      contextEntries: [],
      report: null,
      baselinePeriod: null,
    };
  }
  const [contextEntries, report, baselinePeriod] = await Promise.all([
    store.listContextEntriesByReportPeriod(reportPeriodId),
    reportPeriod.auditId ? store.getReport(reportPeriod.auditId) : Promise.resolve(null),
    reportPeriod.baselinePeriodId ? store.getReportPeriod(reportPeriod.baselinePeriodId) : Promise.resolve(null),
  ]);
  return {
    reportPeriod,
    contextEntries,
    report,
    baselinePeriod,
  };
}

export async function createReportPeriodRecord(
  clientId: string,
  input: {
    periodKey: string;
    periodStart: string;
    periodEnd: string;
    baselinePeriodId?: string | null;
  },
) {
  const store = await getStore();
  return store.createReportPeriod(clientId, {
    periodKey: input.periodKey,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    baselinePeriodId: input.baselinePeriodId ?? null,
    manualInputs: emptyReportPeriodManualInputs(),
  });
}

export async function ensureReportPeriodForMonth(clientId: string, periodKey: string) {
  const store = await getStore();
  const existing = (await store.listReportPeriodsByClient(clientId)).find(
    (reportPeriod) => reportPeriod.periodKey === periodKey,
  );
  if (existing) {
    return existing;
  }

  const range = deriveMonthRange(periodKey);
  return createReportPeriodRecord(clientId, {
    periodKey,
    periodStart: range.start,
    periodEnd: range.end,
    baselinePeriodId: null,
  });
}

export async function updateReportPeriodRecord(
  reportPeriodId: string,
  input: Partial<{
    baselinePeriodId: string | null;
    status: ReportPeriodRecord["status"];
    auditId: string | null;
    generatedAt: string | null;
    manualInputs: ReportPeriodRecord["manualInputs"];
  }>,
) {
  const store = await getStore();
  return store.updateReportPeriod(reportPeriodId, input);
}

export async function addContextEntryRecord(
  reportPeriodId: string,
  input: Pick<
    ContextEntryRecord,
    | "channel"
    | "source"
    | "campaignReference"
    | "entryType"
    | "text"
    | "tags"
    | "effectiveStartDate"
    | "effectiveEndDate"
  >,
  author: Pick<AuthSession, "name" | "email">,
) {
  const store = await getStore();
  return store.createContextEntry(reportPeriodId, {
    ...input,
    authorName: author.name,
    authorEmail: author.email,
  });
}

export async function deleteContextEntryRecord(id: string) {
  const store = await getStore();
  return store.deleteContextEntry(id);
}

export async function generateReportPeriod(reportPeriodId: string, visitedPeriodIds = new Set<string>()) {
  const store = await getStore();
  const reportPeriod = await store.getReportPeriod(reportPeriodId);
  if (!reportPeriod) {
    throw new Error("Report period not found.");
  }
  if (visitedPeriodIds.has(reportPeriodId)) {
    throw new Error("Circular comparison month chain detected.");
  }
  visitedPeriodIds.add(reportPeriodId);
  await store.updateReportPeriod(reportPeriodId, {
    status: "queued",
  });
  try {
    if (reportPeriod.baselinePeriodId) {
      const baselinePeriod = await store.getReportPeriod(reportPeriod.baselinePeriodId);
      const baselineReport = baselinePeriod?.auditId
        ? await store.getReport(baselinePeriod.auditId)
        : null;
      if (baselinePeriod && !baselineReport && baselinePeriod.status !== "running") {
        await generateReportPeriod(baselinePeriod.id, visitedPeriodIds);
      }
    }
    const audit = await createAuditForClient(reportPeriod.clientId, {
      reportPeriodId: reportPeriod.id,
      baselinePeriodId: reportPeriod.baselinePeriodId ?? undefined,
      periodKey: reportPeriod.periodKey,
      periodStart: reportPeriod.periodStart,
      periodEnd: reportPeriod.periodEnd,
    });
    await store.updateReportPeriod(reportPeriodId, {
      status: audit.status === "completed" ? "completed" : audit.status === "failed" ? "failed" : audit.status,
      auditId: audit.id,
      generatedAt: audit.completedAt,
    });
    return {
      audit,
      reportPeriod: (await store.getReportPeriod(reportPeriodId)) ?? reportPeriod,
    };
  } catch (error) {
    await store.updateReportPeriod(reportPeriodId, {
      status: "failed",
      auditId: null,
      generatedAt: null,
    });
    throw error;
  }
}

export async function runMonthlyReportScheduler(
  viewer: Pick<AuthSession, "role" | "accountId">,
  now = new Date(),
) {
  const store = await getStore();
  const clients = await store.listClients();
  const visibleClients =
    viewer.role === "platform_admin"
      ? clients
      : clients.filter((client) => client.accountId === viewer.accountId);
  const actions: Array<{
    clientId: string;
    clientName: string;
    periodKey: string | null;
    status:
      | "disabled"
      | "missing_day"
      | "not_due"
      | "draft_created"
      | "baseline_linked"
      | "already_prepared"
      | "generated"
      | "failed";
    reportPeriodId?: string;
    reason?: string;
  }> = [];
  let scheduleJobsCreated = 0;
  let reportPeriodsCreated = 0;
  let reportsGenerated = 0;
  let baselinesLinked = 0;

  for (const client of visibleClients) {
    if (!client.monthlyReportEnabled) {
      actions.push({
        clientId: client.id,
        clientName: client.name,
        periodKey: null,
        status: "disabled",
      });
      continue;
    }

    if (client.monthlyReportDay == null) {
      actions.push({
        clientId: client.id,
        clientName: client.name,
        periodKey: null,
        status: "missing_day",
      });
      continue;
    }

    const scheduledPeriod = resolveScheduledMonthlyPeriod(now, client.monthlyReportDay);
    if (!scheduledPeriod) {
      actions.push({
        clientId: client.id,
        clientName: client.name,
        periodKey: null,
        status: "not_due",
      });
      continue;
    }

    const scheduleJob = await store.createJob({
      kind: "report_schedule",
      payload: {
        accountId: client.accountId,
        clientId: client.id,
        periodKey: scheduledPeriod.periodKey,
      },
    });
    scheduleJobsCreated += 1;
    await store.updateJob(scheduleJob.id, {
      status: "running",
      startedAt: new Date().toISOString(),
    });

    try {
      const reportPeriods = await store.listReportPeriodsByClient(client.id);
      const baselinePeriod = scheduledPeriod.baselinePeriodKey
        ? reportPeriods.find((reportPeriod) => reportPeriod.periodKey === scheduledPeriod.baselinePeriodKey) ?? null
        : null;
      const existingPeriod =
        reportPeriods.find((reportPeriod) => reportPeriod.periodKey === scheduledPeriod.periodKey) ?? null;
      let reportPeriod = existingPeriod;
      let created = false;
      let baselineLinked = false;

      if (!reportPeriod) {
        reportPeriod = await store.createReportPeriod(client.id, {
          periodKey: scheduledPeriod.periodKey,
          periodStart: scheduledPeriod.periodStart,
          periodEnd: scheduledPeriod.periodEnd,
          baselinePeriodId: baselinePeriod?.id ?? null,
          manualInputs: emptyReportPeriodManualInputs(),
        });
        reportPeriodsCreated += 1;
        created = true;
      } else if (!reportPeriod.baselinePeriodId && baselinePeriod) {
        reportPeriod =
          (await store.updateReportPeriod(reportPeriod.id, {
            baselinePeriodId: baselinePeriod.id,
          })) ?? reportPeriod;
        baselinesLinked += 1;
        baselineLinked = true;
      }

      let generated = false;
      if (client.monthlyReportAutoGenerate && reportPeriod.status === "draft") {
        await generateReportPeriod(reportPeriod.id);
        reportsGenerated += 1;
        generated = true;
        reportPeriod = (await store.getReportPeriod(reportPeriod.id)) ?? reportPeriod;
      }

      await store.updateJob(scheduleJob.id, {
        status: "completed",
        result: {
          periodKey: scheduledPeriod.periodKey,
          reportPeriodId: reportPeriod.id,
          created,
          baselineLinked,
          generated,
          finalStatus: reportPeriod.status,
        },
        completedAt: new Date().toISOString(),
      });
      actions.push({
        clientId: client.id,
        clientName: client.name,
        periodKey: scheduledPeriod.periodKey,
        reportPeriodId: reportPeriod.id,
        status: generated
          ? "generated"
          : created
            ? "draft_created"
            : baselineLinked
              ? "baseline_linked"
              : "already_prepared",
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Monthly report scheduler failed.";
      await store.updateJob(scheduleJob.id, {
        status: "failed",
        errorMessage: reason,
        completedAt: new Date().toISOString(),
      });
      actions.push({
        clientId: client.id,
        clientName: client.name,
        periodKey: scheduledPeriod.periodKey,
        status: "failed",
        reason,
      });
    }
  }

  return {
    runAt: now.toISOString(),
    visibleClients: visibleClients.length,
    scheduleJobsCreated,
    reportPeriodsCreated,
    reportsGenerated,
    baselinesLinked,
    actions,
  };
}

export async function createIntegrationRecord(
  clientId: string,
  integration: Pick<
    IntegrationRecord,
    "platformKey" | "platformType" | "displayName" | "credentials" | "settings"
  >,
) {
  const store = await getStore();
  const existing = (await store.listIntegrationsByClient(clientId)).find(
    (item) => item.platformKey === integration.platformKey,
  );
  if (existing) {
    throw new Error(
      `Client already has a ${integration.platformKey} integration. Update the existing connection instead of creating a duplicate.`,
    );
  }
  return createIntegrationWithVault(clientId, integration);
}

export async function updateIntegrationRecord(
  integrationId: string,
  patch: Partial<Pick<IntegrationRecord, "displayName" | "credentials" | "settings">>,
) {
  return updateIntegrationWithVault(integrationId, patch);
}

export async function deleteIntegrationRecord(integrationId: string) {
  return deleteIntegrationWithVault(integrationId);
}

export async function syncLocationsForClient(clientId: string) {
  const store = await getStore();
  const client = await store.getClient(clientId);
  if (!client) throw new Error("Client not found.");
  const integrations = await store.listIntegrationsByClient(clientId);
  const eligibleIntegrations = (
    await Promise.all(
      integrations.map((integration) => getIntegrationExecutionState(client, integration)),
    )
  )
    .filter((state) => state.readyForLiveData)
    .map((state) => state.integration);
  if (eligibleIntegrations.length === 0) {
    return store.listLocationsByClient(clientId);
  }
  const syncJob = await store.createJob({
    kind: "location_sync",
    payload: { accountId: client.accountId, clientId },
  });
  await store.updateJob(syncJob.id, {
    status: "running",
    startedAt: new Date().toISOString(),
  });
  try {
    const snapshots = await Promise.all(
      eligibleIntegrations.map(async (integration) => {
        const executableIntegration = await prepareIntegrationForExecution(integration);
        const connector = getConnector(executableIntegration.platformKey);
        return connector.fetchSnapshot({
          client,
          integration: executableIntegration,
          requestedCapabilities: connector.capabilities(),
        });
      }),
    );
    const merged = mergeSnapshots(client, snapshots);
    const locations: Omit<LocationRecord, "createdAt" | "updatedAt">[] = merged.locations.map(
      (location) => ({
        id: location.locationId,
        accountId: client.accountId,
        clientId,
        integrationId:
          eligibleIntegrations.find((integration) => integration.platformKey === "google_business_profile")?.id ??
          eligibleIntegrations[0]?.id ??
          null,
        label: location.label,
        businessProfileId: location.businessProfileId,
        landingPageUrl: location.landingPageUrl,
        metrics: location.metrics,
        findings: location.findings,
      }),
    );
    const syncedLocations = await store.upsertLocations(clientId, locations);
    await store.updateJob(syncJob.id, {
      status: "completed",
      result: { locationCount: syncedLocations.length },
      completedAt: new Date().toISOString(),
    });
    return syncedLocations;
  } catch (error) {
    await store.updateJob(syncJob.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Location sync failed",
      completedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function listLocationsForClient(clientId: string) {
  const store = await getStore();
  return store.listLocationsByClient(clientId);
}

export async function beginGoogleOAuth(
  clientId: string,
  platformKey: PlatformKey,
  requestOrigin?: string,
) {
  return buildGoogleOAuthUrl(clientId, platformKey, requestOrigin);
}

export async function beginMicrosoftOAuth(
  clientId: string,
  platformKey: PlatformKey,
  requestOrigin?: string,
) {
  return buildMicrosoftOAuthUrl(clientId, platformKey, requestOrigin);
}

async function upsertOAuthIntegration(
  clientId: string,
  platformKey: PlatformKey,
  credentials: IntegrationRecord["credentials"],
) {
  const store = await getStore();
  const existing = (await store.listIntegrationsByClient(clientId)).find(
    (integration) => integration.platformKey === platformKey,
  );

  if (existing) {
    const updated = await updateIntegrationRecord(existing.id, {
      credentials: {
        ...existing.credentials,
        ...credentials,
        authOrigin: "oauth",
      },
      settings: {
        ...existing.settings,
        demoMode: false,
      },
    });

    if (!updated) {
      throw new Error(`Unable to update OAuth integration for ${platformKey}.`);
    }

    return updated;
  }

  return createIntegrationRecord(clientId, {
    platformKey,
    platformType: getConnector(platformKey).platformType(),
    displayName:
      platformCatalog.find((platform) => platform.key === platformKey)?.name ??
      platformKey,
    credentials: {
      ...credentials,
      authOrigin: "oauth",
    },
    settings: {
      demoMode: false,
    },
  });
}

export async function finishGoogleOAuth(url: URL) {
  const callback = await consumeGoogleOAuthCallback(url);
  const scopes = getGoogleScopes(callback.platformKey);

  if (!callback.credentials) {
    await logEvent({
      code: "oauth.config_required",
      message: "Authorization code missing or Google OAuth was not fully configured.",
      detail: { clientId: callback.clientId, platformKey: callback.platformKey },
    });
    return {
      status: "config_required",
      clientId: callback.clientId,
      platformKey: callback.platformKey,
      scopes,
      message: "Authorization code missing or Google OAuth was not fully configured.",
    };
  }

  const integration = await upsertOAuthIntegration(callback.clientId, callback.platformKey, {
    ...callback.credentials,
    scopes,
    authOrigin: "oauth",
  });

  await logEvent({
    code: "oauth.connected",
    message: `OAuth connected for ${callback.platformKey}.`,
    detail: { clientId: callback.clientId, integrationId: integration.id },
  });

  return {
    status: "connected",
    clientId: callback.clientId,
    platformKey: callback.platformKey,
    integration,
  };
}

export async function finishMicrosoftOAuth(url: URL) {
  const callback = await consumeMicrosoftOAuthCallback(url);
  const scopes = getMicrosoftScopes(callback.platformKey);

  if (!callback.credentials) {
    await logEvent({
      code: "oauth.config_required",
      message: "Authorization code missing or Microsoft OAuth was not fully configured.",
      detail: { clientId: callback.clientId, platformKey: callback.platformKey },
    });
    return {
      status: "config_required",
      clientId: callback.clientId,
      platformKey: callback.platformKey,
      scopes,
      message: "Authorization code missing or Microsoft OAuth was not fully configured.",
    };
  }

  const integration = await upsertOAuthIntegration(callback.clientId, callback.platformKey, {
    ...callback.credentials,
    scopes,
    authOrigin: "oauth",
  });

  await logEvent({
    code: "oauth.connected",
    message: `OAuth connected for ${callback.platformKey}.`,
    detail: { clientId: callback.clientId, integrationId: integration.id },
  });

  return {
    status: "connected",
    clientId: callback.clientId,
    platformKey: callback.platformKey,
    integration,
  };
}
