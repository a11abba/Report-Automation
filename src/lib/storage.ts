import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type AuditEventRecord,
  type AuditRecord,
  type AuditReportPayload,
  type ClientRecord,
  type IntegrationRecord,
  type JobKind,
  type JobRecord,
  type JobStatus,
  type LocationRecord,
  type OAuthSessionRecord,
} from "@/lib/audit/types";

interface LegacyStoreShape {
  clients: ClientRecord[];
  integrations: IntegrationRecord[];
  locations: LocationRecord[];
  audits: AuditRecord[];
  reports: Record<string, AuditReportPayload>;
}

function hydrateReport(report: AuditReportPayload): AuditReportPayload {
  return {
    ...report,
    locale: report.locale ?? "pt-BR",
    clientIndustryLabel: report.clientIndustryLabel ?? report.snapshot.accountProfile.industry,
    execution: report.execution ?? {
      includedIntegrations: [],
      excludedIntegrations: [],
    },
    findings: (report.findings ?? []).map((finding) => ({
      ...finding,
      severityLabel: finding.severityLabel ?? String(finding.severity ?? ""),
      statusLabel: finding.statusLabel ?? String(finding.status ?? ""),
      params: finding.params ?? {},
      sectionKey: finding.sectionKey ?? "search_visibility",
    })),
  };
}

export interface AppStore {
  listClients(): Promise<ClientRecord[]>;
  getClient(id: string): Promise<ClientRecord | null>;
  createClient(
    input: Pick<
      ClientRecord,
      "name" | "industry" | "industryLabelPt" | "operatingModel" | "primaryDomain" | "reportLanguage"
    >,
  ): Promise<ClientRecord>;
  updateClient(
    id: string,
    patch: Partial<
      Pick<
        ClientRecord,
        "name" | "industry" | "industryLabelPt" | "operatingModel" | "primaryDomain" | "reportLanguage"
      >
    >,
  ): Promise<ClientRecord | null>;
  listIntegrationsByClient(clientId: string): Promise<IntegrationRecord[]>;
  getIntegration(id: string): Promise<IntegrationRecord | null>;
  createIntegration(
    clientId: string,
    input: Pick<
      IntegrationRecord,
      "platformKey" | "platformType" | "displayName" | "credentials" | "settings"
    >,
  ): Promise<IntegrationRecord>;
  updateIntegration(
    id: string,
    patch: Partial<Pick<IntegrationRecord, "displayName" | "credentials" | "settings">>,
  ): Promise<IntegrationRecord | null>;
  listLocationsByClient(clientId: string): Promise<LocationRecord[]>;
  upsertLocations(
    clientId: string,
    locations: Omit<LocationRecord, "createdAt" | "updatedAt">[],
  ): Promise<LocationRecord[]>;
  listAudits(): Promise<AuditRecord[]>;
  listAuditsByClient(clientId: string): Promise<AuditRecord[]>;
  getAudit(id: string): Promise<AuditRecord | null>;
  createAudit(input: Pick<AuditRecord, "clientId" | "integrationIds" | "scope">): Promise<AuditRecord>;
  updateAudit(id: string, patch: Partial<AuditRecord>): Promise<AuditRecord | null>;
  saveReport(auditId: string, report: AuditReportPayload): Promise<void>;
  getReport(auditId: string): Promise<AuditReportPayload | null>;
  createOAuthSession(input: Omit<OAuthSessionRecord, "createdAt">): Promise<OAuthSessionRecord>;
  getOAuthSession(id: string): Promise<OAuthSessionRecord | null>;
  deleteOAuthSession(id: string): Promise<void>;
  appendAuditEvent(input: Omit<AuditEventRecord, "id" | "createdAt">): Promise<AuditEventRecord>;
  listAuditEvents(auditId: string): Promise<AuditEventRecord[]>;
  createJob(input: { kind: JobKind; payload: Record<string, unknown> }): Promise<JobRecord>;
  updateJob(
    id: string,
    patch: Partial<Pick<JobRecord, "status" | "result" | "errorMessage" | "startedAt" | "completedAt">>,
  ): Promise<JobRecord | null>;
  listJobs(filter?: { kind?: JobKind; status?: JobStatus }): Promise<JobRecord[]>;
}

const dataDir = path.join(process.cwd(), "data");
const sqliteFile = path.join(dataDir, "app.db");
const legacyJsonFile = path.join(dataDir, "app-db.json");

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function legacyStoreExists() {
  try {
    await access(legacyJsonFile);
    return true;
  } catch {
    return false;
  }
}

async function readLegacyStore(): Promise<LegacyStoreShape | null> {
  if (!(await legacyStoreExists())) {
    return null;
  }
  const raw = await readFile(legacyJsonFile, "utf-8");
  const parsed = JSON.parse(raw) as Partial<LegacyStoreShape>;
  return {
    clients: parsed.clients ?? [],
    integrations: parsed.integrations ?? [],
    locations: parsed.locations ?? [],
    audits: parsed.audits ?? [],
    reports: Object.fromEntries(
      Object.entries(parsed.reports ?? {}).map(([auditId, report]) => [auditId, hydrateReport(report)]),
    ),
  };
}

class SQLiteStore implements AppStore {
  private db: DatabaseSync;
  private migrated = false;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.ensureSchema();
  }

  private ensureSchema() {
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists clients (
        id text primary key,
        name text not null,
        industry text not null,
        industry_label_pt text,
        operating_model text not null,
        primary_domain text,
        report_language text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists integrations (
        id text primary key,
        client_id text not null,
        platform_key text not null,
        platform_type text not null,
        display_name text not null,
        credentials text not null,
        settings text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists locations (
        id text primary key,
        client_id text not null,
        integration_id text,
        label text not null,
        business_profile_id text,
        landing_page_url text,
        metrics text not null,
        findings text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists audits (
        id text primary key,
        client_id text not null,
        integration_ids text not null,
        scope text,
        status text not null,
        score integer,
        grade text,
        created_at text not null,
        updated_at text not null,
        completed_at text,
        error_message text
      );
      create table if not exists audit_reports (
        audit_id text primary key,
        payload text not null
      );
      create table if not exists oauth_sessions (
        id text primary key,
        client_id text not null,
        platform_key text not null,
        code_verifier text not null,
        redirect_uri text not null,
        scopes text not null,
        created_at text not null,
        expires_at text not null
      );
      create table if not exists audit_events (
        id text primary key,
        audit_id text,
        level text not null,
        code text not null,
        message text not null,
        detail text,
        created_at text not null
      );
      create table if not exists jobs (
        id text primary key,
        kind text not null,
        status text not null,
        payload text not null,
        result text,
        error_message text,
        created_at text not null,
        updated_at text not null,
        started_at text,
        completed_at text
      );
    `);
  }

  private async ensureMigrated() {
    if (this.migrated) {
      return;
    }
    const row = this.db.prepare("select count(*) as count from clients").get<{ count: number }>();
    if ((row?.count ?? 0) > 0) {
      this.migrated = true;
      return;
    }

    const legacy = await readLegacyStore();
    if (!legacy) {
      this.migrated = true;
      return;
    }

    const insertClient = this.db.prepare(`
      insert or ignore into clients (id, name, industry, industry_label_pt, operating_model, primary_domain, report_language, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertIntegration = this.db.prepare(`
      insert or ignore into integrations (id, client_id, platform_key, platform_type, display_name, credentials, settings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLocation = this.db.prepare(`
      insert or ignore into locations (id, client_id, integration_id, label, business_profile_id, landing_page_url, metrics, findings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAudit = this.db.prepare(`
      insert or ignore into audits (id, client_id, integration_ids, scope, status, score, grade, created_at, updated_at, completed_at, error_message)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertReport = this.db.prepare(`
      insert or ignore into audit_reports (audit_id, payload) values (?, ?)
    `);

    for (const client of legacy.clients) {
      insertClient.run(
        client.id,
        client.name,
        client.industry,
        client.industryLabelPt,
        client.operatingModel,
        client.primaryDomain,
        client.reportLanguage ?? "pt-BR",
        client.createdAt,
        client.updatedAt,
      );
    }
    for (const integration of legacy.integrations) {
      insertIntegration.run(
        integration.id,
        integration.clientId,
        integration.platformKey,
        integration.platformType,
        integration.displayName,
        JSON.stringify(integration.credentials ?? {}),
        JSON.stringify(integration.settings ?? {}),
        integration.createdAt,
        integration.updatedAt,
      );
    }
    for (const location of legacy.locations) {
      insertLocation.run(
        location.id,
        location.clientId,
        location.integrationId,
        location.label,
        location.businessProfileId,
        location.landingPageUrl,
        JSON.stringify(location.metrics ?? {}),
        JSON.stringify(location.findings ?? []),
        location.createdAt,
        location.updatedAt,
      );
    }
    for (const audit of legacy.audits) {
      insertAudit.run(
        audit.id,
        audit.clientId,
        JSON.stringify(audit.integrationIds),
        JSON.stringify(audit.scope),
        audit.status,
        audit.score,
        audit.grade,
        audit.createdAt,
        audit.updatedAt,
        audit.completedAt,
        audit.errorMessage,
      );
    }
    for (const [auditId, report] of Object.entries(legacy.reports)) {
      insertReport.run(auditId, JSON.stringify(report));
    }

    this.migrated = true;
  }

  private mapClient(row: Record<string, unknown>): ClientRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      industry: String(row.industry),
      industryLabelPt: (row.industry_label_pt as string | null) ?? null,
      operatingModel: row.operating_model as ClientRecord["operatingModel"],
      primaryDomain: (row.primary_domain as string | null) ?? null,
      reportLanguage: (row.report_language as ClientRecord["reportLanguage"]) ?? "pt-BR",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapIntegration(row: Record<string, unknown>): IntegrationRecord {
    return {
      id: String(row.id),
      clientId: String(row.client_id),
      platformKey: row.platform_key as IntegrationRecord["platformKey"],
      platformType: row.platform_type as IntegrationRecord["platformType"],
      displayName: String(row.display_name),
      credentials: parseJson(String(row.credentials), {}),
      settings: parseJson(String(row.settings), {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapLocation(row: Record<string, unknown>): LocationRecord {
    return {
      id: String(row.id),
      clientId: String(row.client_id),
      integrationId: (row.integration_id as string | null) ?? null,
      label: String(row.label),
      businessProfileId: (row.business_profile_id as string | null) ?? null,
      landingPageUrl: (row.landing_page_url as string | null) ?? null,
      metrics: parseJson(String(row.metrics), {}),
      findings: parseJson(String(row.findings), []),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAudit(row: Record<string, unknown>): AuditRecord {
    return {
      id: String(row.id),
      clientId: String(row.client_id),
      integrationIds: parseJson(String(row.integration_ids), []),
      scope: parseJson(row.scope as string | null, null),
      status: row.status as AuditRecord["status"],
      score: row.score == null ? null : Number(row.score),
      grade: (row.grade as AuditRecord["grade"]) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      completedAt: (row.completed_at as string | null) ?? null,
      errorMessage: (row.error_message as string | null) ?? null,
    };
  }

  private mapOAuthSession(row: Record<string, unknown>): OAuthSessionRecord {
    return {
      id: String(row.id),
      clientId: String(row.client_id),
      platformKey: row.platform_key as OAuthSessionRecord["platformKey"],
      codeVerifier: String(row.code_verifier),
      redirectUri: String(row.redirect_uri),
      scopes: parseJson(String(row.scopes), []),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
    };
  }

  private mapAuditEvent(row: Record<string, unknown>): AuditEventRecord {
    return {
      id: String(row.id),
      auditId: (row.audit_id as string | null) ?? null,
      level: row.level as AuditEventRecord["level"],
      code: String(row.code),
      message: String(row.message),
      detail: parseJson(row.detail as string | null, null),
      createdAt: String(row.created_at),
    };
  }

  private mapJob(row: Record<string, unknown>): JobRecord {
    return {
      id: String(row.id),
      kind: row.kind as JobKind,
      status: row.status as JobStatus,
      payload: parseJson(String(row.payload), {}),
      result: parseJson(row.result as string | null, null),
      errorMessage: (row.error_message as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      startedAt: (row.started_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
    };
  }

  async listClients() {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from clients order by created_at desc")
      .all<Record<string, unknown>>()
      .map((row) => this.mapClient(row));
  }

  async getClient(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from clients where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapClient(row) : null;
  }

  async createClient(input: Pick<ClientRecord, "name" | "industry" | "industryLabelPt" | "operatingModel" | "primaryDomain" | "reportLanguage">) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const client: ClientRecord = {
      id: createId("client"),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into clients (id, name, industry, industry_label_pt, operating_model, primary_domain, report_language, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client.id,
      client.name,
      client.industry,
      client.industryLabelPt,
      client.operatingModel,
      client.primaryDomain,
      client.reportLanguage,
      client.createdAt,
      client.updatedAt,
    );
    return client;
  }

  async updateClient(
    id: string,
    patch: Partial<Pick<ClientRecord, "name" | "industry" | "industryLabelPt" | "operatingModel" | "primaryDomain" | "reportLanguage">>,
  ) {
    const current = await this.getClient(id);
    if (!current) return null;
    const next: ClientRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update clients
      set name = ?, industry = ?, industry_label_pt = ?, operating_model = ?, primary_domain = ?, report_language = ?, updated_at = ?
      where id = ?
    `).run(
      next.name,
      next.industry,
      next.industryLabelPt,
      next.operatingModel,
      next.primaryDomain,
      next.reportLanguage,
      next.updatedAt,
      id,
    );
    return next;
  }

  async listIntegrationsByClient(clientId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from integrations where client_id = ? order by created_at asc")
      .all<Record<string, unknown>>(clientId)
      .map((row) => this.mapIntegration(row));
  }

  async getIntegration(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from integrations where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapIntegration(row) : null;
  }

  async createIntegration(clientId: string, input: Pick<IntegrationRecord, "platformKey" | "platformType" | "displayName" | "credentials" | "settings">) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const integration: IntegrationRecord = {
      id: createId("int"),
      clientId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into integrations (id, client_id, platform_key, platform_type, display_name, credentials, settings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      integration.id,
      integration.clientId,
      integration.platformKey,
      integration.platformType,
      integration.displayName,
      JSON.stringify(integration.credentials),
      JSON.stringify(integration.settings),
      integration.createdAt,
      integration.updatedAt,
    );
    return integration;
  }

  async updateIntegration(
    id: string,
    patch: Partial<Pick<IntegrationRecord, "displayName" | "credentials" | "settings">>,
  ) {
    const current = await this.getIntegration(id);
    if (!current) return null;
    const next: IntegrationRecord = {
      ...current,
      ...patch,
      credentials: patch.credentials ?? current.credentials,
      settings: patch.settings ? { ...current.settings, ...patch.settings } : current.settings,
      displayName: patch.displayName ?? current.displayName,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update integrations
      set display_name = ?, credentials = ?, settings = ?, updated_at = ?
      where id = ?
    `).run(
      next.displayName,
      JSON.stringify(next.credentials),
      JSON.stringify(next.settings),
      next.updatedAt,
      id,
    );
    return next;
  }

  async listLocationsByClient(clientId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from locations where client_id = ? order by created_at asc")
      .all<Record<string, unknown>>(clientId)
      .map((row) => this.mapLocation(row));
  }

  async upsertLocations(clientId: string, locations: Omit<LocationRecord, "createdAt" | "updatedAt">[]) {
    await this.ensureMigrated();
    const current = await this.listLocationsByClient(clientId);
    this.db.prepare("delete from locations where client_id = ?").run(clientId);
    const insert = this.db.prepare(`
      insert into locations (id, client_id, integration_id, label, business_profile_id, landing_page_url, metrics, findings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const location of locations) {
      const found = current.find((item) => item.id === location.id);
      insert.run(
        location.id,
        location.clientId,
        location.integrationId,
        location.label,
        location.businessProfileId,
        location.landingPageUrl,
        JSON.stringify(location.metrics),
        JSON.stringify(location.findings),
        found?.createdAt ?? now,
        now,
      );
    }
    return this.listLocationsByClient(clientId);
  }

  async listAudits() {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from audits order by created_at desc")
      .all<Record<string, unknown>>()
      .map((row) => this.mapAudit(row));
  }

  async listAuditsByClient(clientId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from audits where client_id = ? order by created_at desc")
      .all<Record<string, unknown>>(clientId)
      .map((row) => this.mapAudit(row));
  }

  async getAudit(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from audits where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapAudit(row) : null;
  }

  async createAudit(input: Pick<AuditRecord, "clientId" | "integrationIds" | "scope">) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const audit: AuditRecord = {
      id: createId("audit"),
      clientId: input.clientId,
      integrationIds: input.integrationIds,
      scope: input.scope,
      status: "queued",
      score: null,
      grade: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
    };
    this.db.prepare(`
      insert into audits (id, client_id, integration_ids, scope, status, score, grade, created_at, updated_at, completed_at, error_message)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      audit.id,
      audit.clientId,
      JSON.stringify(audit.integrationIds),
      JSON.stringify(audit.scope),
      audit.status,
      audit.score,
      audit.grade,
      audit.createdAt,
      audit.updatedAt,
      audit.completedAt,
      audit.errorMessage,
    );
    return audit;
  }

  async updateAudit(id: string, patch: Partial<AuditRecord>) {
    const current = await this.getAudit(id);
    if (!current) return null;
    const next: AuditRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update audits
      set integration_ids = ?, scope = ?, status = ?, score = ?, grade = ?, updated_at = ?, completed_at = ?, error_message = ?
      where id = ?
    `).run(
      JSON.stringify(next.integrationIds),
      JSON.stringify(next.scope),
      next.status,
      next.score,
      next.grade,
      next.updatedAt,
      next.completedAt,
      next.errorMessage,
      id,
    );
    return next;
  }

  async saveReport(auditId: string, report: AuditReportPayload) {
    await this.ensureMigrated();
    this.db.prepare(`
      insert into audit_reports (audit_id, payload) values (?, ?)
      on conflict(audit_id) do update set payload = excluded.payload
    `).run(auditId, JSON.stringify(report));
  }

  async getReport(auditId: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select payload from audit_reports where audit_id = ?").get<{ payload: string }>(auditId);
    return row?.payload ? hydrateReport(JSON.parse(row.payload) as AuditReportPayload) : null;
  }

  async createOAuthSession(input: Omit<OAuthSessionRecord, "createdAt">) {
    await this.ensureMigrated();
    const session: OAuthSessionRecord = {
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.db.prepare(`
      insert into oauth_sessions (id, client_id, platform_key, code_verifier, redirect_uri, scopes, created_at, expires_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.clientId,
      session.platformKey,
      session.codeVerifier,
      session.redirectUri,
      JSON.stringify(session.scopes),
      session.createdAt,
      session.expiresAt,
    );
    return session;
  }

  async getOAuthSession(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from oauth_sessions where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapOAuthSession(row) : null;
  }

  async deleteOAuthSession(id: string) {
    await this.ensureMigrated();
    this.db.prepare("delete from oauth_sessions where id = ?").run(id);
  }

  async appendAuditEvent(input: Omit<AuditEventRecord, "id" | "createdAt">) {
    await this.ensureMigrated();
    const event: AuditEventRecord = {
      id: createId("evt"),
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.db.prepare(`
      insert into audit_events (id, audit_id, level, code, message, detail, created_at)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.auditId,
      event.level,
      event.code,
      event.message,
      JSON.stringify(event.detail),
      event.createdAt,
    );
    return event;
  }

  async listAuditEvents(auditId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from audit_events where audit_id = ? order by created_at asc")
      .all<Record<string, unknown>>(auditId)
      .map((row) => this.mapAuditEvent(row));
  }

  async createJob(input: { kind: JobKind; payload: Record<string, unknown> }) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const job: JobRecord = {
      id: createId("job"),
      kind: input.kind,
      status: "queued",
      payload: input.payload,
      result: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };
    this.db.prepare(`
      insert into jobs (id, kind, status, payload, result, error_message, created_at, updated_at, started_at, completed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.kind,
      job.status,
      JSON.stringify(job.payload),
      JSON.stringify(job.result),
      job.errorMessage,
      job.createdAt,
      job.updatedAt,
      job.startedAt,
      job.completedAt,
    );
    return job;
  }

  async updateJob(
    id: string,
    patch: Partial<Pick<JobRecord, "status" | "result" | "errorMessage" | "startedAt" | "completedAt">>,
  ) {
    const current = (await this.listJobs()).find((job) => job.id === id);
    if (!current) return null;
    const next: JobRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update jobs
      set status = ?, result = ?, error_message = ?, updated_at = ?, started_at = ?, completed_at = ?
      where id = ?
    `).run(
      next.status,
      JSON.stringify(next.result),
      next.errorMessage,
      next.updatedAt,
      next.startedAt,
      next.completedAt,
      id,
    );
    return next;
  }

  async listJobs(filter?: { kind?: JobKind; status?: JobStatus }) {
    await this.ensureMigrated();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.kind) {
      conditions.push("kind = ?");
      params.push(filter.kind);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    const query = `select * from jobs${conditions.length ? ` where ${conditions.join(" and ")}` : ""} order by created_at desc`;
    return this.db
      .prepare(query)
      .all<Record<string, unknown>>(...params)
      .map((row) => this.mapJob(row));
  }
}

let storePromise: Promise<AppStore> | null = null;

export async function getStore(): Promise<AppStore> {
  if (!storePromise) {
    storePromise = (async () => {
      await mkdir(dataDir, { recursive: true });
      return new SQLiteStore(sqliteFile);
    })();
  }
  return storePromise;
}
