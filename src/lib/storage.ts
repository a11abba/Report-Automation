import { access, mkdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  type AccountMembershipRecord,
  type AccountRecord,
  type AuditEventRecord,
  type AuditRecord,
  type AuditReportPayload,
  type ClientReportMemoryLinkRecord,
  type ClientRecord,
  type ContextEntryRecord,
  type IntegrationRecord,
  type JobKind,
  type JobRecord,
  type JobStatus,
  type LocationRecord,
  type OAuthSessionRecord,
  type ReportFeedbackRecord,
  type ReportMemoryRecord,
  type ReportPeriodRecord,
  type UserRecord,
} from "@/lib/audit/types";
import { getAuditDataDir, getAuditDataFile } from "@/lib/runtime-paths";

interface LegacyStoreShape {
  clients: ClientRecord[];
  integrations: IntegrationRecord[];
  locations: LocationRecord[];
  audits: AuditRecord[];
  reports: Record<string, AuditReportPayload>;
}

function hydrateReport(report: AuditReportPayload): AuditReportPayload {
  const framework = report.framework;
  return {
    ...report,
    locale: report.locale ?? "pt-BR",
    reportFocus: report.reportFocus ?? "full_funnel",
    clientIndustryLabel: report.clientIndustryLabel ?? report.snapshot.accountProfile.industry,
    execution: report.execution ?? {
      includedIntegrations: [],
      excludedIntegrations: [],
      coverage: [],
    },
    ...(report.execution
      ? {
          execution: {
            includedIntegrations: report.execution.includedIntegrations ?? [],
            excludedIntegrations: report.execution.excludedIntegrations ?? [],
            coverage: report.execution.coverage ?? [],
          },
        }
      : {}),
    reportPeriod: report.reportPeriod ?? {
      id: null,
      periodKey: null,
      periodStart: null,
      periodEnd: null,
      baselinePeriodId: null,
      baselinePeriodKey: null,
      manualInputs: null,
    },
    dataFacts: report.dataFacts ?? [],
    providedContext: report.providedContext ?? [],
    hypotheses: report.hypotheses ?? [],
    recommendations: report.recommendations ?? [],
    confidenceNotes: report.confidenceNotes ?? [],
    framework: {
      executiveSummary: framework?.executiveSummary ?? "",
      clientEmailDraft: framework?.clientEmailDraft ?? "",
      whatHappened: framework?.whatHappened ?? report.dataFacts ?? [],
      whyItHappened: framework?.whyItHappened ?? report.hypotheses ?? [],
      whatWeAreDoing: framework?.whatWeAreDoing ?? report.recommendations ?? [],
      ccipaPillars: framework?.ccipaPillars ?? [],
    },
    snapshot: {
      ...report.snapshot,
      paidMediaSources:
        report.snapshot.paidMediaSources ??
        (report.snapshot.paidMedia
          ? [
              {
                ...report.snapshot.paidMedia,
                platformKey: "meta_ads",
                platformLabel: "Paid media",
              },
            ]
          : []),
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
  ensurePlatformAccount(): Promise<AccountRecord>;
  listAccounts(): Promise<AccountRecord[]>;
  getAccount(id: string): Promise<AccountRecord | null>;
  createAccount(
    input: Pick<
      AccountRecord,
      "name" | "subscriptionStatus" | "serviceTier" | "billingCycleAnchor" | "trialEndsAt"
    >,
  ): Promise<AccountRecord>;
  updateAccount(
    id: string,
    patch: Partial<
      Pick<
        AccountRecord,
        "name" | "subscriptionStatus" | "serviceTier" | "billingCycleAnchor" | "trialEndsAt"
      >
    >,
  ): Promise<AccountRecord | null>;
  getUser(id: string): Promise<UserRecord | null>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  upsertUser(input: {
    email: string;
    name: string;
    picture: string | null;
    locale: UserRecord["locale"];
  }): Promise<UserRecord>;
  listAccountMemberships(accountId: string): Promise<AccountMembershipRecord[]>;
  getMembership(id: string): Promise<AccountMembershipRecord | null>;
  getMembershipsForEmail(email: string): Promise<AccountMembershipRecord[]>;
  inviteAccountUser(input: {
    accountId: string;
    invitedEmail: string;
    role: AccountMembershipRecord["role"];
    invitedByUserId: string | null;
  }): Promise<AccountMembershipRecord>;
  activateMembership(id: string, userId: string): Promise<AccountMembershipRecord | null>;
  storeSecret(secretRef: string, payload: string): Promise<void>;
  readSecret(secretRef: string): Promise<string | null>;
  deleteSecret(secretRef: string): Promise<void>;
  listClients(): Promise<ClientRecord[]>;
  getClient(id: string): Promise<ClientRecord | null>;
  createClient(
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
  ): Promise<ClientRecord>;
  listReportMemories(accountId?: string): Promise<ReportMemoryRecord[]>;
  getReportMemory(id: string): Promise<ReportMemoryRecord | null>;
  createReportMemory(
    accountId: string,
    input: Pick<ReportMemoryRecord, "title" | "sourceClientName" | "periodLabel" | "notes" | "content">,
  ): Promise<ReportMemoryRecord>;
  deleteReportMemory(id: string): Promise<ReportMemoryRecord | null>;
  listClientReportMemoryLinks(clientId: string): Promise<ClientReportMemoryLinkRecord[]>;
  listReportMemoriesByClient(clientId: string): Promise<ReportMemoryRecord[]>;
  attachReportMemoryToClient(clientId: string, reportMemoryId: string): Promise<ClientReportMemoryLinkRecord>;
  detachReportMemoryFromClient(clientId: string, reportMemoryId: string): Promise<void>;
  listReportFeedbackByClient(clientId: string): Promise<ReportFeedbackRecord[]>;
  listReportFeedbackByAudit(auditId: string): Promise<ReportFeedbackRecord[]>;
  createReportFeedback(
    auditId: string,
    input: Pick<ReportFeedbackRecord, "rating" | "notes">,
  ): Promise<ReportFeedbackRecord>;
  updateClient(
    id: string,
    patch: Partial<
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
  ): Promise<ClientRecord | null>;
  deleteClient(id: string): Promise<ClientRecord | null>;
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
  deleteIntegration(id: string): Promise<IntegrationRecord | null>;
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
  claimQueuedAudit(id: string): Promise<AuditRecord | null>;
  cancelQueuedAudit(id: string): Promise<AuditRecord | null>;
  deleteAudit(id: string): Promise<AuditRecord | null>;
  saveReport(auditId: string, report: AuditReportPayload): Promise<void>;
  getReport(auditId: string): Promise<AuditReportPayload | null>;
  listReportPeriodsByClient(clientId: string): Promise<ReportPeriodRecord[]>;
  getReportPeriod(id: string): Promise<ReportPeriodRecord | null>;
  createReportPeriod(
    clientId: string,
    input: Pick<
      ReportPeriodRecord,
      "periodKey" | "periodStart" | "periodEnd" | "baselinePeriodId" | "manualInputs"
    >,
  ): Promise<ReportPeriodRecord>;
  updateReportPeriod(
    id: string,
    patch: Partial<
      Pick<ReportPeriodRecord, "baselinePeriodId" | "status" | "auditId" | "manualInputs" | "generatedAt">
    >,
  ): Promise<ReportPeriodRecord | null>;
  getContextEntry(id: string): Promise<ContextEntryRecord | null>;
  listContextEntriesByReportPeriod(reportPeriodId: string): Promise<ContextEntryRecord[]>;
  createContextEntry(
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
      | "authorName"
      | "authorEmail"
    >,
  ): Promise<ContextEntryRecord>;
  deleteContextEntry(id: string): Promise<ContextEntryRecord | null>;
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

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "account";
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
    await access(getAuditDataFile("app-db.json"));
    return true;
  } catch {
    return false;
  }
}

async function readLegacyStore(): Promise<LegacyStoreShape | null> {
  if (!(await legacyStoreExists())) {
    return null;
  }
  const raw = await readFile(getAuditDataFile("app-db.json"), "utf-8");
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
      create table if not exists accounts (
        id text primary key,
        name text not null,
        slug text not null unique,
        subscription_status text not null,
        service_tier text not null,
        billing_cycle_anchor text,
        trial_ends_at text,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists users (
        id text primary key,
        email text not null unique,
        name text not null,
        picture text,
        locale text not null,
        last_login_at text,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists account_members (
        id text primary key,
        account_id text not null,
        user_id text,
        invited_email text not null,
        role text not null,
        status text not null,
        invited_by_user_id text,
        activated_at text,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists credential_secrets (
        secret_ref text primary key,
        payload text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists clients (
        id text primary key,
        account_id text not null,
        name text not null,
        industry text not null,
        industry_label_pt text,
        operating_model text not null,
        primary_domain text,
        report_language text not null,
        report_focus text not null default 'full_funnel',
        report_intro text,
        report_benchmarks text,
        reference_report_notes text,
        monthly_report_enabled integer not null default 0,
        monthly_report_day integer,
        monthly_report_auto_generate integer not null default 1,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists integrations (
        id text primary key,
        account_id text not null,
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
        account_id text not null,
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
        account_id text not null,
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
      create table if not exists report_periods (
        id text primary key,
        account_id text not null,
        client_id text not null,
        period_key text not null,
        period_start text not null,
        period_end text not null,
        baseline_period_id text,
        status text not null,
        audit_id text,
        manual_inputs text not null,
        generated_at text,
        created_at text not null,
        updated_at text not null
      );
      create unique index if not exists report_periods_client_period_key on report_periods (client_id, period_key);
      create table if not exists context_entries (
        id text primary key,
        account_id text not null,
        client_id text not null,
        report_period_id text not null,
        channel text,
        source text,
        campaign_reference text,
        entry_type text not null,
        text text not null,
        tags text not null,
        effective_start_date text,
        effective_end_date text,
        author_name text not null,
        author_email text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists audit_reports (
        audit_id text primary key,
        payload text not null
      );
      create table if not exists report_memories (
        id text primary key,
        account_id text not null,
        title text not null,
        source_client_name text,
        period_label text,
        notes text,
        content text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists client_report_memory_links (
        id text primary key,
        account_id text not null,
        client_id text not null,
        report_memory_id text not null,
        created_at text not null
      );
      create unique index if not exists client_report_memory_links_unique
        on client_report_memory_links (client_id, report_memory_id);
      create table if not exists report_feedback (
        id text primary key,
        account_id text not null,
        client_id text not null,
        audit_id text not null,
        rating text not null,
        notes text not null,
        created_at text not null,
        updated_at text not null
      );
      create table if not exists oauth_sessions (
        id text primary key,
        account_id text not null,
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
        account_id text not null,
        audit_id text,
        level text not null,
        code text not null,
        message text not null,
        detail text,
        created_at text not null
      );
      create table if not exists jobs (
        id text primary key,
        account_id text not null,
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
    if (!this.hasColumn("clients", "account_id")) {
      this.db.exec("alter table clients add column account_id text;");
    }
    if (!this.hasColumn("clients", "report_focus")) {
      this.db.exec("alter table clients add column report_focus text not null default 'full_funnel';");
    }
    if (!this.hasColumn("integrations", "account_id")) {
      this.db.exec("alter table integrations add column account_id text;");
    }
    if (!this.hasColumn("locations", "account_id")) {
      this.db.exec("alter table locations add column account_id text;");
    }
    if (!this.hasColumn("audits", "account_id")) {
      this.db.exec("alter table audits add column account_id text;");
    }
    if (!this.hasColumn("oauth_sessions", "account_id")) {
      this.db.exec("alter table oauth_sessions add column account_id text;");
    }
    if (!this.hasColumn("audit_events", "account_id")) {
      this.db.exec("alter table audit_events add column account_id text;");
    }
    if (!this.hasColumn("jobs", "account_id")) {
      this.db.exec("alter table jobs add column account_id text;");
    }
    if (!this.hasColumn("clients", "monthly_report_enabled")) {
      this.db.exec("alter table clients add column monthly_report_enabled integer not null default 0;");
    }
    if (!this.hasColumn("clients", "monthly_report_day")) {
      this.db.exec("alter table clients add column monthly_report_day integer;");
    }
    if (!this.hasColumn("clients", "monthly_report_auto_generate")) {
      this.db.exec("alter table clients add column monthly_report_auto_generate integer not null default 1;");
    }
    if (!this.hasColumn("clients", "report_intro")) {
      this.db.exec("alter table clients add column report_intro text;");
    }
    if (!this.hasColumn("clients", "report_benchmarks")) {
      this.db.exec("alter table clients add column report_benchmarks text;");
    }
    if (!this.hasColumn("clients", "reference_report_notes")) {
      this.db.exec("alter table clients add column reference_report_notes text;");
    }
  }

  private hasColumn(tableName: string, columnName: string) {
    const rows = this.db.prepare(`pragma table_info(${tableName})`).all<Record<string, unknown>>();
    return rows.some((row) => String(row.name) === columnName);
  }

  private async ensureMigrated() {
    if (this.migrated) {
      return;
    }
    const platformAccount = await this.ensurePlatformAccount();
    const row = this.db.prepare("select count(*) as count from clients").get<{ count: number }>();
    if ((row?.count ?? 0) > 0) {
      this.db.prepare("update clients set account_id = ? where account_id is null or account_id = ''").run(platformAccount.id);
      this.db.prepare("update integrations set account_id = (select account_id from clients where clients.id = integrations.client_id) where account_id is null or account_id = ''").run();
      this.db.prepare("update locations set account_id = (select account_id from clients where clients.id = locations.client_id) where account_id is null or account_id = ''").run();
      this.db.prepare("update audits set account_id = (select account_id from clients where clients.id = audits.client_id) where account_id is null or account_id = ''").run();
      this.db.prepare("update oauth_sessions set account_id = (select account_id from clients where clients.id = oauth_sessions.client_id) where account_id is null or account_id = ''").run();
      this.db.prepare("update audit_events set account_id = coalesce((select account_id from audits where audits.id = audit_events.audit_id), ?) where account_id is null or account_id = ''").run(platformAccount.id);
      this.db.prepare("update jobs set account_id = ? where account_id is null or account_id = ''").run(platformAccount.id);
      this.migrated = true;
      return;
    }

    const legacy = await readLegacyStore();
    if (!legacy) {
      this.migrated = true;
      return;
    }

    const insertClient = this.db.prepare(`
      insert or ignore into clients (id, account_id, name, industry, industry_label_pt, operating_model, primary_domain, report_language, report_focus, report_intro, report_benchmarks, reference_report_notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertIntegration = this.db.prepare(`
      insert or ignore into integrations (id, account_id, client_id, platform_key, platform_type, display_name, credentials, settings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLocation = this.db.prepare(`
      insert or ignore into locations (id, account_id, client_id, integration_id, label, business_profile_id, landing_page_url, metrics, findings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAudit = this.db.prepare(`
      insert or ignore into audits (id, account_id, client_id, integration_ids, scope, status, score, grade, created_at, updated_at, completed_at, error_message)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertReport = this.db.prepare(`
      insert or ignore into audit_reports (audit_id, payload) values (?, ?)
    `);

    for (const client of legacy.clients) {
      insertClient.run(
        client.id,
        platformAccount.id,
        client.name,
        client.industry,
        client.industryLabelPt,
        client.operatingModel,
        client.primaryDomain,
        client.reportLanguage ?? "pt-BR",
        client.reportFocus ?? "full_funnel",
        client.reportIntro ?? null,
        client.reportBenchmarks ?? null,
        client.referenceReportNotes ?? null,
        client.createdAt,
        client.updatedAt,
      );
    }
    for (const integration of legacy.integrations) {
      insertIntegration.run(
        integration.id,
        platformAccount.id,
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
        platformAccount.id,
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
        platformAccount.id,
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
      accountId: String(row.account_id),
      name: String(row.name),
      industry: String(row.industry),
      industryLabelPt: (row.industry_label_pt as string | null) ?? null,
      operatingModel: row.operating_model as ClientRecord["operatingModel"],
      primaryDomain: (row.primary_domain as string | null) ?? null,
      reportLanguage: (row.report_language as ClientRecord["reportLanguage"]) ?? "pt-BR",
      reportFocus: (row.report_focus as ClientRecord["reportFocus"]) ?? "full_funnel",
      reportIntro: (row.report_intro as string | null) ?? null,
      reportBenchmarks: (row.report_benchmarks as string | null) ?? null,
      referenceReportNotes: (row.reference_report_notes as string | null) ?? null,
      monthlyReportEnabled: Boolean(row.monthly_report_enabled),
      monthlyReportDay:
        row.monthly_report_day == null ? null : Number(row.monthly_report_day),
      monthlyReportAutoGenerate:
        row.monthly_report_auto_generate == null
          ? true
          : Boolean(row.monthly_report_auto_generate),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapIntegration(row: Record<string, unknown>): IntegrationRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
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
      accountId: String(row.account_id),
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

  private mapReportPeriod(row: Record<string, unknown>): ReportPeriodRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      clientId: String(row.client_id),
      periodKey: String(row.period_key),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      baselinePeriodId: (row.baseline_period_id as string | null) ?? null,
      status: row.status as ReportPeriodRecord["status"],
      auditId: (row.audit_id as string | null) ?? null,
      manualInputs: parseJson(String(row.manual_inputs), {
        leads: null,
        qualifiedLeads: null,
        sales: null,
        revenue: null,
        notes: null,
      }),
      generatedAt: (row.generated_at as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapContextEntry(row: Record<string, unknown>): ContextEntryRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      clientId: String(row.client_id),
      reportPeriodId: String(row.report_period_id),
      channel: (row.channel as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      campaignReference: (row.campaign_reference as string | null) ?? null,
      entryType: row.entry_type as ContextEntryRecord["entryType"],
      text: String(row.text),
      tags: parseJson(String(row.tags), []),
      effectiveStartDate: (row.effective_start_date as string | null) ?? null,
      effectiveEndDate: (row.effective_end_date as string | null) ?? null,
      authorName: String(row.author_name),
      authorEmail: String(row.author_email),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapReportMemory(row: Record<string, unknown>): ReportMemoryRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      title: String(row.title),
      sourceClientName: (row.source_client_name as string | null) ?? null,
      periodLabel: (row.period_label as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      content: String(row.content),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapClientReportMemoryLink(row: Record<string, unknown>): ClientReportMemoryLinkRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      clientId: String(row.client_id),
      reportMemoryId: String(row.report_memory_id),
      createdAt: String(row.created_at),
    };
  }

  private mapReportFeedback(row: Record<string, unknown>): ReportFeedbackRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      clientId: String(row.client_id),
      auditId: String(row.audit_id),
      rating: row.rating as ReportFeedbackRecord["rating"],
      notes: String(row.notes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAudit(row: Record<string, unknown>): AuditRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
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
      accountId: String(row.account_id),
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
      accountId: String(row.account_id),
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
      accountId: String(row.account_id),
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

  private mapAccount(row: Record<string, unknown>): AccountRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      subscriptionStatus: row.subscription_status as AccountRecord["subscriptionStatus"],
      serviceTier: String(row.service_tier),
      billingCycleAnchor: (row.billing_cycle_anchor as string | null) ?? null,
      trialEndsAt: (row.trial_ends_at as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapUser(row: Record<string, unknown>): UserRecord {
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      picture: (row.picture as string | null) ?? null,
      locale: (row.locale as UserRecord["locale"]) ?? "en",
      lastLoginAt: (row.last_login_at as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAccountMembership(row: Record<string, unknown>): AccountMembershipRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      userId: (row.user_id as string | null) ?? null,
      invitedEmail: String(row.invited_email),
      role: row.role as AccountMembershipRecord["role"],
      status: row.status as AccountMembershipRecord["status"],
      invitedByUserId: (row.invited_by_user_id as string | null) ?? null,
      activatedAt: (row.activated_at as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async ensurePlatformAccount() {
    const existing = this.db
      .prepare("select * from accounts where slug = ?")
      .get<Record<string, unknown>>("platform");
    if (existing) {
      return this.mapAccount(existing);
    }

    const now = new Date().toISOString();
    const account: AccountRecord = {
      id: createId("acct"),
      name: "Platform",
      slug: "platform",
      subscriptionStatus: "active",
      serviceTier: "internal",
      billingCycleAnchor: null,
      trialEndsAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(`
        insert into accounts (id, name, slug, subscription_status, service_tier, billing_cycle_anchor, trial_ends_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        account.id,
        account.name,
        account.slug,
        account.subscriptionStatus,
        account.serviceTier,
        account.billingCycleAnchor,
        account.trialEndsAt,
        account.createdAt,
        account.updatedAt,
      );
    return account;
  }

  async listAccounts() {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from accounts order by created_at asc")
      .all<Record<string, unknown>>()
      .map((row) => this.mapAccount(row));
  }

  async getAccount(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from accounts where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapAccount(row) : null;
  }

  async createAccount(
    input: Pick<
      AccountRecord,
      "name" | "subscriptionStatus" | "serviceTier" | "billingCycleAnchor" | "trialEndsAt"
    >,
  ) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const baseSlug = slugify(input.name);
    let slug = baseSlug;
    let suffix = 2;
    while (
      this.db.prepare("select 1 as found from accounts where slug = ?").get<{ found: number }>(slug)
    ) {
      slug = `${baseSlug}-${suffix++}`;
    }
    const account: AccountRecord = {
      id: createId("acct"),
      name: input.name,
      slug,
      subscriptionStatus: input.subscriptionStatus,
      serviceTier: input.serviceTier,
      billingCycleAnchor: input.billingCycleAnchor,
      trialEndsAt: input.trialEndsAt,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(`
        insert into accounts (id, name, slug, subscription_status, service_tier, billing_cycle_anchor, trial_ends_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        account.id,
        account.name,
        account.slug,
        account.subscriptionStatus,
        account.serviceTier,
        account.billingCycleAnchor,
        account.trialEndsAt,
        account.createdAt,
        account.updatedAt,
      );
    return account;
  }

  async updateAccount(
    id: string,
    patch: Partial<
      Pick<
        AccountRecord,
        "name" | "subscriptionStatus" | "serviceTier" | "billingCycleAnchor" | "trialEndsAt"
      >
    >,
  ) {
    const current = await this.getAccount(id);
    if (!current) return null;
    const next: AccountRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(`
        update accounts
        set name = ?, subscription_status = ?, service_tier = ?, billing_cycle_anchor = ?, trial_ends_at = ?, updated_at = ?
        where id = ?
      `)
      .run(
        next.name,
        next.subscriptionStatus,
        next.serviceTier,
        next.billingCycleAnchor,
        next.trialEndsAt,
        next.updatedAt,
        id,
      );
    return next;
  }

  async getUser(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from users where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapUser(row) : null;
  }

  async getUserByEmail(email: string) {
    await this.ensureMigrated();
    const row = this.db
      .prepare("select * from users where lower(email) = lower(?)")
      .get<Record<string, unknown>>(email);
    return row ? this.mapUser(row) : null;
  }

  async upsertUser(input: {
    email: string;
    name: string;
    picture: string | null;
    locale: UserRecord["locale"];
  }) {
    await this.ensureMigrated();
    const current = await this.getUserByEmail(input.email);
    const now = new Date().toISOString();
    if (current) {
      const next: UserRecord = {
        ...current,
        name: input.name,
        picture: input.picture,
        locale: input.locale,
        lastLoginAt: now,
        updatedAt: now,
      };
      this.db
        .prepare(`
          update users
          set name = ?, picture = ?, locale = ?, last_login_at = ?, updated_at = ?
          where id = ?
        `)
        .run(next.name, next.picture, next.locale, next.lastLoginAt, next.updatedAt, next.id);
      return next;
    }

    const user: UserRecord = {
      id: createId("user"),
      email: input.email.toLowerCase(),
      name: input.name,
      picture: input.picture,
      locale: input.locale,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(`
        insert into users (id, email, name, picture, locale, last_login_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        user.id,
        user.email,
        user.name,
        user.picture,
        user.locale,
        user.lastLoginAt,
        user.createdAt,
        user.updatedAt,
      );
    return user;
  }

  async listAccountMemberships(accountId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from account_members where account_id = ? order by created_at asc")
      .all<Record<string, unknown>>(accountId)
      .map((row) => this.mapAccountMembership(row));
  }

  async getMembership(id: string) {
    await this.ensureMigrated();
    const row = this.db
      .prepare("select * from account_members where id = ?")
      .get<Record<string, unknown>>(id);
    return row ? this.mapAccountMembership(row) : null;
  }

  async getMembershipsForEmail(email: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from account_members where lower(invited_email) = lower(?) order by created_at asc")
      .all<Record<string, unknown>>(email)
      .map((row) => this.mapAccountMembership(row));
  }

  async inviteAccountUser(input: {
    accountId: string;
    invitedEmail: string;
    role: AccountMembershipRecord["role"];
    invitedByUserId: string | null;
  }) {
    await this.ensureMigrated();
    const current = this.db
      .prepare(
        "select * from account_members where account_id = ? and lower(invited_email) = lower(?)",
      )
      .get<Record<string, unknown>>(input.accountId, input.invitedEmail);
    if (current) {
      return this.mapAccountMembership(current);
    }

    const now = new Date().toISOString();
    const membership: AccountMembershipRecord = {
      id: createId("mem"),
      accountId: input.accountId,
      userId: null,
      invitedEmail: input.invitedEmail.toLowerCase(),
      role: input.role,
      status: "invited",
      invitedByUserId: input.invitedByUserId,
      activatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(`
        insert into account_members (id, account_id, user_id, invited_email, role, status, invited_by_user_id, activated_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        membership.id,
        membership.accountId,
        membership.userId,
        membership.invitedEmail,
        membership.role,
        membership.status,
        membership.invitedByUserId,
        membership.activatedAt,
        membership.createdAt,
        membership.updatedAt,
      );
    return membership;
  }

  async activateMembership(id: string, userId: string) {
    const current = await this.getMembership(id);
    if (!current) return null;
    const next: AccountMembershipRecord = {
      ...current,
      userId,
      status: "active",
      activatedAt: current.activatedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(`
        update account_members
        set user_id = ?, status = ?, activated_at = ?, updated_at = ?
        where id = ?
      `)
      .run(next.userId, next.status, next.activatedAt, next.updatedAt, id);
    return next;
  }

  async storeSecret(secretRef: string, payload: string) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    this.db
      .prepare(`
        insert into credential_secrets (secret_ref, payload, created_at, updated_at)
        values (?, ?, ?, ?)
        on conflict(secret_ref) do update set payload = excluded.payload, updated_at = excluded.updated_at
      `)
      .run(secretRef, payload, now, now);
  }

  async readSecret(secretRef: string) {
    await this.ensureMigrated();
    const row = this.db
      .prepare("select payload from credential_secrets where secret_ref = ?")
      .get<{ payload: string }>(secretRef);
    return row?.payload ?? null;
  }

  async deleteSecret(secretRef: string) {
    await this.ensureMigrated();
    this.db.prepare("delete from credential_secrets where secret_ref = ?").run(secretRef);
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

  async createClient(
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
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const client: ClientRecord = {
      id: createId("client"),
      accountId,
      ...input,
      monthlyReportEnabled: false,
      monthlyReportDay: null,
      monthlyReportAutoGenerate: true,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into clients (
        id,
        account_id,
        name,
        industry,
        industry_label_pt,
        operating_model,
        primary_domain,
        report_language,
        report_focus,
        report_intro,
        report_benchmarks,
        reference_report_notes,
        monthly_report_enabled,
        monthly_report_day,
        monthly_report_auto_generate,
        created_at,
        updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      client.id,
      client.accountId,
      client.name,
      client.industry,
      client.industryLabelPt,
      client.operatingModel,
      client.primaryDomain,
      client.reportLanguage,
      client.reportFocus,
      client.reportIntro,
      client.reportBenchmarks,
      client.referenceReportNotes,
      client.monthlyReportEnabled ? 1 : 0,
      client.monthlyReportDay,
      client.monthlyReportAutoGenerate ? 1 : 0,
      client.createdAt,
      client.updatedAt,
    );
    return client;
  }

  async updateClient(
    id: string,
    patch: Partial<
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
    const current = await this.getClient(id);
    if (!current) return null;
    const next: ClientRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update clients
      set name = ?, industry = ?, industry_label_pt = ?, operating_model = ?, primary_domain = ?, report_language = ?, report_focus = ?, report_intro = ?, report_benchmarks = ?, reference_report_notes = ?, monthly_report_enabled = ?, monthly_report_day = ?, monthly_report_auto_generate = ?, updated_at = ?
      where id = ?
    `).run(
      next.name,
      next.industry,
      next.industryLabelPt,
      next.operatingModel,
      next.primaryDomain,
      next.reportLanguage,
      next.reportFocus,
      next.reportIntro,
      next.reportBenchmarks,
      next.referenceReportNotes,
      next.monthlyReportEnabled ? 1 : 0,
      next.monthlyReportDay,
      next.monthlyReportAutoGenerate ? 1 : 0,
      next.updatedAt,
      id,
    );
    return next;
  }

  async listReportMemories(accountId?: string) {
    await this.ensureMigrated();
    const query = accountId
      ? "select * from report_memories where account_id = ? order by created_at desc"
      : "select * from report_memories order by created_at desc";
    const rows = accountId
      ? this.db.prepare(query).all<Record<string, unknown>>(accountId)
      : this.db.prepare(query).all<Record<string, unknown>>();
    return rows.map((row) => this.mapReportMemory(row));
  }

  async getReportMemory(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from report_memories where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapReportMemory(row) : null;
  }

  async createReportMemory(
    accountId: string,
    input: Pick<ReportMemoryRecord, "title" | "sourceClientName" | "periodLabel" | "notes" | "content">,
  ) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const memory: ReportMemoryRecord = {
      id: createId("memory"),
      accountId,
      title: input.title,
      sourceClientName: input.sourceClientName,
      periodLabel: input.periodLabel,
      notes: input.notes,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into report_memories (id, account_id, title, source_client_name, period_label, notes, content, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memory.id,
      memory.accountId,
      memory.title,
      memory.sourceClientName,
      memory.periodLabel,
      memory.notes,
      memory.content,
      memory.createdAt,
      memory.updatedAt,
    );
    return memory;
  }

  async deleteReportMemory(id: string) {
    await this.ensureMigrated();
    const current = await this.getReportMemory(id);
    if (!current) return null;
    this.db.prepare("delete from client_report_memory_links where report_memory_id = ?").run(id);
    this.db.prepare("delete from report_memories where id = ?").run(id);
    return current;
  }

  async listClientReportMemoryLinks(clientId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from client_report_memory_links where client_id = ? order by created_at desc")
      .all<Record<string, unknown>>(clientId)
      .map((row) => this.mapClientReportMemoryLink(row));
  }

  async listReportMemoriesByClient(clientId: string) {
    await this.ensureMigrated();
    const rows = this.db.prepare(`
      select rm.*
      from report_memories rm
      inner join client_report_memory_links links on links.report_memory_id = rm.id
      where links.client_id = ?
      order by links.created_at desc
    `).all<Record<string, unknown>>(clientId);
    return rows.map((row) => this.mapReportMemory(row));
  }

  async attachReportMemoryToClient(clientId: string, reportMemoryId: string) {
    await this.ensureMigrated();
    const client = await this.getClient(clientId);
    const memory = await this.getReportMemory(reportMemoryId);
    if (!client || !memory) {
      throw new Error("Client or report memory not found.");
    }
    if (client.accountId !== memory.accountId) {
      throw new Error("Report memory and client must belong to the same account.");
    }
    const existing = this.db.prepare(
      "select * from client_report_memory_links where client_id = ? and report_memory_id = ?",
    ).get<Record<string, unknown>>(clientId, reportMemoryId);
    if (existing) {
      return this.mapClientReportMemoryLink(existing);
    }
    const link: ClientReportMemoryLinkRecord = {
      id: createId("memory_link"),
      accountId: client.accountId,
      clientId,
      reportMemoryId,
      createdAt: new Date().toISOString(),
    };
    this.db.prepare(`
      insert into client_report_memory_links (id, account_id, client_id, report_memory_id, created_at)
      values (?, ?, ?, ?, ?)
    `).run(link.id, link.accountId, link.clientId, link.reportMemoryId, link.createdAt);
    return link;
  }

  async detachReportMemoryFromClient(clientId: string, reportMemoryId: string) {
    await this.ensureMigrated();
    this.db.prepare(
      "delete from client_report_memory_links where client_id = ? and report_memory_id = ?",
    ).run(clientId, reportMemoryId);
  }

  async listReportFeedbackByClient(clientId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from report_feedback where client_id = ? order by created_at desc")
      .all<Record<string, unknown>>(clientId)
      .map((row) => this.mapReportFeedback(row));
  }

  async listReportFeedbackByAudit(auditId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from report_feedback where audit_id = ? order by created_at desc")
      .all<Record<string, unknown>>(auditId)
      .map((row) => this.mapReportFeedback(row));
  }

  async createReportFeedback(
    auditId: string,
    input: Pick<ReportFeedbackRecord, "rating" | "notes">,
  ) {
    await this.ensureMigrated();
    const audit = await this.getAudit(auditId);
    if (!audit) {
      throw new Error("Audit not found.");
    }
    const now = new Date().toISOString();
    const feedback: ReportFeedbackRecord = {
      id: createId("feedback"),
      accountId: audit.accountId,
      clientId: audit.clientId,
      auditId,
      rating: input.rating,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into report_feedback (id, account_id, client_id, audit_id, rating, notes, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      feedback.id,
      feedback.accountId,
      feedback.clientId,
      feedback.auditId,
      feedback.rating,
      feedback.notes,
      feedback.createdAt,
      feedback.updatedAt,
    );
    return feedback;
  }

  async deleteClient(id: string) {
    await this.ensureMigrated();
    const current = await this.getClient(id);
    if (!current) return null;

    const audits = await this.listAuditsByClient(id);
    const auditIds = audits.map((audit) => audit.id);
    const jobs = await this.listJobs();

    for (const auditId of auditIds) {
      this.db.prepare("delete from audit_reports where audit_id = ?").run(auditId);
      this.db.prepare("delete from audit_events where audit_id = ?").run(auditId);
      this.db.prepare("delete from report_feedback where audit_id = ?").run(auditId);
    }

    for (const job of jobs) {
      const payload = job.payload ?? {};
      const payloadAuditId =
        typeof payload["auditId"] === "string" ? payload["auditId"] : null;
      const payloadClientId =
        typeof payload["clientId"] === "string" ? payload["clientId"] : null;
      if (payloadClientId === id || (payloadAuditId && auditIds.includes(payloadAuditId))) {
        this.db.prepare("delete from jobs where id = ?").run(job.id);
      }
    }

    this.db.prepare("delete from context_entries where client_id = ?").run(id);
    this.db.prepare("delete from client_report_memory_links where client_id = ?").run(id);
    this.db.prepare("delete from report_feedback where client_id = ?").run(id);
    this.db.prepare("delete from report_periods where client_id = ?").run(id);
    this.db.prepare("delete from oauth_sessions where client_id = ?").run(id);
    this.db.prepare("delete from locations where client_id = ?").run(id);
    this.db.prepare("delete from integrations where client_id = ?").run(id);
    this.db.prepare("delete from audits where client_id = ?").run(id);
    this.db.prepare("delete from clients where id = ?").run(id);
    return current;
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
    const client = await this.getClient(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found.`);
    }
    const now = new Date().toISOString();
    const integration: IntegrationRecord = {
      id: createId("int"),
      accountId: client.accountId,
      clientId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into integrations (id, account_id, client_id, platform_key, platform_type, display_name, credentials, settings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      integration.id,
      integration.accountId,
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

  async deleteIntegration(id: string) {
    const current = await this.getIntegration(id);
    if (!current) return null;
    this.db.prepare("delete from integrations where id = ?").run(id);
    return current;
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
      insert into locations (id, account_id, client_id, integration_id, label, business_profile_id, landing_page_url, metrics, findings, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const location of locations) {
      const found = current.find((item) => item.id === location.id);
      insert.run(
        location.id,
        location.accountId,
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
    const client = await this.getClient(input.clientId);
    if (!client) {
      throw new Error(`Client ${input.clientId} not found.`);
    }
    const now = new Date().toISOString();
    const audit: AuditRecord = {
      id: createId("audit"),
      accountId: client.accountId,
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
      insert into audits (id, account_id, client_id, integration_ids, scope, status, score, grade, created_at, updated_at, completed_at, error_message)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      audit.id,
      audit.accountId,
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

  async claimQueuedAudit(id: string) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const result = this.db
      .prepare("update audits set status = 'running', updated_at = ?, error_message = null where id = ? and status = 'queued'")
      .run(now, id);
    return result.changes > 0 ? this.getAudit(id) : null;
  }

  async cancelQueuedAudit(id: string) {
    await this.ensureMigrated();
    const now = new Date().toISOString();
    const result = this.db
      .prepare("update audits set status = 'canceled', updated_at = ?, completed_at = ?, error_message = null where id = ? and status = 'queued'")
      .run(now, now, id);
    return result.changes > 0 ? this.getAudit(id) : null;
  }

  async deleteAudit(id: string) {
    await this.ensureMigrated();
    const current = await this.getAudit(id);
    if (!current) return null;
    const jobs = await this.listJobs();
    const now = new Date().toISOString();

    this.db.exec("begin");
    try {
      this.db
        .prepare("update report_periods set status = 'draft', audit_id = null, generated_at = null, updated_at = ? where audit_id = ?")
        .run(now, id);
      for (const job of jobs) {
        if (job.payload["auditId"] === id) {
          this.db.prepare("delete from jobs where id = ?").run(job.id);
        }
      }
      this.db.prepare("delete from audit_reports where audit_id = ?").run(id);
      this.db.prepare("delete from audit_events where audit_id = ?").run(id);
      this.db.prepare("delete from report_feedback where audit_id = ?").run(id);
      this.db.prepare("delete from audits where id = ?").run(id);
      this.db.exec("commit");
      return current;
    } catch (error) {
      this.db.exec("rollback");
      throw error;
    }
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

  async listReportPeriodsByClient(clientId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from report_periods where client_id = ? order by period_start desc, created_at desc")
      .all<Record<string, unknown>>(clientId)
      .map((row) => this.mapReportPeriod(row));
  }

  async getReportPeriod(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from report_periods where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapReportPeriod(row) : null;
  }

  async createReportPeriod(
    clientId: string,
    input: Pick<
      ReportPeriodRecord,
      "periodKey" | "periodStart" | "periodEnd" | "baselinePeriodId" | "manualInputs"
    >,
  ) {
    await this.ensureMigrated();
    const client = await this.getClient(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found.`);
    }
    const existing = this.db
      .prepare("select * from report_periods where client_id = ? and period_key = ?")
      .get<Record<string, unknown>>(clientId, input.periodKey);
    if (existing) {
      throw new Error(`A monthly report period already exists for ${input.periodKey}.`);
    }

    const now = new Date().toISOString();
    const reportPeriod: ReportPeriodRecord = {
      id: createId("period"),
      accountId: client.accountId,
      clientId,
      periodKey: input.periodKey,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      baselinePeriodId: input.baselinePeriodId,
      status: "draft",
      auditId: null,
      manualInputs: input.manualInputs,
      generatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into report_periods (id, account_id, client_id, period_key, period_start, period_end, baseline_period_id, status, audit_id, manual_inputs, generated_at, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportPeriod.id,
      reportPeriod.accountId,
      reportPeriod.clientId,
      reportPeriod.periodKey,
      reportPeriod.periodStart,
      reportPeriod.periodEnd,
      reportPeriod.baselinePeriodId,
      reportPeriod.status,
      reportPeriod.auditId,
      JSON.stringify(reportPeriod.manualInputs),
      reportPeriod.generatedAt,
      reportPeriod.createdAt,
      reportPeriod.updatedAt,
    );
    return reportPeriod;
  }

  async updateReportPeriod(
    id: string,
    patch: Partial<
      Pick<ReportPeriodRecord, "baselinePeriodId" | "status" | "auditId" | "manualInputs" | "generatedAt">
    >,
  ) {
    const current = await this.getReportPeriod(id);
    if (!current) return null;
    const next: ReportPeriodRecord = {
      ...current,
      ...patch,
      manualInputs: patch.manualInputs ?? current.manualInputs,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      update report_periods
      set baseline_period_id = ?, status = ?, audit_id = ?, manual_inputs = ?, generated_at = ?, updated_at = ?
      where id = ?
    `).run(
      next.baselinePeriodId,
      next.status,
      next.auditId,
      JSON.stringify(next.manualInputs),
      next.generatedAt,
      next.updatedAt,
      id,
    );
    return next;
  }

  async getContextEntry(id: string) {
    await this.ensureMigrated();
    const row = this.db.prepare("select * from context_entries where id = ?").get<Record<string, unknown>>(id);
    return row ? this.mapContextEntry(row) : null;
  }

  async listContextEntriesByReportPeriod(reportPeriodId: string) {
    await this.ensureMigrated();
    return this.db
      .prepare("select * from context_entries where report_period_id = ? order by created_at desc")
      .all<Record<string, unknown>>(reportPeriodId)
      .map((row) => this.mapContextEntry(row));
  }

  async createContextEntry(
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
      | "authorName"
      | "authorEmail"
    >,
  ) {
    await this.ensureMigrated();
    const reportPeriod = await this.getReportPeriod(reportPeriodId);
    if (!reportPeriod) {
      throw new Error(`Report period ${reportPeriodId} not found.`);
    }
    const now = new Date().toISOString();
    const entry: ContextEntryRecord = {
      id: createId("ctx"),
      accountId: reportPeriod.accountId,
      clientId: reportPeriod.clientId,
      reportPeriodId,
      channel: input.channel,
      source: input.source,
      campaignReference: input.campaignReference,
      entryType: input.entryType,
      text: input.text,
      tags: input.tags,
      effectiveStartDate: input.effectiveStartDate,
      effectiveEndDate: input.effectiveEndDate,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      insert into context_entries (id, account_id, client_id, report_period_id, channel, source, campaign_reference, entry_type, text, tags, effective_start_date, effective_end_date, author_name, author_email, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.accountId,
      entry.clientId,
      entry.reportPeriodId,
      entry.channel,
      entry.source,
      entry.campaignReference,
      entry.entryType,
      entry.text,
      JSON.stringify(entry.tags),
      entry.effectiveStartDate,
      entry.effectiveEndDate,
      entry.authorName,
      entry.authorEmail,
      entry.createdAt,
      entry.updatedAt,
    );
    return entry;
  }

  async deleteContextEntry(id: string) {
    await this.ensureMigrated();
    const current = await this.getContextEntry(id);
    if (!current) return null;
    this.db.prepare("delete from context_entries where id = ?").run(id);
    return current;
  }

  async createOAuthSession(input: Omit<OAuthSessionRecord, "createdAt">) {
    await this.ensureMigrated();
    const session: OAuthSessionRecord = {
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.db.prepare(`
      insert into oauth_sessions (id, account_id, client_id, platform_key, code_verifier, redirect_uri, scopes, created_at, expires_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.accountId,
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
      insert into audit_events (id, account_id, audit_id, level, code, message, detail, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.accountId,
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
      accountId: typeof input.payload["accountId"] === "string" ? String(input.payload["accountId"]) : "",
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
      insert into jobs (id, account_id, kind, status, payload, result, error_message, created_at, updated_at, started_at, completed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.accountId,
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
      const databaseUrl = process.env.DATABASE_URL?.trim();
      if (databaseUrl && /^postgres(ql)?:\/\//i.test(databaseUrl)) {
        const { PostgresStore } = await import("@/lib/postgres-store");
        const store = new PostgresStore(databaseUrl);
        await store.waitUntilReady();
        return store;
      }
      await mkdir(getAuditDataDir(), { recursive: true });
      return new SQLiteStore(getAuditDataFile("app.db"));
    })();
  }
  return storePromise;
}
