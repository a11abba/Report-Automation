import { PgBoss } from "pg-boss";
import {
  type AuditScope,
  type ClientRecord,
  type ConnectorMetadataResult,
  type ConnectorValidationResult,
  type IntegrationConnectionStatus,
  type IntegrationRecord,
  type LocationRecord,
  type PlatformKey,
} from "@/lib/audit/types";
import { getConnector, mergeSnapshots, platformCatalog } from "@/lib/connectors";
import {
  buildGoogleOAuthUrl,
  consumeGoogleOAuthCallback,
  getGoogleScopes,
  refreshGoogleAccessToken,
} from "@/lib/google-auth";
import { buildReport, evaluateRules, rulePackCatalog } from "@/lib/rules";
import { getPdfRendererStatus } from "@/lib/reports";
import { getStore } from "@/lib/storage";
import {
  createIntegrationWithVault,
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

function isGoogleOAuthIntegration(integration: IntegrationRecord) {
  return (
    integration.credentials.authOrigin === "oauth" &&
    (integration.platformKey === "google_search_console" ||
      integration.platformKey === "google_business_profile" ||
      integration.platformKey === "google_analytics")
  );
}

async function prepareIntegrationForExecution(integration: IntegrationRecord) {
  const hydrated = await hydrateIntegrationForExecution(integration);
  if (!isGoogleOAuthIntegration(hydrated)) {
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

  const refreshed = await refreshGoogleAccessToken(
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

export async function listDashboardData() {
  const store = await getStore();
  const [clients, audits] = await Promise.all([store.listClients(), store.listAudits()]);
  const clientsWithRelations = await Promise.all(
    clients.map(async (client) => {
      const integrations = await store.listIntegrationsByClient(client.id);
      const integrationStates = await Promise.all(
        integrations.map(async (integration) => {
          const state = await getIntegrationExecutionState(client, integration);
          return {
            ...integration,
            connectionStatus: state.connectionStatus,
            validationMessage: state.validationMessage,
            connectionDetails: state.validation,
            healthCheck: state.healthCheck,
            metadata: state.metadata,
          };
        }),
      );
      return {
        ...client,
        integrations: integrationStates,
        locations: await store.listLocationsByClient(client.id),
        audits: audits.filter((audit) => audit.clientId === client.id).slice(0, 5),
      };
    }),
  );
  return {
    platforms: platformCatalog,
    rulePacks: rulePackCatalog,
    clients: clientsWithRelations,
    recentAudits: audits.slice(0, 10),
    pdfRenderer: getPdfRendererStatus(),
  };
}

export async function runAudit(auditId: string) {
  const store = await getStore();
  const audit = await store.getAudit(auditId);
  if (!audit) throw new Error(`Audit ${auditId} not found.`);
  const client = await store.getClient(audit.clientId);
  if (!client) throw new Error(`Client ${audit.clientId} not found.`);

  const allIntegrations = await store.listIntegrationsByClient(client.id);
  const integrations = allIntegrations.filter((integration) =>
    audit.integrationIds.includes(integration.id),
  );
  if (integrations.length === 0) throw new Error(`Audit ${auditId} has no integrations attached.`);

  const auditJob = (await store.listJobs({ kind: "audit_run" })).find(
    (job) => job.payload["auditId"] === auditId,
  );
  await store.updateAudit(auditId, { status: "running", errorMessage: null });
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
    const snapshots = await Promise.all(
      integrations.map(async (integration) => {
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
    const report = buildReport(auditId, client, merged, findings, {
      includedIntegrations: integrations.map((integration) => ({
        id: integration.id,
        label: integration.displayName,
        platformKey: integration.platformKey,
      })),
      excludedIntegrations: audit.scope?.excludedIntegrations ?? [],
    });
    await store.saveReport(auditId, report);
    await store.updateAudit(auditId, {
      status: "completed",
      score: report.score,
      grade: report.grade,
      completedAt: new Date().toISOString(),
      errorMessage: null,
    });
    if (auditJob) {
      await store.updateJob(auditJob.id, {
        status: "completed",
        result: { score: report.score, grade: report.grade },
        completedAt: new Date().toISOString(),
      });
    }
    await logEvent({
      auditId,
      code: "audit.completed",
      message: `Audit ${auditId} completed.`,
      detail: { score: report.score, grade: report.grade },
    });
    return report;
  } catch (error) {
    await store.updateAudit(auditId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown audit error",
      completedAt: new Date().toISOString(),
    });
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
  input: Pick<
    ClientRecord,
    "name" | "industry" | "industryLabelPt" | "operatingModel" | "primaryDomain" | "reportLanguage"
  >,
) {
  const store = await getStore();
  return store.createClient(input);
}

export async function updateClientRecord(
  clientId: string,
  input: Partial<
    Pick<ClientRecord, "name" | "industry" | "industryLabelPt" | "operatingModel" | "primaryDomain" | "reportLanguage">
  >,
) {
  const store = await getStore();
  return store.updateClient(clientId, input);
}

export async function deleteClientRecord(clientId: string) {
  const store = await getStore();
  return store.deleteClient(clientId);
}

export async function createIntegrationRecord(
  clientId: string,
  integration: Pick<
    IntegrationRecord,
    "platformKey" | "platformType" | "displayName" | "credentials" | "settings"
  >,
) {
  return createIntegrationWithVault(clientId, integration);
}

export async function updateIntegrationRecord(
  integrationId: string,
  patch: Partial<Pick<IntegrationRecord, "displayName" | "credentials" | "settings">>,
) {
  return updateIntegrationWithVault(integrationId, patch);
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
    payload: { clientId },
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

export async function beginGoogleOAuth(clientId: string, platformKey: PlatformKey) {
  return buildGoogleOAuthUrl(clientId, platformKey);
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

  const integration = await createIntegrationRecord(callback.clientId, {
    platformKey: callback.platformKey,
    platformType: getConnector(callback.platformKey).platformType(),
    displayName:
      platformCatalog.find((platform) => platform.key === callback.platformKey)?.name ??
      callback.platformKey,
    credentials: {
      ...callback.credentials,
      authOrigin: "oauth",
      scopes,
    },
    settings: {
      demoMode: false,
    },
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
