import { NextResponse } from "next/server";
import { canAccessAuditRecord, canAccessIntegrationRecord, canManageClientRecord } from "@/lib/auth-access";
import { getAuthSession } from "@/lib/auth-session-server";
import { getStore } from "@/lib/storage";

export async function requireRouteViewer() {
  const viewer = await getAuthSession();
  if (!viewer) {
    return {
      viewer: null,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
  return { viewer, response: null };
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

export async function loadClientForViewer(viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>, clientId: string) {
  const store = await getStore();
  const client = await store.getClient(clientId);
  if (!client) {
    return { client: null, response: NextResponse.json({ error: "Client not found." }, { status: 404 }) };
  }
  if (!canManageClientRecord(viewer, client)) {
    return { client: null, response: forbiddenResponse() };
  }
  return { client, response: null };
}

export async function loadAuditForViewer(viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>, auditId: string) {
  const store = await getStore();
  const audit = await store.getAudit(auditId);
  if (!audit) {
    return { audit: null, response: NextResponse.json({ error: "Audit not found." }, { status: 404 }) };
  }
  if (!canAccessAuditRecord(viewer, audit)) {
    return { audit: null, response: forbiddenResponse() };
  }
  return { audit, response: null };
}

export async function loadIntegrationForViewer(
  viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>,
  integrationId: string,
) {
  const store = await getStore();
  const integration = await store.getIntegration(integrationId);
  if (!integration) {
    return {
      integration: null,
      response: NextResponse.json({ error: "Integration not found." }, { status: 404 }),
    };
  }
  if (!canAccessIntegrationRecord(viewer, integration)) {
    return { integration: null, response: forbiddenResponse() };
  }
  return { integration, response: null };
}

export async function loadReportPeriodForViewer(
  viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>,
  reportPeriodId: string,
) {
  const store = await getStore();
  const reportPeriod = await store.getReportPeriod(reportPeriodId);
  if (!reportPeriod) {
    return {
      reportPeriod: null,
      response: NextResponse.json({ error: "Report period not found." }, { status: 404 }),
    };
  }
  const client = await store.getClient(reportPeriod.clientId);
  if (!client) {
    return {
      reportPeriod: null,
      response: NextResponse.json({ error: "Client not found." }, { status: 404 }),
    };
  }
  if (!canManageClientRecord(viewer, client)) {
    return { reportPeriod: null, response: forbiddenResponse() };
  }
  return { reportPeriod, client, response: null };
}

export async function loadContextEntryForViewer(
  viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>,
  contextEntryId: string,
) {
  const store = await getStore();
  const contextEntry = await store.getContextEntry(contextEntryId);
  if (!contextEntry) {
    return {
      contextEntry: null,
      response: NextResponse.json({ error: "Context entry not found." }, { status: 404 }),
    };
  }
  const client = await store.getClient(contextEntry.clientId);
  if (!client) {
    return {
      contextEntry: null,
      response: NextResponse.json({ error: "Client not found." }, { status: 404 }),
    };
  }
  if (!canManageClientRecord(viewer, client)) {
    return { contextEntry: null, response: forbiddenResponse() };
  }
  return { contextEntry, client, response: null };
}
