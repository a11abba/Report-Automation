export const platformTypes = [
  "messaging_automation",
  "crm",
  "commerce_pos",
  "search_visibility",
  "local_presence",
  "web_analytics",
  "website_intelligence",
  "paid_media",
] as const;

export const platformKeys = [
  "klaviyo",
  "hubspot",
  "pipedrive",
  "salesforce",
  "shopify",
  "square",
  "lightspeed",
  "clover",
  "google_search_console",
  "google_business_profile",
  "google_analytics",
  "google_ads",
  "microsoft_ads",
  "microsoft_merchant_center",
  "pagespeed_insights",
  "website_crawler",
  "meta_ads",
] as const;

export const auditCapabilities = [
  "campaign_analytics",
  "automation_inventory",
  "deliverability",
  "forms_segments",
  "event_tracking",
  "commerce_catalog",
  "orders_revenue",
  "crm_contacts_pipeline",
  "templates_assets",
  "search_performance",
  "local_profile_health",
  "local_reviews_reputation",
  "web_traffic_conversion",
  "site_performance",
  "technical_seo",
  "location_rollup",
  "paid_media_performance",
] as const;

export const findingSeverities = ["critical", "high", "medium", "low"] as const;
export const findingStatuses = ["failing", "passing", "watch", "info"] as const;
export const supportStates = [
  "supported",
  "not_supported",
  "not_available",
  "manual_review",
] as const;
export const integrationAuthOrigins = [
  "none",
  "api_key",
  "oauth",
  "service_account",
] as const;
export const appRoles = [
  "platform_admin",
  "account_admin",
  "account_operator",
  "account_user",
] as const;
export const accountMembershipStatuses = ["invited", "active", "revoked"] as const;
export const subscriptionStatuses = ["trialing", "active", "past_due", "paused", "canceled"] as const;
export const reportLanguages = ["pt-BR", "pt-PT", "en"] as const;
export const reportFocuses = [
  "full_funnel",
  "lifecycle_marketing",
  "seo_local",
  "paid_media",
] as const;
export const integrationConnectionStatuses = ["demo", "attention", "ready"] as const;
export const reportPeriodStatuses = ["draft", "queued", "running", "completed", "failed"] as const;
export const contextEntryTypes = [
  "note",
  "budget_change",
  "campaign_change",
  "landing_page",
  "tracking_issue",
  "sales_issue",
  "seo_change",
  "other",
] as const;
export const confidenceLevels = ["info", "warning"] as const;

export type PlatformType = (typeof platformTypes)[number];
export type PlatformKey = (typeof platformKeys)[number];
export type AuditCapability = (typeof auditCapabilities)[number];
export type FindingSeverity = (typeof findingSeverities)[number];
export type FindingStatus = (typeof findingStatuses)[number];
export type SupportState = (typeof supportStates)[number];
export type IntegrationAuthOrigin = (typeof integrationAuthOrigins)[number];
export type AppRole = (typeof appRoles)[number];
export type AccountMembershipStatus = (typeof accountMembershipStatuses)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type ReportLanguage = (typeof reportLanguages)[number];
export type ReportFocus = (typeof reportFocuses)[number];
export type IntegrationConnectionStatus = (typeof integrationConnectionStatuses)[number];
export type ReportPeriodStatus = (typeof reportPeriodStatuses)[number];
export type ContextEntryType = (typeof contextEntryTypes)[number];
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export type MetricUnit =
  | "count"
  | "percentage"
  | "currency"
  | "ratio"
  | "days"
  | "milliseconds"
  | "text";

export interface SourceEvidence {
  platformKey: PlatformKey;
  platformType: PlatformType;
  label: string;
  path: string;
  capturedAt: string;
  rawValue?: number | string | boolean | null;
}

export interface AuditedMetric {
  label: string;
  unit: MetricUnit;
  value: number | string | boolean | null;
  supportState: SupportState;
  evidence: SourceEvidence[];
}

export interface CampaignAnalyticsSection {
  supportState: SupportState;
  sentLast12Months: number;
  averagePerMonth: number;
  bestDay: string | null;
  worstDay: string | null;
  exclusionUsageRate: number | null;
  abTestCount: number;
  metrics: {
    openRate: AuditedMetric;
    clickRate: AuditedMetric;
    clickToOpenRate: AuditedMetric;
    bounceRate: AuditedMetric;
    spamComplaintRate: AuditedMetric;
    unsubscribeRate: AuditedMetric;
  };
}

export interface PaidMediaCampaignSnapshot {
  id: string;
  name: string;
  status: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
}

export interface PaidMediaSection {
  supportState: SupportState;
  adAccountId: string | null;
  accountCurrency: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
  topCampaigns: PaidMediaCampaignSnapshot[];
}

export interface AutomationFlowSnapshot {
  id: string;
  name: string;
  live: boolean;
  status: "live" | "manual" | "draft";
  triggerType: "metric" | "list_segment" | "date" | "other";
  emailCount: number;
  hasConditionalSplit: boolean;
  hasSpacingIssue: boolean;
  profile?:
    | "welcome"
    | "abandoned_cart"
    | "browse_abandonment"
    | "post_purchase"
    | "winback"
    | "back_in_stock"
    | "cross_sell"
    | "review_request"
    | "price_drop"
    | "replenishment"
    | "sunset"
    | "other";
  metrics: {
    openRate: number;
    clickRate: number;
    bounceRate: number;
    spamComplaintRate: number;
    unsubscribeRate: number;
  };
}

export interface AutomationSection {
  supportState: SupportState;
  liveCount: number;
  manualCount: number;
  distinctTriggerTypes: string[];
  requiredCoverageRate: number;
  missingFlowProfiles: string[];
  flows: AutomationFlowSnapshot[];
}

export interface AudienceSection {
  supportState: SupportState;
  liveForms: number;
  totalSegments: number;
  staleSegments: number;
  engagementSegments: number;
  zeroPartyFields: number;
}

export interface DeliverabilitySection {
  supportState: SupportState;
  bounceRate: number | null;
  spamComplaintRate: number | null;
  unsubscribeRate: number | null;
}

export interface EventsSection {
  supportState: SupportState;
  hasPlacedOrder: boolean;
  hasViewedProduct: boolean;
  customEventCount: number;
}

export interface RevenueSection {
  supportState: SupportState;
  totalRevenue: number | null;
  campaignRevenueShare: number | null;
  automationRevenueShare: number | null;
}

export interface ProductCatalogSection {
  supportState: SupportState;
  productCount: number;
  catalogConnected: boolean;
  healthySync: boolean;
}

export interface TemplateLibrarySection {
  supportState: SupportState;
  templateCount: number;
  staleTemplateCount: number;
}

export interface CRMSection {
  supportState: SupportState;
  contactCount: number;
  lifecycleStageCoverageRate: number;
  ownerCoverageRate: number;
  recentActivityRate: number;
  attributedSourceCount: number;
  engagementSegmentCount: number;
}

export interface CommerceSection {
  supportState: SupportState;
  orderCount: number;
  repeatCustomerRate: number;
  retentionSignalCount: number;
}

export interface SearchQuerySnapshot {
  term: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchPageSnapshot {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchSection {
  supportState: SupportState;
  property: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
  brandedShare: number | null;
  topQueries: SearchQuerySnapshot[];
  topPages: SearchPageSnapshot[];
}

export interface TrafficChannelSnapshot {
  channel: string;
  users: number;
  sessions: number;
  conversionRate: number;
  share: number;
}

export interface TrafficSourceMediumSnapshot {
  source: string;
  medium: string;
  sessions: number;
  pageViews: number;
  keyEvents: number;
  revenue: number;
  conversionRate: number;
  share: number;
}

export interface LandingPageSnapshot {
  path: string;
  sessions: number;
  engagementRate: number;
  conversionRate: number;
}

export interface TrafficAttributionSection {
  supportState: SupportState;
  property: string | null;
  users: number;
  sessions: number;
  engagementRate: number;
  conversionRate: number;
  topChannels: TrafficChannelSnapshot[];
  topSourceMediums: TrafficSourceMediumSnapshot[];
  topLandingPages: LandingPageSnapshot[];
}

export interface WebsiteSection {
  supportState: SupportState;
  targetUrl: string | null;
  pageSpeedScore: number | null;
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  interactionToNextPaintMs: number | null;
  pagesScanned: number;
  indexablePages: number;
  brokenLinkCount: number;
  titleCoverageRate: number | null;
  metaDescriptionCoverageRate: number | null;
  missingCanonicalCount: number;
  hasRobotsTxt: boolean | null;
  hasSitemapXml: boolean | null;
  notes: string[];
}

export interface ReputationSection {
  supportState: SupportState;
  averageRating: number | null;
  totalReviews: number;
  responseRate: number | null;
  unansweredReviews: number;
}

export interface LocationMetrics {
  clicks?: number | null;
  impressions?: number | null;
  users?: number | null;
  sessions?: number | null;
  averageRating?: number | null;
  reviewCount?: number | null;
  responseRate?: number | null;
  pageSpeedScore?: number | null;
}

export interface LocationSnapshot {
  locationId: string;
  label: string;
  businessProfileId: string | null;
  landingPageUrl: string | null;
  metrics: LocationMetrics;
  findings: string[];
}

export interface LocalPresenceSection {
  supportState: SupportState;
  accountName: string | null;
  locationCount: number;
  completedProfiles: number;
  averageCompletionRate: number | null;
  photoCoverageRate: number | null;
  postCoverageRate: number | null;
}

export interface IntegrationHealthSection {
  supportState: SupportState;
  connectedPlatformLabels: string[];
  activeIntegrationCount: number;
  webhookCount: number;
  healthyIntegrationCount: number;
}

export interface NormalizedBusinessSnapshot {
  clientId: string;
  clientName: string;
  generatedAt: string;
  platformLabels: string[];
  supportedCapabilities: AuditCapability[];
  sourceEvidence: SourceEvidence[];
  accountProfile: {
    industry: string;
    operatingModel: "single_source" | "composed_source";
    connectedPlatformTypes: PlatformType[];
    primaryDomain: string | null;
  };
  campaigns: CampaignAnalyticsSection | null;
  paidMedia: PaidMediaSection | null;
  automations: AutomationSection | null;
  audiences: AudienceSection | null;
  deliverability: DeliverabilitySection | null;
  events: EventsSection | null;
  revenue: RevenueSection | null;
  products: ProductCatalogSection | null;
  templatesAssets: TemplateLibrarySection | null;
  crm: CRMSection | null;
  commerce: CommerceSection | null;
  search: SearchSection | null;
  localPresence: LocalPresenceSection | null;
  reputation: ReputationSection | null;
  trafficAttribution: TrafficAttributionSection | null;
  website: WebsiteSection | null;
  locations: LocationSnapshot[];
  integrations: IntegrationHealthSection;
  operationalFlags: string[];
}

export interface AuditFinding {
  code: string;
  sectionKey: string;
  category:
    | "channel_performance"
    | "deliverability"
    | "automation_coverage"
    | "audience_capture"
    | "data_quality"
    | "integration_health"
    | "commerce_revenue_attribution"
    | "crm_lifecycle_health"
    | "seo_visibility"
    | "local_presence_health"
    | "reviews_reputation"
    | "website_performance"
    | "technical_seo"
    | "traffic_quality"
    | "paid_media_performance";
  section: string;
  severity: FindingSeverity;
  status: FindingStatus;
  severityLabel: string;
  statusLabel: string;
  params: Record<string, number | string | boolean | null>;
  summary: string;
  evidence: string[];
  recommendedAction: string;
  sourcePlatforms: PlatformKey[];
  supportState: SupportState;
}

export interface SectionScore {
  id: string;
  label: string;
  weight: number;
  score: number;
  findingCount: number;
}

export interface LocationScore {
  locationId: string;
  label: string;
  score: number;
  notes: string[];
}

export interface ReportPeriodManualInputs {
  leads: number | null;
  qualifiedLeads: number | null;
  sales: number | null;
  revenue: number | null;
  notes: string | null;
}

export interface ReportPeriodReference {
  id: string | null;
  periodKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  baselinePeriodId: string | null;
  baselinePeriodKey: string | null;
  manualInputs: ReportPeriodManualInputs | null;
}

export interface ReportNarrativeItem {
  title: string;
  detail: string;
  evidence: string[];
}

export interface ReportConfidenceNote {
  label: string;
  detail: string;
  level: ConfidenceLevel;
}

export const reportFrameworkStatuses = ["strong", "watch", "weak"] as const;
export type ReportFrameworkStatus = (typeof reportFrameworkStatuses)[number];

export interface ReportFrameworkPillar {
  key: "clear" | "concise" | "insightful" | "precise" | "actionable";
  label: string;
  status: ReportFrameworkStatus;
  detail: string;
}

export interface ReportFrameworkSections {
  executiveSummary: string;
  whatHappened: ReportNarrativeItem[];
  whyItHappened: ReportNarrativeItem[];
  whatWeAreDoing: ReportNarrativeItem[];
  ccipaPillars: ReportFrameworkPillar[];
}

export interface AuditReportPayload {
  accountId: string;
  auditId: string;
  clientId: string;
  clientName: string;
  clientIndustryLabel: string;
  reportFocus: ReportFocus;
  generatedAt: string;
  locale: ReportLanguage;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: {
    supportedSections: string[];
    topRisks: string[];
    strengths: string[];
    locationCount: number;
  };
  reportPeriod: ReportPeriodReference;
  execution: {
    includedIntegrations: Array<{
      id: string;
      label: string;
      platformKey: PlatformKey;
    }>;
    excludedIntegrations: Array<{
      id: string;
      label: string;
      platformKey: PlatformKey;
      reason: string;
    }>;
  };
  sectionScores: SectionScore[];
  locationScores: LocationScore[];
  findings: AuditFinding[];
  dataFacts: ReportNarrativeItem[];
  providedContext: ReportNarrativeItem[];
  hypotheses: ReportNarrativeItem[];
  recommendations: ReportNarrativeItem[];
  confidenceNotes: ReportConfidenceNote[];
  framework: ReportFrameworkSections;
  snapshot: NormalizedBusinessSnapshot;
}

export interface AccountRecord {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: SubscriptionStatus;
  serviceTier: string;
  billingCycleAnchor: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  locale: "en" | "pt";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountMembershipRecord {
  id: string;
  accountId: string;
  userId: string | null;
  invitedEmail: string;
  role: AppRole;
  status: AccountMembershipStatus;
  invitedByUserId: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientRecord {
  id: string;
  accountId: string;
  name: string;
  industry: string;
  industryLabelPt: string | null;
  operatingModel: "single_source" | "composed_source";
  primaryDomain: string | null;
  reportLanguage: ReportLanguage;
  reportFocus: ReportFocus;
  reportIntro: string | null;
  reportBenchmarks: string | null;
  referenceReportNotes: string | null;
  monthlyReportEnabled: boolean;
  monthlyReportDay: number | null;
  monthlyReportAutoGenerate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportMemoryRecord {
  id: string;
  accountId: string;
  title: string;
  sourceClientName: string | null;
  periodLabel: string | null;
  notes: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientReportMemoryLinkRecord {
  id: string;
  accountId: string;
  clientId: string;
  reportMemoryId: string;
  createdAt: string;
}

export const reportFeedbackRatings = ["approve", "revise", "reject"] as const;
export type ReportFeedbackRating = (typeof reportFeedbackRatings)[number];

export interface ReportFeedbackRecord {
  id: string;
  accountId: string;
  clientId: string;
  auditId: string;
  rating: ReportFeedbackRating;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationCredentials {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  secretRef?: string;
  expiresAt?: string | null;
  authOrigin?: IntegrationAuthOrigin;
  scopes?: string[];
  serviceAccountEmail?: string;
  accountHint?: string;
}

export interface ConnectorValidationResult {
  valid: boolean;
  mode: "demo" | "api";
  code: string;
  message: string;
  environmentConfigured: boolean;
  authenticated: boolean;
  resourceSelected: boolean;
  liveReady: boolean;
}

export interface ConnectorHealthCheckResult {
  ok: boolean;
  code: string;
  message: string;
}

export interface IntegrationPropertySummary {
  resourceName: string;
  propertyId: string;
  displayName: string;
  parentAccountName: string | null;
}

export interface ConnectorMetadataResult {
  propertySummaries?: IntegrationPropertySummary[];
  accountSummaries?: IntegrationPropertySummary[];
  locationSummaries?: IntegrationPropertySummary[];
}

export interface CredentialSecretPayload {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface OAuthSessionRecord {
  id: string;
  accountId: string;
  clientId: string;
  platformKey: PlatformKey;
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
}

export const auditEventLevels = ["info", "warn", "error"] as const;
export const jobKinds = ["audit_run", "location_sync", "report_export", "report_schedule"] as const;
export const jobStatuses = ["queued", "running", "completed", "failed"] as const;

export type AuditEventLevel = (typeof auditEventLevels)[number];
export type JobKind = (typeof jobKinds)[number];
export type JobStatus = (typeof jobStatuses)[number];

export interface IntegrationSettings {
  demoMode?: boolean;
  targetUrl?: string | null;
  propertyId?: string | null;
  businessAccountId?: string | null;
  businessProfileId?: string | null;
  ga4PropertyId?: string | null;
  adAccountId?: string | null;
  googleAdsCustomerId?: string | null;
  googleAdsLoginCustomerId?: string | null;
  microsoftCustomerId?: string | null;
  microsoftAccountId?: string | null;
  merchantStoreId?: string | null;
  merchantFeedId?: string | null;
  locationIds?: string[];
  extensionContext?: {
    detectedUrl?: string;
    platformHint?: string;
  };
}

export interface IntegrationRecord {
  id: string;
  accountId: string;
  clientId: string;
  platformKey: PlatformKey;
  platformType: PlatformType;
  displayName: string;
  credentials: IntegrationCredentials;
  settings: IntegrationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventRecord {
  id: string;
  accountId: string;
  auditId: string | null;
  level: AuditEventLevel;
  code: string;
  message: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  accountId: string;
  kind: JobKind;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AuditScope {
  integrationIds?: string[];
  locationIds?: string[];
  reportPeriodId?: string;
  baselinePeriodId?: string;
  periodKey?: string;
  periodStart?: string;
  periodEnd?: string;
  excludedIntegrations?: Array<{
    id: string;
    label: string;
    platformKey: PlatformKey;
    reason: string;
  }>;
  detectedContext?: {
    currentUrl?: string;
    platformDetected?: string;
    suggestedDomain?: string;
  };
}

export interface AuditRecord {
  id: string;
  accountId: string;
  clientId: string;
  integrationIds: string[];
  scope: AuditScope | null;
  status: "queued" | "running" | "completed" | "failed";
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface LocationRecord {
  id: string;
  accountId: string;
  clientId: string;
  integrationId: string | null;
  label: string;
  businessProfileId: string | null;
  landingPageUrl: string | null;
  metrics: LocationMetrics;
  findings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportPeriodRecord {
  id: string;
  accountId: string;
  clientId: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  baselinePeriodId: string | null;
  status: ReportPeriodStatus;
  auditId: string | null;
  manualInputs: ReportPeriodManualInputs;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContextEntryRecord {
  id: string;
  accountId: string;
  clientId: string;
  reportPeriodId: string;
  channel: string | null;
  source: string | null;
  campaignReference: string | null;
  entryType: ContextEntryType;
  text: string;
  tags: string[];
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformDefinition {
  key: PlatformKey;
  type: PlatformType;
  name: string;
  launchStage: "live" | "planned";
  capabilities: AuditCapability[];
  authModes: IntegrationAuthOrigin[];
  description: string;
}

export interface RulePackMetadata {
  id: string;
  name: string;
  version: string;
  families: AuditFinding["category"][];
  platformTypes: PlatformType[];
  capabilities: AuditCapability[];
}

export interface GoogleOAuthStartResult {
  authUrl: string;
  state: string;
  redirectUri: string;
  scopes: string[];
}
