import {
  type AuditCapability,
  type ClientRecord,
  type ConnectorHealthCheckResult,
  type ConnectorMetadataResult,
  type ConnectorValidationResult,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformDefinition,
  type PlatformKey,
  type PlatformType,
  type SourceEvidence,
  type SupportState,
} from "@/lib/audit/types";
import {
  GoogleAnalyticsConnector,
  GoogleBusinessProfileConnector,
  GoogleSearchConsoleConnector,
} from "./google-connectors";
import {
  HubSpotConnector,
  KlaviyoConnector,
  ShopifyConnector,
} from "./legacy-connectors";
import { MetaAdsConnector } from "./meta-connectors";
import {
  MicrosoftAdsConnector,
  MicrosoftMerchantCenterConnector,
} from "./microsoft-connectors";
import {
  PageSpeedConnector,
  WebsiteCrawlerConnector,
} from "./website-connectors";

export interface ConnectorContext {
  client: ClientRecord;
  integration: IntegrationRecord;
  requestedCapabilities: AuditCapability[];
}

export interface PlatformConnector {
  key: PlatformKey;
  platformType(): PlatformType;
  capabilities(): AuditCapability[];
  validateCredentials(integration: IntegrationRecord): Promise<ConnectorValidationResult>;
  discoverMetadata?(context: ConnectorContext): Promise<ConnectorMetadataResult>;
  healthCheck?(integration: IntegrationRecord): Promise<ConnectorHealthCheckResult>;
  fetchSnapshot(context: ConnectorContext): Promise<NormalizedBusinessSnapshot>;
}

export function nowEvidence(
  platformKey: PlatformKey,
  platformType: PlatformType,
  label: string,
  path: string,
  rawValue?: number | string | boolean | null,
): SourceEvidence {
  return {
    platformKey,
    platformType,
    label,
    path,
    capturedAt: new Date().toISOString(),
    rawValue,
  };
}

export function withSupport<T extends object>(
  supportState: SupportState,
  data: T,
): T & { supportState: SupportState } {
  return { supportState, ...data };
}

export function getTargetUrl(client: ClientRecord, integration: IntegrationRecord) {
  return integration.settings.targetUrl ?? client.primaryDomain ?? null;
}

export function labelForPlatform(platformKey: PlatformKey): string {
  return platformCatalog.find((item) => item.key === platformKey)?.name ?? platformKey;
}

export function baseSnapshot(
  client: ClientRecord,
  platformKey: PlatformKey,
  platformType: PlatformType,
  capabilities: AuditCapability[],
): NormalizedBusinessSnapshot {
  const platformName = labelForPlatform(platformKey);
  return {
    clientId: client.id,
    clientName: client.name,
    generatedAt: new Date().toISOString(),
    platformLabels: [platformName],
    supportedCapabilities: capabilities,
    sourceEvidence: [
      nowEvidence(platformKey, platformType, `${platformName} account`, "account", client.name),
    ],
    accountProfile: {
      industry: client.industry,
      operatingModel: client.operatingModel,
      connectedPlatformTypes: [platformType],
      primaryDomain: client.primaryDomain ?? null,
    },
    campaigns: null,
    paidMedia: null,
    automations: null,
    audiences: null,
    deliverability: null,
    events: null,
    revenue: null,
    products: null,
    templatesAssets: null,
    crm: null,
    commerce: null,
    search: null,
    localPresence: null,
    reputation: null,
    trafficAttribution: null,
    website: null,
    locations: [],
    integrations: {
      supportState: "supported",
      connectedPlatformLabels: [platformName],
      activeIntegrationCount: 1,
      webhookCount: 1,
      healthyIntegrationCount: 1,
    },
    operationalFlags: [],
  };
}

const connectors: Record<PlatformKey, PlatformConnector> = {
  klaviyo: new KlaviyoConnector(),
  hubspot: new HubSpotConnector(),
  pipedrive: new HubSpotConnector("pipedrive"),
  salesforce: new HubSpotConnector("salesforce"),
  shopify: new ShopifyConnector(),
  square: new ShopifyConnector("square"),
  lightspeed: new ShopifyConnector("lightspeed"),
  clover: new ShopifyConnector("clover"),
  google_search_console: new GoogleSearchConsoleConnector(),
  google_business_profile: new GoogleBusinessProfileConnector(),
  google_analytics: new GoogleAnalyticsConnector(),
  microsoft_ads: new MicrosoftAdsConnector(),
  microsoft_merchant_center: new MicrosoftMerchantCenterConnector(),
  pagespeed_insights: new PageSpeedConnector(),
  website_crawler: new WebsiteCrawlerConnector(),
  meta_ads: new MetaAdsConnector(),
};

export const platformCatalog: PlatformDefinition[] = [
  {
    key: "klaviyo",
    type: "messaging_automation",
    name: "Klaviyo",
    launchStage: "live",
    capabilities: connectors.klaviyo.capabilities(),
    authModes: ["api_key", "oauth", "none"],
    description: "Email and SMS automation audits with campaign, flow, and deliverability logic.",
  },
  {
    key: "hubspot",
    type: "crm",
    name: "HubSpot",
    launchStage: "planned",
    capabilities: connectors.hubspot.capabilities(),
    authModes: ["api_key", "oauth", "none"],
    description: "CRM health, lifecycle, owner coverage, and source attribution audits.",
  },
  {
    key: "shopify",
    type: "commerce_pos",
    name: "Shopify",
    launchStage: "planned",
    capabilities: connectors.shopify.capabilities(),
    authModes: ["api_key", "oauth", "none"],
    description: "Catalog, order, retention, and commerce integration health audits.",
  },
  {
    key: "google_search_console",
    type: "search_visibility",
    name: "Google Search Console",
    launchStage: "live",
    capabilities: connectors.google_search_console.capabilities(),
    authModes: ["oauth", "service_account", "none"],
    description: "Organic search visibility, queries, pages, and location-aware search performance.",
  },
  {
    key: "google_business_profile",
    type: "local_presence",
    name: "Google Business Profile",
    launchStage: "live",
    capabilities: connectors.google_business_profile.capabilities(),
    authModes: ["oauth", "none"],
    description: "Local presence, profile completeness, reviews, and multi-location health.",
  },
  {
    key: "google_analytics",
    type: "web_analytics",
    name: "Google Analytics 4",
    launchStage: "live",
    capabilities: connectors.google_analytics.capabilities(),
    authModes: ["oauth", "service_account", "none"],
    description: "Traffic quality, channel mix, landing pages, and conversion performance.",
  },
  {
    key: "microsoft_ads",
    type: "paid_media",
    name: "Microsoft Ads",
    launchStage: "live",
    capabilities: connectors.microsoft_ads.capabilities(),
    authModes: ["oauth", "none"],
    description: "Paid media account connection for Microsoft Advertising customer and account level diagnostics.",
  },
  {
    key: "microsoft_merchant_center",
    type: "commerce_pos",
    name: "Microsoft Merchant Center",
    launchStage: "live",
    capabilities: connectors.microsoft_merchant_center.capabilities(),
    authModes: ["oauth", "none"],
    description: "Merchant Center catalog connection for Microsoft store, feed, and product health diagnostics.",
  },
  {
    key: "meta_ads",
    type: "paid_media",
    name: "Meta Ads",
    launchStage: "live",
    capabilities: connectors.meta_ads.capabilities(),
    authModes: ["api_key", "oauth"],
    description: "Paid media reporting for Facebook and Instagram campaigns with spend, conversion, and ROAS diagnostics.",
  },
  {
    key: "pagespeed_insights",
    type: "website_intelligence",
    name: "PageSpeed Insights",
    launchStage: "live",
    capabilities: connectors.pagespeed_insights.capabilities(),
    authModes: ["none"],
    description: "Core Web Vitals and performance diagnostics for priority pages.",
  },
  {
    key: "website_crawler",
    type: "website_intelligence",
    name: "Website Crawler",
    launchStage: "live",
    capabilities: connectors.website_crawler.capabilities(),
    authModes: ["none"],
    description: "Technical SEO crawl with titles, metas, canonicals, robots, sitemap, and crawl notes.",
  },
];

export function getConnector(platformKey: PlatformKey): PlatformConnector {
  return connectors[platformKey];
}

export function mergeSnapshots(
  client: ClientRecord,
  snapshots: NormalizedBusinessSnapshot[],
): NormalizedBusinessSnapshot {
  const first = snapshots[0];
  if (!first) {
    throw new Error("At least one snapshot is required to build an audit.");
  }

  const locationMap = new Map<string, NormalizedBusinessSnapshot["locations"][number]>();
  for (const snapshot of snapshots) {
    for (const location of snapshot.locations) {
      const existing = locationMap.get(location.locationId);
      locationMap.set(location.locationId, existing
        ? {
            locationId: location.locationId,
            label: existing.label || location.label,
            businessProfileId: existing.businessProfileId ?? location.businessProfileId,
            landingPageUrl: existing.landingPageUrl ?? location.landingPageUrl,
            metrics: { ...existing.metrics, ...location.metrics },
            findings: [...existing.findings, ...location.findings],
          }
        : location);
    }
  }

  return {
    clientId: client.id,
    clientName: client.name,
    generatedAt: new Date().toISOString(),
    platformLabels: [...new Set(snapshots.flatMap((snapshot) => snapshot.platformLabels))],
    supportedCapabilities: [...new Set(snapshots.flatMap((snapshot) => snapshot.supportedCapabilities))],
    sourceEvidence: snapshots.flatMap((snapshot) => snapshot.sourceEvidence),
    accountProfile: {
      industry: client.industry,
      operatingModel: client.operatingModel,
      connectedPlatformTypes: [...new Set(snapshots.flatMap((snapshot) => snapshot.accountProfile.connectedPlatformTypes))],
      primaryDomain: client.primaryDomain ?? null,
    },
    campaigns: snapshots.find((snapshot) => snapshot.campaigns)?.campaigns ?? null,
    paidMedia: snapshots.find((snapshot) => snapshot.paidMedia)?.paidMedia ?? null,
    automations: snapshots.find((snapshot) => snapshot.automations)?.automations ?? null,
    audiences: snapshots.map((snapshot) => snapshot.audiences).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: "supported",
        liveForms: acc.liveForms + item.liveForms,
        totalSegments: acc.totalSegments + item.totalSegments,
        staleSegments: acc.staleSegments + item.staleSegments,
        engagementSegments: acc.engagementSegments + item.engagementSegments,
        zeroPartyFields: acc.zeroPartyFields + item.zeroPartyFields,
      };
    }, null as NormalizedBusinessSnapshot["audiences"]) ?? null,
    deliverability: snapshots.find((snapshot) => snapshot.deliverability)?.deliverability ?? null,
    events: snapshots.map((snapshot) => snapshot.events).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: "supported",
        hasPlacedOrder: acc.hasPlacedOrder || item.hasPlacedOrder,
        hasViewedProduct: acc.hasViewedProduct || item.hasViewedProduct,
        customEventCount: acc.customEventCount + item.customEventCount,
      };
    }, null as NormalizedBusinessSnapshot["events"]) ?? null,
    revenue: snapshots.map((snapshot) => snapshot.revenue).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: "supported",
        totalRevenue: (acc.totalRevenue ?? 0) + (item.totalRevenue ?? 0),
        campaignRevenueShare: acc.campaignRevenueShare ?? item.campaignRevenueShare,
        automationRevenueShare: acc.automationRevenueShare ?? item.automationRevenueShare,
      };
    }, null as NormalizedBusinessSnapshot["revenue"]) ?? null,
    products: snapshots.map((snapshot) => snapshot.products).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: "supported",
        productCount: acc.productCount + item.productCount,
        catalogConnected: acc.catalogConnected || item.catalogConnected,
        healthySync: acc.healthySync && item.healthySync,
      };
    }, null as NormalizedBusinessSnapshot["products"]) ?? null,
    templatesAssets: snapshots.map((snapshot) => snapshot.templatesAssets).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: "supported",
        templateCount: acc.templateCount + item.templateCount,
        staleTemplateCount: acc.staleTemplateCount + item.staleTemplateCount,
      };
    }, null as NormalizedBusinessSnapshot["templatesAssets"]) ?? null,
    crm: snapshots.find((snapshot) => snapshot.crm)?.crm ?? null,
    commerce: snapshots.find((snapshot) => snapshot.commerce)?.commerce ?? null,
    search: snapshots.find((snapshot) => snapshot.search)?.search ?? null,
    localPresence: snapshots.find((snapshot) => snapshot.localPresence)?.localPresence ?? null,
    reputation: snapshots.map((snapshot) => snapshot.reputation).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: "supported",
        averageRating: acc.averageRating != null && item.averageRating != null ? Number(((acc.averageRating + item.averageRating) / 2).toFixed(2)) : (acc.averageRating ?? item.averageRating),
        totalReviews: acc.totalReviews + item.totalReviews,
        responseRate: acc.responseRate != null && item.responseRate != null ? Number(((acc.responseRate + item.responseRate) / 2).toFixed(2)) : (acc.responseRate ?? item.responseRate),
        unansweredReviews: acc.unansweredReviews + item.unansweredReviews,
      };
    }, null as NormalizedBusinessSnapshot["reputation"]) ?? null,
    trafficAttribution: snapshots.find((snapshot) => snapshot.trafficAttribution)?.trafficAttribution ?? null,
    website: snapshots.map((snapshot) => snapshot.website).filter(Boolean).reduce((acc, item) => {
      if (!item) return acc;
      if (!acc) return item;
      return {
        supportState: acc.supportState === "supported" || item.supportState === "supported" ? "supported" : acc.supportState,
        targetUrl: acc.targetUrl ?? item.targetUrl,
        pageSpeedScore: acc.pageSpeedScore ?? item.pageSpeedScore,
        largestContentfulPaintMs: acc.largestContentfulPaintMs ?? item.largestContentfulPaintMs,
        cumulativeLayoutShift: acc.cumulativeLayoutShift ?? item.cumulativeLayoutShift,
        interactionToNextPaintMs: acc.interactionToNextPaintMs ?? item.interactionToNextPaintMs,
        pagesScanned: acc.pagesScanned + item.pagesScanned,
        indexablePages: acc.indexablePages + item.indexablePages,
        brokenLinkCount: acc.brokenLinkCount + item.brokenLinkCount,
        titleCoverageRate: acc.titleCoverageRate ?? item.titleCoverageRate,
        metaDescriptionCoverageRate: acc.metaDescriptionCoverageRate ?? item.metaDescriptionCoverageRate,
        missingCanonicalCount: acc.missingCanonicalCount + item.missingCanonicalCount,
        hasRobotsTxt: acc.hasRobotsTxt ?? item.hasRobotsTxt,
        hasSitemapXml: acc.hasSitemapXml ?? item.hasSitemapXml,
        notes: [...acc.notes, ...item.notes],
      };
    }, null as NormalizedBusinessSnapshot["website"]) ?? null,
    locations: [...locationMap.values()],
    integrations: {
      supportState: "supported",
      connectedPlatformLabels: [...new Set(snapshots.flatMap((snapshot) => snapshot.integrations.connectedPlatformLabels))],
      activeIntegrationCount: snapshots.reduce((total, snapshot) => total + snapshot.integrations.activeIntegrationCount, 0),
      webhookCount: snapshots.reduce((total, snapshot) => total + snapshot.integrations.webhookCount, 0),
      healthyIntegrationCount: snapshots.reduce((total, snapshot) => total + snapshot.integrations.healthyIntegrationCount, 0),
    },
    operationalFlags: snapshots.flatMap((snapshot) => snapshot.operationalFlags),
  };
}
