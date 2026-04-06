import {
  type AuditCapability,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformType,
  type SearchPageSnapshot,
  type SearchQuerySnapshot,
} from "@/lib/audit/types";
import { baseSnapshot, type ConnectorContext, type PlatformConnector, withSupport } from "./connectors";

export class GoogleSearchConsoleConnector implements PlatformConnector {
  key = "google_search_console" as const;

  platformType(): PlatformType {
    return "search_visibility";
  }

  capabilities(): AuditCapability[] {
    return ["search_performance", "location_rollup"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    return {
      valid: Boolean(integration.credentials.accessToken || integration.settings.propertyId || integration.settings.demoMode),
      mode: integration.credentials.accessToken ? ("api" as const) : ("demo" as const),
      message: integration.credentials.accessToken
        ? "OAuth token present for Search Console."
        : "Search Console is running in demo mode until OAuth is connected.",
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    const isDemo = !integration.credentials.accessToken;
    const property = integration.settings.propertyId ?? client.primaryDomain ?? null;
    const topQueries: SearchQuerySnapshot[] = [
      { term: "brand name", clicks: 620, impressions: 4800, ctr: 0.129, position: 1.8 },
      { term: "service near me", clicks: 210, impressions: 6200, ctr: 0.034, position: 7.1 },
      { term: "best provider city", clicks: 108, impressions: 4100, ctr: 0.026, position: 8.4 },
    ];
    const topPages: SearchPageSnapshot[] = [
      { page: "/", clicks: 510, impressions: 7200, ctr: 0.071, position: 5.6 },
      { page: "/locations/chicago", clicks: 150, impressions: 2900, ctr: 0.051, position: 4.8 },
      { page: "/pricing", clicks: 82, impressions: 2500, ctr: 0.033, position: 9.2 },
    ];

    snapshot.search = withSupport("supported", {
      property,
      clicks: 1480,
      impressions: 26200,
      ctr: 0.056,
      averagePosition: 6.4,
      brandedShare: 0.39,
      topQueries,
      topPages,
    });
    if (!isDemo) {
      snapshot.locations = [
        {
          locationId: "loc_chicago",
          label: "Chicago",
          businessProfileId: null,
          landingPageUrl: client.primaryDomain ? `${client.primaryDomain}/locations/chicago` : null,
          metrics: { clicks: 220, impressions: 4300 },
          findings: ["Local landing page has strong visibility but CTR can improve."],
        },
        {
          locationId: "loc_austin",
          label: "Austin",
          businessProfileId: null,
          landingPageUrl: client.primaryDomain ? `${client.primaryDomain}/locations/austin` : null,
          metrics: { clicks: 140, impressions: 3900 },
          findings: ["Austin location page ranks but needs stronger non-brand coverage."],
        },
      ];
    } else {
      snapshot.operationalFlags.push("search_console_demo_mode");
    }
    return snapshot;
  }
}

export class GoogleBusinessProfileConnector implements PlatformConnector {
  key = "google_business_profile" as const;

  platformType(): PlatformType {
    return "local_presence";
  }

  capabilities(): AuditCapability[] {
    return ["local_profile_health", "local_reviews_reputation", "location_rollup"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    return {
      valid: Boolean(integration.credentials.accessToken || integration.settings.businessAccountId || integration.settings.demoMode),
      mode: integration.credentials.accessToken ? ("api" as const) : ("demo" as const),
      message: integration.credentials.accessToken
        ? "OAuth token present for Business Profile."
        : "Business Profile is running in demo mode until OAuth is connected.",
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    const isDemo = !integration.credentials.accessToken;
    snapshot.localPresence = withSupport("supported", {
      accountName: integration.displayName,
      locationCount: 2,
      completedProfiles: 1,
      averageCompletionRate: 0.82,
      photoCoverageRate: 0.55,
      postCoverageRate: 0.35,
    });
    snapshot.reputation = withSupport("supported", {
      averageRating: 4.2,
      totalReviews: 214,
      responseRate: 0.58,
      unansweredReviews: 22,
    });
    if (!isDemo) {
      snapshot.locations = [
        {
          locationId: "loc_chicago",
          label: "Chicago",
          businessProfileId: integration.settings.businessProfileId ?? "gbp_chicago",
          landingPageUrl: client.primaryDomain ? `${client.primaryDomain}/locations/chicago` : null,
          metrics: { averageRating: 4.5, reviewCount: 122, responseRate: 0.69 },
          findings: ["Chicago profile is healthy overall."],
        },
        {
          locationId: "loc_austin",
          label: "Austin",
          businessProfileId: "gbp_austin",
          landingPageUrl: client.primaryDomain ? `${client.primaryDomain}/locations/austin` : null,
          metrics: { averageRating: 3.9, reviewCount: 92, responseRate: 0.43 },
          findings: ["Austin profile needs stronger review response discipline and fresher media."],
        },
      ];
    } else {
      snapshot.operationalFlags.push("business_profile_demo_mode");
    }
    return snapshot;
  }
}

export class GoogleAnalyticsConnector implements PlatformConnector {
  key = "google_analytics" as const;

  platformType(): PlatformType {
    return "web_analytics";
  }

  capabilities(): AuditCapability[] {
    return ["web_traffic_conversion", "location_rollup"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    return {
      valid: Boolean(integration.credentials.accessToken || integration.settings.ga4PropertyId || integration.settings.demoMode),
      mode: integration.credentials.accessToken ? ("api" as const) : ("demo" as const),
      message: integration.credentials.accessToken
        ? "OAuth token present for GA4."
        : "GA4 is running in demo mode until OAuth is connected.",
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    const isDemo = !integration.credentials.accessToken;
    const topChannels = [
      { channel: "Organic Search", users: 8120, sessions: 10010, conversionRate: 0.021, share: 0.42 },
      { channel: "Direct", users: 4200, sessions: 5050, conversionRate: 0.016, share: 0.21 },
      { channel: "Paid Search", users: 3100, sessions: 4200, conversionRate: 0.012, share: 0.18 },
    ];
    const topLandingPages = [
      { path: "/", sessions: 6030, engagementRate: 0.51, conversionRate: 0.011 },
      { path: "/locations/chicago", sessions: 1440, engagementRate: 0.63, conversionRate: 0.027 },
      { path: "/pricing", sessions: 980, engagementRate: 0.42, conversionRate: 0.038 },
    ];
    snapshot.trafficAttribution = withSupport("supported", {
      property: integration.settings.ga4PropertyId ?? null,
      users: 18420,
      sessions: 23610,
      engagementRate: 0.58,
      conversionRate: 0.019,
      topChannels,
      topLandingPages,
    });
    if (!isDemo) {
      snapshot.locations = [
        {
          locationId: "loc_chicago",
          label: "Chicago",
          businessProfileId: null,
          landingPageUrl: client.primaryDomain ? `${client.primaryDomain}/locations/chicago` : null,
          metrics: { users: 940, sessions: 1440 },
          findings: ["Chicago landing page has healthy engagement and conversion compared to the average."],
        },
        {
          locationId: "loc_austin",
          label: "Austin",
          businessProfileId: null,
          landingPageUrl: client.primaryDomain ? `${client.primaryDomain}/locations/austin` : null,
          metrics: { users: 670, sessions: 980 },
          findings: ["Austin landing page engagement trails the strongest location page."],
        },
      ];
    } else {
      snapshot.operationalFlags.push("ga4_demo_mode");
    }
    return snapshot;
  }
}
