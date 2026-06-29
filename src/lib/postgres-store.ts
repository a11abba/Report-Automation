import { access } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import type {
  AccountMembershipRecord,
  AccountRecord,
  AuditEventRecord,
  AuditRecord,
  AuditReportPayload,
  ClientReportMemoryLinkRecord,
  ClientRecord,
  ContextEntryRecord,
  IntegrationRecord,
  JobKind,
  JobRecord,
  JobStatus,
  LocationRecord,
  OAuthSessionRecord,
  ReportFeedbackRecord,
  ReportMemoryRecord,
  ReportPeriodRecord,
  UserRecord,
} from "@/lib/audit/types";
import { getAuditDataFile } from "@/lib/runtime-paths";
import type { AppStore } from "@/lib/storage";

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function slugify(input: string) {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "account"
  );
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

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class PostgresStore implements AppStore {
  private pool: Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
    this.ready = this.initialize();
  }

  async waitUntilReady() {
    await this.ready;
  }

  private async initialize() {
    await this.pool.query(`
      create table if not exists accounts (
        id text primary key,
        name text not null,
        slug text not null unique,
        subscription_status text not null,
        service_tier text not null,
        billing_cycle_anchor timestamptz null,
        trial_ends_at timestamptz null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists users (
        id text primary key,
        email text not null unique,
        name text not null,
        picture text null,
        locale text not null,
        last_login_at timestamptz null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists account_members (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        user_id text null references users(id) on delete set null,
        invited_email text not null,
        role text not null,
        status text not null,
        invited_by_user_id text null references users(id) on delete set null,
        activated_at timestamptz null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        unique (account_id, invited_email)
      );
      create table if not exists credential_secrets (
        secret_ref text primary key,
        payload text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists clients (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        name text not null,
        industry text not null,
        industry_label_pt text null,
        operating_model text not null,
        primary_domain text null,
        report_language text not null default 'pt-BR',
        report_focus text not null default 'full_funnel',
        report_intro text null,
        report_benchmarks text null,
        reference_report_notes text null,
        monthly_report_enabled boolean not null default false,
        monthly_report_day integer null,
        monthly_report_auto_generate boolean not null default true,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists integrations (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        platform_key text not null,
        platform_type text not null,
        display_name text not null,
        credentials jsonb not null,
        settings jsonb not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists locations (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        integration_id text null references integrations(id) on delete set null,
        label text not null,
        business_profile_id text null,
        landing_page_url text null,
        metrics jsonb not null,
        findings jsonb not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists audits (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        integration_ids jsonb not null,
        scope jsonb null,
        status text not null,
        score integer null,
        grade text null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        completed_at timestamptz null,
        error_message text null
      );
      create table if not exists report_periods (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        period_key text not null,
        period_start text not null,
        period_end text not null,
        baseline_period_id text null references report_periods(id) on delete set null,
        status text not null,
        audit_id text null references audits(id) on delete set null,
        manual_inputs jsonb not null,
        generated_at timestamptz null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        unique (client_id, period_key)
      );
      create table if not exists report_memories (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        title text not null,
        source_client_name text null,
        period_label text null,
        notes text null,
        content text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists client_report_memory_links (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        report_memory_id text not null references report_memories(id) on delete cascade,
        created_at timestamptz not null,
        unique (client_id, report_memory_id)
      );
      create table if not exists report_feedback (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        audit_id text not null references audits(id) on delete cascade,
        rating text not null,
        notes text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists context_entries (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        report_period_id text not null references report_periods(id) on delete cascade,
        channel text null,
        source text null,
        campaign_reference text null,
        entry_type text not null,
        text text not null,
        tags jsonb not null,
        effective_start_date text null,
        effective_end_date text null,
        author_name text not null,
        author_email text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists audit_reports (
        audit_id text primary key references audits(id) on delete cascade,
        payload jsonb not null
      );
      create table if not exists oauth_sessions (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        client_id text not null references clients(id) on delete cascade,
        platform_key text not null,
        code_verifier text not null,
        redirect_uri text not null,
        scopes jsonb not null,
        created_at timestamptz not null,
        expires_at timestamptz not null
      );
      create table if not exists audit_events (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        audit_id text null references audits(id) on delete cascade,
        level text not null,
        code text not null,
        message text not null,
        detail jsonb null,
        created_at timestamptz not null
      );
      create table if not exists jobs (
        id text primary key,
        account_id text not null references accounts(id) on delete cascade,
        kind text not null,
        status text not null,
        payload jsonb not null,
        result jsonb null,
        error_message text null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        started_at timestamptz null,
        completed_at timestamptz null
      );
    `);
    await this.pool.query(`
      alter table clients add column if not exists monthly_report_enabled boolean not null default false;
      alter table clients add column if not exists monthly_report_day integer null;
      alter table clients add column if not exists monthly_report_auto_generate boolean not null default true;
      alter table clients add column if not exists report_intro text null;
      alter table clients add column if not exists report_benchmarks text null;
      alter table clients add column if not exists reference_report_notes text null;
    `);

    await this.ensurePlatformAccount();
    await this.bootstrapFromLocalSqliteIfEmpty();
  }

  private async withClient<T>(callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
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

  private mapMembership(row: Record<string, unknown>): AccountMembershipRecord {
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

  private mapClient(row: Record<string, unknown>): ClientRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      name: String(row.name),
      industry: String(row.industry),
      industryLabelPt: (row.industry_label_pt as string | null) ?? null,
      operatingModel: row.operating_model as ClientRecord["operatingModel"],
      primaryDomain: (row.primary_domain as string | null) ?? null,
      reportLanguage: row.report_language as ClientRecord["reportLanguage"],
      reportFocus: row.report_focus as ClientRecord["reportFocus"],
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
      credentials: parseJson<IntegrationRecord["credentials"]>(row.credentials as string | IntegrationRecord["credentials"], {}),
      settings: parseJson<IntegrationRecord["settings"]>(row.settings as string | IntegrationRecord["settings"], {}),
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
      metrics: parseJson<LocationRecord["metrics"]>(row.metrics as string | LocationRecord["metrics"], {}),
      findings: parseJson<LocationRecord["findings"]>(row.findings as string | LocationRecord["findings"], []),
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
      manualInputs: parseJson<ReportPeriodRecord["manualInputs"]>(
        row.manual_inputs as string | ReportPeriodRecord["manualInputs"],
        {
          leads: null,
          qualifiedLeads: null,
          sales: null,
          revenue: null,
          notes: null,
        },
      ),
      generatedAt: (row.generated_at as string | null) ?? null,
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

  private mapClientReportMemoryLink(
    row: Record<string, unknown>,
  ): ClientReportMemoryLinkRecord {
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
      tags: parseJson<ContextEntryRecord["tags"]>(row.tags as string | ContextEntryRecord["tags"], []),
      effectiveStartDate: (row.effective_start_date as string | null) ?? null,
      effectiveEndDate: (row.effective_end_date as string | null) ?? null,
      authorName: String(row.author_name),
      authorEmail: String(row.author_email),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAudit(row: Record<string, unknown>): AuditRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      clientId: String(row.client_id),
      integrationIds: parseJson<AuditRecord["integrationIds"]>(row.integration_ids as string | AuditRecord["integrationIds"], []),
      scope: parseJson<AuditRecord["scope"]>(row.scope as string | AuditRecord["scope"], null),
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
      scopes: parseJson<OAuthSessionRecord["scopes"]>(row.scopes as string | OAuthSessionRecord["scopes"], []),
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
      detail: parseJson<AuditEventRecord["detail"]>(row.detail as string | AuditEventRecord["detail"], null),
      createdAt: String(row.created_at),
    };
  }

  private mapJob(row: Record<string, unknown>): JobRecord {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      kind: row.kind as JobKind,
      status: row.status as JobStatus,
      payload: parseJson<JobRecord["payload"]>(row.payload as string | JobRecord["payload"], {}),
      result: parseJson<JobRecord["result"]>(row.result as string | JobRecord["result"], null),
      errorMessage: (row.error_message as string | null) ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      startedAt: (row.started_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
    };
  }

  async ensurePlatformAccount() {
    const result = await this.pool.query("select * from accounts where slug = $1 limit 1", ["platform"]);
    if (result.rows[0]) {
      return this.mapAccount(result.rows[0]);
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
    await this.pool.query(
      `insert into accounts (id, name, slug, subscription_status, service_tier, billing_cycle_anchor, trial_ends_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        account.id,
        account.name,
        account.slug,
        account.subscriptionStatus,
        account.serviceTier,
        account.billingCycleAnchor,
        account.trialEndsAt,
        account.createdAt,
        account.updatedAt,
      ],
    );
    return account;
  }

  private async bootstrapFromLocalSqliteIfEmpty() {
    const countResult = await this.pool.query<{ count: string }>("select count(*)::text as count from clients");
    if (Number(countResult.rows[0]?.count ?? "0") > 0) {
      return;
    }

    try {
      await access(getAuditDataFile("app.db"));
    } catch {
      return;
    }

    const platformAccount = await this.ensurePlatformAccount();
    const sqlite = new DatabaseSync(getAuditDataFile("app.db"));
    const clientRows = sqlite.prepare("select * from clients").all<Record<string, unknown>>();
    if (clientRows.length === 0) {
      return;
    }

    await this.withClient(async (client) => {
      await client.query("begin");
      try {
        for (const row of clientRows) {
          await client.query(
            `insert into clients (
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
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             on conflict (id) do nothing`,
            [
              String(row.id),
              platformAccount.id,
              String(row.name),
              String(row.industry),
              (row.industry_label_pt as string | null) ?? null,
              row.operating_model,
              (row.primary_domain as string | null) ?? null,
              (row.report_language as string | null) ?? "pt-BR",
              (row.report_focus as string | null) ?? "full_funnel",
              (row.report_intro as string | null) ?? null,
              (row.report_benchmarks as string | null) ?? null,
              (row.reference_report_notes as string | null) ?? null,
              Boolean(row.monthly_report_enabled),
              row.monthly_report_day == null ? null : Number(row.monthly_report_day),
              row.monthly_report_auto_generate == null
                ? true
                : Boolean(row.monthly_report_auto_generate),
              String(row.created_at),
              String(row.updated_at),
            ],
          );
        }

        for (const row of sqlite.prepare("select * from integrations").all<Record<string, unknown>>()) {
          await client.query(
            `insert into integrations (id, account_id, client_id, platform_key, platform_type, display_name, credentials, settings, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)
             on conflict (id) do nothing`,
            [
              String(row.id),
              platformAccount.id,
              String(row.client_id),
              row.platform_key,
              row.platform_type,
              row.display_name,
              typeof row.credentials === "string" ? row.credentials : JSON.stringify(row.credentials ?? {}),
              typeof row.settings === "string" ? row.settings : JSON.stringify(row.settings ?? {}),
              row.created_at,
              row.updated_at,
            ],
          );
        }

        for (const row of sqlite.prepare("select * from locations").all<Record<string, unknown>>()) {
          await client.query(
            `insert into locations (id, account_id, client_id, integration_id, label, business_profile_id, landing_page_url, metrics, findings, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
             on conflict (id) do nothing`,
            [
              String(row.id),
              platformAccount.id,
              String(row.client_id),
              (row.integration_id as string | null) ?? null,
              row.label,
              (row.business_profile_id as string | null) ?? null,
              (row.landing_page_url as string | null) ?? null,
              typeof row.metrics === "string" ? row.metrics : JSON.stringify(row.metrics ?? {}),
              typeof row.findings === "string" ? row.findings : JSON.stringify(row.findings ?? []),
              row.created_at,
              row.updated_at,
            ],
          );
        }

        for (const row of sqlite.prepare("select * from audits").all<Record<string, unknown>>()) {
          await client.query(
            `insert into audits (id, account_id, client_id, integration_ids, scope, status, score, grade, created_at, updated_at, completed_at, error_message)
             values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)
             on conflict (id) do nothing`,
            [
              String(row.id),
              platformAccount.id,
              String(row.client_id),
              typeof row.integration_ids === "string" ? row.integration_ids : JSON.stringify(row.integration_ids ?? []),
              row.scope == null ? null : typeof row.scope === "string" ? row.scope : JSON.stringify(row.scope),
              row.status,
              row.score == null ? null : Number(row.score),
              (row.grade as string | null) ?? null,
              row.created_at,
              row.updated_at,
              (row.completed_at as string | null) ?? null,
              (row.error_message as string | null) ?? null,
            ],
          );
        }

        for (const row of sqlite.prepare("select * from audit_reports").all<Record<string, unknown>>()) {
          await client.query(
            `insert into audit_reports (audit_id, payload) values ($1,$2::jsonb)
             on conflict (audit_id) do nothing`,
            [
              String(row.audit_id),
              typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload),
            ],
          );
        }

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }

  async listAccounts() {
    const result = await this.pool.query("select * from accounts order by created_at asc");
    return result.rows.map((row) => this.mapAccount(row));
  }

  async getAccount(id: string) {
    const result = await this.pool.query("select * from accounts where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapAccount(result.rows[0]) : null;
  }

  async createAccount(input: Pick<AccountRecord, "name" | "subscriptionStatus" | "serviceTier" | "billingCycleAnchor" | "trialEndsAt">) {
    const now = new Date().toISOString();
    const baseSlug = slugify(input.name);
    let slug = baseSlug;
    let suffix = 2;
    while ((await this.pool.query("select 1 from accounts where slug = $1", [slug])).rows[0]) {
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
    await this.pool.query(
      `insert into accounts (id, name, slug, subscription_status, service_tier, billing_cycle_anchor, trial_ends_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [account.id, account.name, account.slug, account.subscriptionStatus, account.serviceTier, account.billingCycleAnchor, account.trialEndsAt, account.createdAt, account.updatedAt],
    );
    return account;
  }

  async updateAccount(id: string, patch: Partial<Pick<AccountRecord, "name" | "subscriptionStatus" | "serviceTier" | "billingCycleAnchor" | "trialEndsAt">>) {
    const current = await this.getAccount(id);
    if (!current) return null;
    const next: AccountRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `update accounts set name = $1, subscription_status = $2, service_tier = $3, billing_cycle_anchor = $4, trial_ends_at = $5, updated_at = $6 where id = $7`,
      [next.name, next.subscriptionStatus, next.serviceTier, next.billingCycleAnchor, next.trialEndsAt, next.updatedAt, id],
    );
    return next;
  }

  async getUser(id: string) {
    const result = await this.pool.query("select * from users where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async getUserByEmail(email: string) {
    const result = await this.pool.query("select * from users where lower(email) = lower($1) limit 1", [email]);
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async upsertUser(input: { email: string; name: string; picture: string | null; locale: UserRecord["locale"] }) {
    const current = await this.getUserByEmail(input.email);
    const now = new Date().toISOString();
    if (current) {
      const next: UserRecord = { ...current, name: input.name, picture: input.picture, locale: input.locale, lastLoginAt: now, updatedAt: now };
      await this.pool.query(
        `update users set name = $1, picture = $2, locale = $3, last_login_at = $4, updated_at = $5 where id = $6`,
        [next.name, next.picture, next.locale, next.lastLoginAt, next.updatedAt, next.id],
      );
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
    await this.pool.query(
      `insert into users (id, email, name, picture, locale, last_login_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [user.id, user.email, user.name, user.picture, user.locale, user.lastLoginAt, user.createdAt, user.updatedAt],
    );
    return user;
  }

  async listAccountMemberships(accountId: string) {
    const result = await this.pool.query("select * from account_members where account_id = $1 order by created_at asc", [accountId]);
    return result.rows.map((row) => this.mapMembership(row));
  }

  async getMembership(id: string) {
    const result = await this.pool.query("select * from account_members where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapMembership(result.rows[0]) : null;
  }

  async getMembershipsForEmail(email: string) {
    const result = await this.pool.query("select * from account_members where lower(invited_email) = lower($1) order by created_at asc", [email]);
    return result.rows.map((row) => this.mapMembership(row));
  }

  async inviteAccountUser(input: { accountId: string; invitedEmail: string; role: AccountMembershipRecord["role"]; invitedByUserId: string | null }) {
    const existing = await this.pool.query("select * from account_members where account_id = $1 and lower(invited_email) = lower($2) limit 1", [input.accountId, input.invitedEmail]);
    if (existing.rows[0]) return this.mapMembership(existing.rows[0]);
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
    await this.pool.query(
      `insert into account_members (id, account_id, user_id, invited_email, role, status, invited_by_user_id, activated_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [membership.id, membership.accountId, membership.userId, membership.invitedEmail, membership.role, membership.status, membership.invitedByUserId, membership.activatedAt, membership.createdAt, membership.updatedAt],
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
    await this.pool.query(
      `update account_members set user_id = $1, status = $2, activated_at = $3, updated_at = $4 where id = $5`,
      [next.userId, next.status, next.activatedAt, next.updatedAt, id],
    );
    return next;
  }

  async storeSecret(secretRef: string, payload: string) {
    const now = new Date().toISOString();
    await this.pool.query(
      `insert into credential_secrets (secret_ref, payload, created_at, updated_at)
       values ($1,$2,$3,$4)
       on conflict (secret_ref) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
      [secretRef, payload, now, now],
    );
  }

  async readSecret(secretRef: string) {
    const result = await this.pool.query<{ payload: string }>("select payload from credential_secrets where secret_ref = $1 limit 1", [secretRef]);
    return result.rows[0]?.payload ?? null;
  }

  async deleteSecret(secretRef: string) {
    await this.pool.query("delete from credential_secrets where secret_ref = $1", [secretRef]);
  }

  async listClients() {
    const result = await this.pool.query("select * from clients order by created_at desc");
    return result.rows.map((row) => this.mapClient(row));
  }

  async getClient(id: string) {
    const result = await this.pool.query("select * from clients where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapClient(result.rows[0]) : null;
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
    const now = new Date().toISOString();
    const clientRecord: ClientRecord = {
      id: createId("client"),
      accountId,
      ...input,
      monthlyReportEnabled: false,
      monthlyReportDay: null,
      monthlyReportAutoGenerate: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.pool.query(
      `insert into clients (
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
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [clientRecord.id, clientRecord.accountId, clientRecord.name, clientRecord.industry, clientRecord.industryLabelPt, clientRecord.operatingModel, clientRecord.primaryDomain, clientRecord.reportLanguage, clientRecord.reportFocus, clientRecord.reportIntro, clientRecord.reportBenchmarks, clientRecord.referenceReportNotes, clientRecord.monthlyReportEnabled, clientRecord.monthlyReportDay, clientRecord.monthlyReportAutoGenerate, clientRecord.createdAt, clientRecord.updatedAt],
    );
    return clientRecord;
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
    const next: ClientRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `update clients set name = $1, industry = $2, industry_label_pt = $3, operating_model = $4, primary_domain = $5, report_language = $6, report_focus = $7, report_intro = $8, report_benchmarks = $9, reference_report_notes = $10, monthly_report_enabled = $11, monthly_report_day = $12, monthly_report_auto_generate = $13, updated_at = $14 where id = $15`,
      [next.name, next.industry, next.industryLabelPt, next.operatingModel, next.primaryDomain, next.reportLanguage, next.reportFocus, next.reportIntro, next.reportBenchmarks, next.referenceReportNotes, next.monthlyReportEnabled, next.monthlyReportDay, next.monthlyReportAutoGenerate, next.updatedAt, id],
    );
    return next;
  }

  async listReportMemories(accountId?: string) {
    const result = accountId
      ? await this.pool.query(
          "select * from report_memories where account_id = $1 order by created_at desc",
          [accountId],
        )
      : await this.pool.query("select * from report_memories order by created_at desc");
    return result.rows.map((row) => this.mapReportMemory(row));
  }

  async getReportMemory(id: string) {
    const result = await this.pool.query(
      "select * from report_memories where id = $1 limit 1",
      [id],
    );
    return result.rows[0] ? this.mapReportMemory(result.rows[0]) : null;
  }

  async createReportMemory(
    accountId: string,
    input: Pick<
      ReportMemoryRecord,
      "title" | "sourceClientName" | "periodLabel" | "notes" | "content"
    >,
  ) {
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
    await this.pool.query(
      `insert into report_memories (id, account_id, title, source_client_name, period_label, notes, content, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        memory.id,
        memory.accountId,
        memory.title,
        memory.sourceClientName,
        memory.periodLabel,
        memory.notes,
        memory.content,
        memory.createdAt,
        memory.updatedAt,
      ],
    );
    return memory;
  }

  async deleteReportMemory(id: string) {
    const current = await this.getReportMemory(id);
    if (!current) return null;
    await this.pool.query("delete from client_report_memory_links where report_memory_id = $1", [
      id,
    ]);
    await this.pool.query("delete from report_memories where id = $1", [id]);
    return current;
  }

  async listClientReportMemoryLinks(clientId: string) {
    const result = await this.pool.query(
      "select * from client_report_memory_links where client_id = $1 order by created_at desc",
      [clientId],
    );
    return result.rows.map((row) => this.mapClientReportMemoryLink(row));
  }

  async listReportMemoriesByClient(clientId: string) {
    const result = await this.pool.query(
      `select rm.*
       from report_memories rm
       inner join client_report_memory_links links on links.report_memory_id = rm.id
       where links.client_id = $1
       order by links.created_at desc`,
      [clientId],
    );
    return result.rows.map((row) => this.mapReportMemory(row));
  }

  async attachReportMemoryToClient(clientId: string, reportMemoryId: string) {
    const client = await this.getClient(clientId);
    const memory = await this.getReportMemory(reportMemoryId);
    if (!client || !memory) {
      throw new Error("Client or report memory not found.");
    }
    if (client.accountId !== memory.accountId) {
      throw new Error("Report memory and client must belong to the same account.");
    }
    const existing = await this.pool.query(
      "select * from client_report_memory_links where client_id = $1 and report_memory_id = $2 limit 1",
      [clientId, reportMemoryId],
    );
    if (existing.rows[0]) {
      return this.mapClientReportMemoryLink(existing.rows[0]);
    }
    const link: ClientReportMemoryLinkRecord = {
      id: createId("memory_link"),
      accountId: client.accountId,
      clientId,
      reportMemoryId,
      createdAt: new Date().toISOString(),
    };
    await this.pool.query(
      `insert into client_report_memory_links (id, account_id, client_id, report_memory_id, created_at)
       values ($1,$2,$3,$4,$5)`,
      [link.id, link.accountId, link.clientId, link.reportMemoryId, link.createdAt],
    );
    return link;
  }

  async detachReportMemoryFromClient(clientId: string, reportMemoryId: string) {
    await this.pool.query(
      "delete from client_report_memory_links where client_id = $1 and report_memory_id = $2",
      [clientId, reportMemoryId],
    );
  }

  async listReportFeedbackByClient(clientId: string) {
    const result = await this.pool.query(
      "select * from report_feedback where client_id = $1 order by created_at desc",
      [clientId],
    );
    return result.rows.map((row) => this.mapReportFeedback(row));
  }

  async listReportFeedbackByAudit(auditId: string) {
    const result = await this.pool.query(
      "select * from report_feedback where audit_id = $1 order by created_at desc",
      [auditId],
    );
    return result.rows.map((row) => this.mapReportFeedback(row));
  }

  async createReportFeedback(
    auditId: string,
    input: Pick<ReportFeedbackRecord, "rating" | "notes">,
  ) {
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
    await this.pool.query(
      `insert into report_feedback (id, account_id, client_id, audit_id, rating, notes, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        feedback.id,
        feedback.accountId,
        feedback.clientId,
        feedback.auditId,
        feedback.rating,
        feedback.notes,
        feedback.createdAt,
        feedback.updatedAt,
      ],
    );
    return feedback;
  }

  async deleteClient(id: string) {
    const current = await this.getClient(id);
    if (!current) return null;
    await this.pool.query("delete from clients where id = $1", [id]);
    return current;
  }

  async listIntegrationsByClient(clientId: string) {
    const result = await this.pool.query("select * from integrations where client_id = $1 order by created_at asc", [clientId]);
    return result.rows.map((row) => this.mapIntegration(row));
  }

  async getIntegration(id: string) {
    const result = await this.pool.query("select * from integrations where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapIntegration(result.rows[0]) : null;
  }

  async createIntegration(clientId: string, input: Pick<IntegrationRecord, "platformKey" | "platformType" | "displayName" | "credentials" | "settings">) {
    const clientRecord = await this.getClient(clientId);
    if (!clientRecord) throw new Error(`Client ${clientId} not found.`);
    const now = new Date().toISOString();
    const integration: IntegrationRecord = {
      id: createId("int"),
      accountId: clientRecord.accountId,
      clientId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await this.pool.query(
      `insert into integrations (id, account_id, client_id, platform_key, platform_type, display_name, credentials, settings, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
      [integration.id, integration.accountId, integration.clientId, integration.platformKey, integration.platformType, integration.displayName, JSON.stringify(integration.credentials), JSON.stringify(integration.settings), integration.createdAt, integration.updatedAt],
    );
    return integration;
  }

  async updateIntegration(id: string, patch: Partial<Pick<IntegrationRecord, "displayName" | "credentials" | "settings">>) {
    const current = await this.getIntegration(id);
    if (!current) return null;
    const next: IntegrationRecord = {
      ...current,
      ...patch,
      displayName: patch.displayName ?? current.displayName,
      credentials: patch.credentials ?? current.credentials,
      settings: patch.settings ? { ...current.settings, ...patch.settings } : current.settings,
      updatedAt: new Date().toISOString(),
    };
    await this.pool.query(
      `update integrations set display_name = $1, credentials = $2::jsonb, settings = $3::jsonb, updated_at = $4 where id = $5`,
      [next.displayName, JSON.stringify(next.credentials), JSON.stringify(next.settings), next.updatedAt, id],
    );
    return next;
  }

  async deleteIntegration(id: string) {
    const current = await this.getIntegration(id);
    if (!current) return null;
    await this.pool.query("delete from integrations where id = $1", [id]);
    return current;
  }

  async listLocationsByClient(clientId: string) {
    const result = await this.pool.query("select * from locations where client_id = $1 order by created_at asc", [clientId]);
    return result.rows.map((row) => this.mapLocation(row));
  }

  async upsertLocations(clientId: string, locations: Omit<LocationRecord, "createdAt" | "updatedAt">[]) {
    const current = await this.listLocationsByClient(clientId);
    await this.pool.query("delete from locations where client_id = $1", [clientId]);
    const now = new Date().toISOString();
    for (const location of locations) {
      const found = current.find((item) => item.id === location.id);
      await this.pool.query(
        `insert into locations (id, account_id, client_id, integration_id, label, business_profile_id, landing_page_url, metrics, findings, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
        [location.id, location.accountId, location.clientId, location.integrationId, location.label, location.businessProfileId, location.landingPageUrl, JSON.stringify(location.metrics), JSON.stringify(location.findings), found?.createdAt ?? now, now],
      );
    }
    return this.listLocationsByClient(clientId);
  }

  async listAudits() {
    const result = await this.pool.query("select * from audits order by created_at desc");
    return result.rows.map((row) => this.mapAudit(row));
  }

  async listAuditsByClient(clientId: string) {
    const result = await this.pool.query("select * from audits where client_id = $1 order by created_at desc", [clientId]);
    return result.rows.map((row) => this.mapAudit(row));
  }

  async getAudit(id: string) {
    const result = await this.pool.query("select * from audits where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapAudit(result.rows[0]) : null;
  }

  async createAudit(input: Pick<AuditRecord, "clientId" | "integrationIds" | "scope">) {
    const clientRecord = await this.getClient(input.clientId);
    if (!clientRecord) throw new Error(`Client ${input.clientId} not found.`);
    const now = new Date().toISOString();
    const audit: AuditRecord = {
      id: createId("audit"),
      accountId: clientRecord.accountId,
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
    await this.pool.query(
      `insert into audits (id, account_id, client_id, integration_ids, scope, status, score, grade, created_at, updated_at, completed_at, error_message)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)`,
      [audit.id, audit.accountId, audit.clientId, JSON.stringify(audit.integrationIds), audit.scope ? JSON.stringify(audit.scope) : null, audit.status, audit.score, audit.grade, audit.createdAt, audit.updatedAt, audit.completedAt, audit.errorMessage],
    );
    return audit;
  }

  async updateAudit(id: string, patch: Partial<AuditRecord>) {
    const current = await this.getAudit(id);
    if (!current) return null;
    const next: AuditRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `update audits set integration_ids = $1::jsonb, scope = $2::jsonb, status = $3, score = $4, grade = $5, updated_at = $6, completed_at = $7, error_message = $8 where id = $9`,
      [JSON.stringify(next.integrationIds), next.scope ? JSON.stringify(next.scope) : null, next.status, next.score, next.grade, next.updatedAt, next.completedAt, next.errorMessage, id],
    );
    return next;
  }

  async claimQueuedAudit(id: string) {
    const now = new Date().toISOString();
    const result = await this.pool.query(
      "update audits set status = 'running', updated_at = $1, error_message = null where id = $2 and status = 'queued' returning id",
      [now, id],
    );
    return result.rowCount ? this.getAudit(id) : null;
  }

  async cancelQueuedAudit(id: string) {
    const now = new Date().toISOString();
    const result = await this.pool.query(
      "update audits set status = 'canceled', updated_at = $1, completed_at = $1, error_message = null where id = $2 and status = 'queued' returning id",
      [now, id],
    );
    return result.rowCount ? this.getAudit(id) : null;
  }

  async saveReport(auditId: string, report: AuditReportPayload) {
    await this.pool.query(
      `insert into audit_reports (audit_id, payload) values ($1,$2::jsonb)
       on conflict (audit_id) do update set payload = excluded.payload`,
      [auditId, JSON.stringify(report)],
    );
  }

  async getReport(auditId: string) {
    const result = await this.pool.query<{ payload: AuditReportPayload }>("select payload from audit_reports where audit_id = $1 limit 1", [auditId]);
    return result.rows[0]?.payload ? hydrateReport(result.rows[0].payload) : null;
  }

  async listReportPeriodsByClient(clientId: string) {
    const result = await this.pool.query(
      "select * from report_periods where client_id = $1 order by period_start desc, created_at desc",
      [clientId],
    );
    return result.rows.map((row) => this.mapReportPeriod(row));
  }

  async getReportPeriod(id: string) {
    const result = await this.pool.query("select * from report_periods where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapReportPeriod(result.rows[0]) : null;
  }

  async createReportPeriod(
    clientId: string,
    input: Pick<
      ReportPeriodRecord,
      "periodKey" | "periodStart" | "periodEnd" | "baselinePeriodId" | "manualInputs"
    >,
  ) {
    const clientRecord = await this.getClient(clientId);
    if (!clientRecord) throw new Error(`Client ${clientId} not found.`);
    const duplicate = await this.pool.query(
      "select 1 from report_periods where client_id = $1 and period_key = $2 limit 1",
      [clientId, input.periodKey],
    );
    if (duplicate.rows[0]) {
      throw new Error(`A monthly report period already exists for ${input.periodKey}.`);
    }
    const now = new Date().toISOString();
    const reportPeriod: ReportPeriodRecord = {
      id: createId("period"),
      accountId: clientRecord.accountId,
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
    await this.pool.query(
      `insert into report_periods (id, account_id, client_id, period_key, period_start, period_end, baseline_period_id, status, audit_id, manual_inputs, generated_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
      [
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
      ],
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
    await this.pool.query(
      `update report_periods
       set baseline_period_id = $1, status = $2, audit_id = $3, manual_inputs = $4::jsonb, generated_at = $5, updated_at = $6
       where id = $7`,
      [
        next.baselinePeriodId,
        next.status,
        next.auditId,
        JSON.stringify(next.manualInputs),
        next.generatedAt,
        next.updatedAt,
        id,
      ],
    );
    return next;
  }

  async getContextEntry(id: string) {
    const result = await this.pool.query("select * from context_entries where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapContextEntry(result.rows[0]) : null;
  }

  async listContextEntriesByReportPeriod(reportPeriodId: string) {
    const result = await this.pool.query(
      "select * from context_entries where report_period_id = $1 order by created_at desc",
      [reportPeriodId],
    );
    return result.rows.map((row) => this.mapContextEntry(row));
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
    const reportPeriod = await this.getReportPeriod(reportPeriodId);
    if (!reportPeriod) throw new Error(`Report period ${reportPeriodId} not found.`);
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
    await this.pool.query(
      `insert into context_entries (id, account_id, client_id, report_period_id, channel, source, campaign_reference, entry_type, text, tags, effective_start_date, effective_end_date, author_name, author_email, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16)`,
      [
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
      ],
    );
    return entry;
  }

  async deleteContextEntry(id: string) {
    const current = await this.getContextEntry(id);
    if (!current) return null;
    await this.pool.query("delete from context_entries where id = $1", [id]);
    return current;
  }

  async createOAuthSession(input: Omit<OAuthSessionRecord, "createdAt">) {
    const session: OAuthSessionRecord = { ...input, createdAt: new Date().toISOString() };
    await this.pool.query(
      `insert into oauth_sessions (id, account_id, client_id, platform_key, code_verifier, redirect_uri, scopes, created_at, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [session.id, session.accountId, session.clientId, session.platformKey, session.codeVerifier, session.redirectUri, JSON.stringify(session.scopes), session.createdAt, session.expiresAt],
    );
    return session;
  }

  async getOAuthSession(id: string) {
    const result = await this.pool.query("select * from oauth_sessions where id = $1 limit 1", [id]);
    return result.rows[0] ? this.mapOAuthSession(result.rows[0]) : null;
  }

  async deleteOAuthSession(id: string) {
    await this.pool.query("delete from oauth_sessions where id = $1", [id]);
  }

  async appendAuditEvent(input: Omit<AuditEventRecord, "id" | "createdAt">) {
    const event: AuditEventRecord = { ...input, id: createId("evt"), createdAt: new Date().toISOString() };
    await this.pool.query(
      `insert into audit_events (id, account_id, audit_id, level, code, message, detail, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [event.id, event.accountId, event.auditId, event.level, event.code, event.message, JSON.stringify(event.detail), event.createdAt],
    );
    return event;
  }

  async listAuditEvents(auditId: string) {
    const result = await this.pool.query("select * from audit_events where audit_id = $1 order by created_at asc", [auditId]);
    return result.rows.map((row) => this.mapAuditEvent(row));
  }

  async createJob(input: { kind: JobKind; payload: Record<string, unknown> }) {
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
    await this.pool.query(
      `insert into jobs (id, account_id, kind, status, payload, result, error_message, created_at, updated_at, started_at, completed_at)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`,
      [job.id, job.accountId, job.kind, job.status, JSON.stringify(job.payload), JSON.stringify(job.result), job.errorMessage, job.createdAt, job.updatedAt, job.startedAt, job.completedAt],
    );
    return job;
  }

  async updateJob(id: string, patch: Partial<Pick<JobRecord, "status" | "result" | "errorMessage" | "startedAt" | "completedAt">>) {
    const current = (await this.listJobs()).find((job) => job.id === id);
    if (!current) return null;
    const next: JobRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `update jobs set status = $1, result = $2::jsonb, error_message = $3, updated_at = $4, started_at = $5, completed_at = $6 where id = $7`,
      [next.status, JSON.stringify(next.result), next.errorMessage, next.updatedAt, next.startedAt, next.completedAt, id],
    );
    return next;
  }

  async listJobs(filter?: { kind?: JobKind; status?: JobStatus }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.kind) {
      params.push(filter.kind);
      conditions.push(`kind = $${params.length}`);
    }
    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    const query = `select * from jobs${conditions.length ? ` where ${conditions.join(" and ")}` : ""} order by created_at desc`;
    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.mapJob(row));
  }
}
