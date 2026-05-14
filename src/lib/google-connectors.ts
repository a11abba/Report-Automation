import {
  type AuditCapability,
  type ConnectorHealthCheckResult,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformType,
  type SearchPageSnapshot,
  type SearchQuerySnapshot,
} from "@/lib/audit/types";
import {
  fetchGa4PropertySummaries,
  fetchGa4TrafficSnapshot,
  GoogleApiError,
  normalizeGa4PropertyId,
  verifyGa4PropertyAccess,
} from "./google-analytics-api";
import {
  fetchBusinessProfileAccounts,
  fetchBusinessProfileLocations,
  fetchBusinessProfileSnapshot,
  normalizeBusinessAccountId,
  normalizeBusinessProfileId,
  verifyBusinessProfileAccess,
} from "./google-business-profile-api";
import {
  fetchGoogleAdsAccessibleCustomers,
  fetchGoogleAdsSnapshot,
  GoogleAdsApiError,
  normalizeGoogleAdsCustomerId,
  verifyGoogleAdsCustomerAccess,
} from "./google-ads-api";
import {
  fetchSearchConsolePropertySummaries,
  fetchSearchConsoleSnapshot,
  normalizeSearchConsolePropertyId,
  verifySearchConsolePropertyAccess,
} from "./google-search-console-api";
import {
  baseSnapshot,
  nowEvidence,
  type ConnectorContext,
  type PlatformConnector,
  withSupport,
} from "./connectors";

function hasGoogleOAuthEnvironment() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

function hasOAuthToken(integration: IntegrationRecord) {
  return Boolean(integration.credentials.accessToken);
}

function hasRefreshToken(integration: IntegrationRecord) {
  return Boolean(integration.credentials.refreshToken);
}

function googleEnvironmentMessage(platformLabel: string) {
  return `${platformLabel} requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.`;
}

function googleAdsEnvironmentMessage() {
  return "Google Ads requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, and GOOGLE_ADS_DEVELOPER_TOKEN.";
}

function ga4PropertySelectionMessage() {
  return "Enter a GA4 property ID before this integration can use live data.";
}

function searchConsolePropertySelectionMessage() {
  return "Enter a Search Console property such as sc-domain:example.com or https://example.com/ before requesting live data.";
}

function businessProfileAccountSelectionMessage() {
  return "Enter a Business Profile account ID such as accounts/123456789 before requesting live data.";
}

function hasGoogleAdsEnvironment() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI &&
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  );
}

function googleAdsDeveloperToken() {
  return process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? "";
}

function googleAdsCustomerSelectionMessage() {
  return "Enter a Google Ads customer ID (for example, 123-456-7890 or 1234567890).";
}

function classifyGa4HealthError(error: unknown): ConnectorHealthCheckResult {
  if (error instanceof GoogleApiError) {
    if (error.status === 401) {
      return {
        ok: false,
        code: "token_invalid",
        message: "GA4 token is no longer valid. Reconnect the Google Analytics integration.",
      };
    }
    if (error.status === 403) {
      return {
        ok: false,
        code: "permission_denied",
        message: "The connected Google account does not have access to the selected GA4 property.",
      };
    }
    if (error.status === 404) {
      return {
        ok: false,
        code: "property_not_found",
        message: "The selected GA4 property could not be found. Check the property ID and try again.",
      };
    }
  }

  return {
    ok: false,
    code: "ga4_health_failed",
    message: error instanceof Error ? error.message : "GA4 health check failed.",
  };
}

function classifySearchConsoleHealthError(error: unknown): ConnectorHealthCheckResult {
  if (error instanceof GoogleApiError) {
    if (error.status === 401) {
      return {
        ok: false,
        code: "token_invalid",
        message: "The Search Console token is no longer valid. Reconnect the Search Console integration.",
      };
    }
    if (error.status === 403) {
      return {
        ok: false,
        code: "permission_denied",
        message: "The connected Google account does not have access to the selected Search Console property.",
      };
    }
    if (error.status === 404) {
      return {
        ok: false,
        code: "property_not_found",
        message: "The selected Search Console property could not be found. Check the property value and try again.",
      };
    }
    if (error.status === 400) {
      return {
        ok: false,
        code: "invalid_request",
        message: error.message,
      };
    }
  }

  return {
    ok: false,
    code: "search_console_health_failed",
    message: error instanceof Error ? error.message : "Search Console health check failed.",
  };
}

function classifyBusinessProfileHealthError(error: unknown): ConnectorHealthCheckResult {
  if (error instanceof GoogleApiError) {
    if (error.status === 401) {
      return {
        ok: false,
        code: "token_invalid",
        message: "The Business Profile token is no longer valid. Reconnect the Business Profile integration.",
      };
    }
    if (error.status === 403) {
      return {
        ok: false,
        code: "permission_denied",
        message: "The connected Google account does not have access to the selected Business Profile account.",
      };
    }
    if (error.status === 404) {
      return {
        ok: false,
        code: "resource_not_found",
        message: "The selected Business Profile account or location could not be found. Check the saved IDs and try again.",
      };
    }
    if (error.status === 400) {
      return {
        ok: false,
        code: "invalid_request",
        message: error.message,
      };
    }
  }

  return {
    ok: false,
    code: "business_profile_health_failed",
    message: error instanceof Error ? error.message : "Business Profile health check failed.",
  };
}

function buildSearchConsoleDemoSnapshot(
  client: ConnectorContext["client"],
  integration: ConnectorContext["integration"],
) {
  const snapshot = baseSnapshot(
    client,
    "google_search_console",
    "search_visibility",
    ["search_performance", "location_rollup"],
  );
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
  snapshot.operationalFlags.push("search_console_demo_mode");
  return snapshot;
}

function buildBusinessProfileDemoSnapshot(
  client: ConnectorContext["client"],
  integration: ConnectorContext["integration"],
) {
  const snapshot = baseSnapshot(
    client,
    "google_business_profile",
    "local_presence",
    ["local_profile_health", "local_reviews_reputation", "location_rollup"],
  );

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
  snapshot.operationalFlags.push("business_profile_demo_mode");
  return snapshot;
}

function buildGa4DemoSnapshot(client: ConnectorContext["client"], integration: ConnectorContext["integration"]) {
  const snapshot = baseSnapshot(
    client,
    "google_analytics",
    "web_analytics",
    ["web_traffic_conversion", "location_rollup"],
  );
  const topChannels = [
    { channel: "Organic Search", users: 8120, sessions: 10010, conversionRate: 0.021, share: 0.42 },
    { channel: "Direct", users: 4200, sessions: 5050, conversionRate: 0.016, share: 0.21 },
    { channel: "Paid Search", users: 3100, sessions: 4200, conversionRate: 0.012, share: 0.18 },
  ];
  const topSourceMediums = [
    {
      source: "google",
      medium: "organic",
      sessions: 9230,
      pageViews: 14120,
      keyEvents: 248,
      revenue: 48210,
      conversionRate: 0.026,
      share: 0.39,
    },
    {
      source: "(direct)",
      medium: "(none)",
      sessions: 5050,
      pageViews: 8140,
      keyEvents: 112,
      revenue: 22640,
      conversionRate: 0.022,
      share: 0.21,
    },
    {
      source: "google",
      medium: "cpc",
      sessions: 4200,
      pageViews: 6870,
      keyEvents: 72,
      revenue: 15480,
      conversionRate: 0.017,
      share: 0.18,
    },
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
    topSourceMediums,
    topLandingPages,
  });
  snapshot.operationalFlags.push("ga4_demo_mode");
  return snapshot;
}

function buildGoogleAdsDemoSnapshot(
  client: ConnectorContext["client"],
  integration: ConnectorContext["integration"],
) {
  const snapshot = baseSnapshot(
    client,
    "google_ads",
    "paid_media",
    ["paid_media_performance"],
  );
  const adAccountId =
    normalizeGoogleAdsCustomerId(integration.settings.googleAdsCustomerId) ?? "1234567890";
  snapshot.paidMedia = withSupport("supported", {
    adAccountId,
    accountCurrency: "USD",
    spend: 6240,
    impressions: 168400,
    reach: 0,
    clicks: 4860,
    ctr: 0.0289,
    cpc: 1.28,
    cpm: 37.05,
    purchases: 88,
    purchaseValue: 13920,
    roas: 2.23,
    topCampaigns: [
      {
        id: "1001",
        name: "Brand Search",
        status: "ENABLED",
        spend: 1820,
        impressions: 25200,
        reach: 0,
        clicks: 1480,
        ctr: 0.0587,
        cpc: 1.23,
        cpm: 72.22,
        purchases: 34,
        purchaseValue: 5680,
        roas: 3.12,
      },
      {
        id: "1002",
        name: "Non-Brand Search",
        status: "ENABLED",
        spend: 2940,
        impressions: 97100,
        reach: 0,
        clicks: 2460,
        ctr: 0.0253,
        cpc: 1.19,
        cpm: 30.28,
        purchases: 39,
        purchaseValue: 6020,
        roas: 2.05,
      },
      {
        id: "1003",
        name: "Performance Max",
        status: "ENABLED",
        spend: 1480,
        impressions: 46100,
        reach: 0,
        clicks: 920,
        ctr: 0.02,
        cpc: 1.61,
        cpm: 32.1,
        purchases: 15,
        purchaseValue: 2220,
        roas: 1.5,
      },
    ],
  });
  snapshot.sourceEvidence.push(
    nowEvidence("google_ads", "paid_media", "Google Ads customer", "settings.googleAdsCustomerId", adAccountId),
    nowEvidence(
      "google_ads",
      "paid_media",
      "Google Ads login customer",
      "settings.googleAdsLoginCustomerId",
      normalizeGoogleAdsCustomerId(integration.settings.googleAdsLoginCustomerId),
    ),
  );
  snapshot.operationalFlags.push("google_ads_demo_mode");
  return snapshot;
}

function classifyGoogleAdsHealthError(error: unknown): ConnectorHealthCheckResult {
  if (error instanceof GoogleAdsApiError) {
    if (error.status === 401) {
      return {
        ok: false,
        code: "token_invalid",
        message: "The Google Ads token is no longer valid. Reconnect the Google Ads integration.",
      };
    }
    if (error.status === 403) {
      return {
        ok: false,
        code: "permission_denied",
        message: "The connected Google account does not have access to the selected Google Ads customer.",
      };
    }
    if (error.status === 400) {
      return {
        ok: false,
        code: "invalid_request",
        message: error.message,
      };
    }
  }

  return {
    ok: false,
    code: "google_ads_health_failed",
    message: error instanceof Error ? error.message : "Google Ads health check failed.",
  };
}

export class GoogleSearchConsoleConnector implements PlatformConnector {
  key = "google_search_console" as const;

  platformType(): PlatformType {
    return "search_visibility";
  }

  capabilities(): AuditCapability[] {
    return ["search_performance", "location_rollup"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    const environmentConfigured = hasGoogleOAuthEnvironment();
    const authenticated = hasOAuthToken(integration);
    const refreshTokenPresent = hasRefreshToken(integration);
    const resourceSelected = Boolean(
      normalizeSearchConsolePropertyId(integration.settings.propertyId),
    );
    const demoMode = Boolean(integration.settings.demoMode);

    if (!environmentConfigured && !demoMode) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "env_missing",
        message: googleEnvironmentMessage("Search Console"),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (demoMode) {
      return {
        valid: true,
        mode: "demo" as const,
        code: "demo_mode",
        message: "Search Console is running in demo mode until OAuth, the refresh token, and the property are configured.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!authenticated) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "oauth_required",
        message: "Connect Search Console with Google OAuth to enable live data later.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!refreshTokenPresent) {
      return {
        valid: false,
        mode: "api" as const,
        code: "refresh_token_missing",
        message: "Reconnect Search Console so the app can refresh expired access tokens automatically.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!resourceSelected) {
      return {
        valid: false,
        mode: "api" as const,
        code: "property_required",
        message: searchConsolePropertySelectionMessage(),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    return {
      valid: true,
      mode: "api" as const,
      code: "ready_for_healthcheck",
      message: "Search Console OAuth is connected. Run the health check to confirm property access.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: true,
    };
  }

  async discoverMetadata({ integration }: ConnectorContext) {
    if (!integration.credentials.accessToken) {
      return {};
    }

    const propertySummaries = await fetchSearchConsolePropertySummaries(
      integration.credentials.accessToken,
    );
    return { propertySummaries };
  }

  async healthCheck(integration: IntegrationRecord) {
    const property = normalizeSearchConsolePropertyId(integration.settings.propertyId);

    if (!hasGoogleOAuthEnvironment()) {
      return {
        ok: false,
        code: "env_missing",
        message: googleEnvironmentMessage("Search Console"),
      };
    }

    if (!integration.credentials.accessToken) {
      return {
        ok: false,
        code: "oauth_required",
        message: "Connect Search Console with Google OAuth before requesting live data.",
      };
    }

    if (!integration.credentials.refreshToken) {
      return {
        ok: false,
        code: "refresh_token_missing",
        message: "Reconnect Search Console so the app can refresh expired access tokens automatically.",
      };
    }

    if (!property) {
      return {
        ok: false,
        code: "property_required",
        message: searchConsolePropertySelectionMessage(),
      };
    }

    try {
      await verifySearchConsolePropertyAccess(integration.credentials.accessToken, property);
      return {
        ok: true,
        code: "ok",
        message: `Search Console property ${property} is ready for live reporting.`,
      };
    } catch (error) {
      return classifySearchConsoleHealthError(error);
    }
  }

  async fetchSnapshot({
    client,
    integration,
    dateRange,
  }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const property = normalizeSearchConsolePropertyId(integration.settings.propertyId);
    if (!integration.credentials.accessToken || !integration.credentials.refreshToken || !property) {
      return buildSearchConsoleDemoSnapshot(client, integration);
    }

    const searchData = await fetchSearchConsoleSnapshot(
      integration.credentials.accessToken,
      client,
      property,
      dateRange,
    );
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.sourceEvidence.push(
      nowEvidence(this.key, this.platformType(), "Search Console property", "search.property", searchData.property),
      nowEvidence(this.key, this.platformType(), "Search Console clicks", "search.clicks", searchData.clicks),
      nowEvidence(
        this.key,
        this.platformType(),
        "Search Console impressions",
        "search.impressions",
        searchData.impressions,
      ),
    );
    snapshot.search = withSupport("supported", {
      property: searchData.property,
      clicks: searchData.clicks,
      impressions: searchData.impressions,
      ctr: searchData.ctr,
      averagePosition: searchData.averagePosition,
      brandedShare: searchData.brandedShare,
      topQueries: searchData.topQueries,
      topPages: searchData.topPages,
    });
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
    const environmentConfigured = hasGoogleOAuthEnvironment();
    const authenticated = hasOAuthToken(integration);
    const refreshTokenPresent = hasRefreshToken(integration);
    const resourceSelected = Boolean(
      normalizeBusinessAccountId(integration.settings.businessAccountId),
    );
    const demoMode = Boolean(integration.settings.demoMode);

    if (!environmentConfigured && !demoMode) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "env_missing",
        message: googleEnvironmentMessage("Business Profile"),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (demoMode) {
      return {
        valid: true,
        mode: "demo" as const,
        code: "demo_mode",
        message: "Business Profile is running in demo mode until OAuth, the refresh token, and the account ID are configured.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!authenticated) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "oauth_required",
        message: "Connect Business Profile with Google OAuth to enable live data later.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!refreshTokenPresent) {
      return {
        valid: false,
        mode: "api" as const,
        code: "refresh_token_missing",
        message: "Reconnect Business Profile so the app can refresh expired access tokens automatically.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!resourceSelected) {
      return {
        valid: false,
        mode: "api" as const,
        code: "business_account_required",
        message: businessProfileAccountSelectionMessage(),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    return {
      valid: true,
      mode: "api" as const,
      code: "ready_for_healthcheck",
      message: "Business Profile OAuth is connected. Run the health check to confirm account access.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: true,
    };
  }

  async discoverMetadata({ integration }: ConnectorContext) {
    const accessToken = integration.credentials.accessToken;
    if (!accessToken) {
      return {};
    }

    const accountSummaries = await fetchBusinessProfileAccounts(accessToken);
    const businessAccountId = normalizeBusinessAccountId(integration.settings.businessAccountId);
    const selectedAccount = accountSummaries.find((item) => item.resourceName === businessAccountId);
    const locationSummaries = businessAccountId
      ? await fetchBusinessProfileLocations(
          accessToken,
          businessAccountId,
          selectedAccount?.displayName ?? null,
        )
      : [];

    return {
      accountSummaries,
      locationSummaries,
    };
  }

  async healthCheck(integration: IntegrationRecord) {
    const accessToken = integration.credentials.accessToken;
    const businessAccountId = normalizeBusinessAccountId(integration.settings.businessAccountId);
    const businessProfileId = normalizeBusinessProfileId(
      integration.settings.businessProfileId,
    );

    if (!hasGoogleOAuthEnvironment()) {
      return {
        ok: false,
        code: "env_missing",
        message: googleEnvironmentMessage("Business Profile"),
      };
    }

    if (!accessToken) {
      return {
        ok: false,
        code: "oauth_required",
        message: "Connect Business Profile with Google OAuth before requesting live data.",
      };
    }

    if (!integration.credentials.refreshToken) {
      return {
        ok: false,
        code: "refresh_token_missing",
        message: "Reconnect Business Profile so the app can refresh expired access tokens automatically.",
      };
    }

    if (!businessAccountId) {
      return {
        ok: false,
        code: "business_account_required",
        message: businessProfileAccountSelectionMessage(),
      };
    }

    try {
      const verification = await verifyBusinessProfileAccess(
        accessToken,
        businessAccountId,
        businessProfileId,
      );
      return {
        ok: true,
        code: "ok",
        message: businessProfileId
          ? `Business Profile account ${verification.accountName} is ready with ${businessProfileId}.`
          : `Business Profile account ${verification.accountName} is ready with ${verification.locationCount} accessible locations.`,
      };
    } catch (error) {
      return classifyBusinessProfileHealthError(error);
    }
  }

  async fetchSnapshot({
    client,
    integration,
    dateRange,
  }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const accessToken = integration.credentials.accessToken;
    const businessAccountId = normalizeBusinessAccountId(integration.settings.businessAccountId);
    const businessProfileId = normalizeBusinessProfileId(
      integration.settings.businessProfileId,
    );

    if (!accessToken || !integration.credentials.refreshToken || !businessAccountId) {
      return buildBusinessProfileDemoSnapshot(client, integration);
    }

    const profileData = await fetchBusinessProfileSnapshot(accessToken, {
      businessAccountId,
      businessProfileId,
      fallbackAccountName: integration.displayName,
      dateRange,
    });
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.sourceEvidence.push(
      nowEvidence(
        this.key,
        this.platformType(),
        "Business Profile account",
        "localPresence.accountName",
        profileData.localPresence.accountName,
      ),
      nowEvidence(
        this.key,
        this.platformType(),
        "Business Profile locations",
        "localPresence.locationCount",
        profileData.localPresence.locationCount,
      ),
      nowEvidence(
        this.key,
        this.platformType(),
        "Business Profile reviews",
        "reputation.totalReviews",
        profileData.reputation.totalReviews,
      ),
    );
    snapshot.localPresence = profileData.localPresence;
    snapshot.reputation = profileData.reputation;
    snapshot.locations = profileData.locations;
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
    const environmentConfigured = hasGoogleOAuthEnvironment();
    const authenticated = hasOAuthToken(integration);
    const resourceSelected = Boolean(normalizeGa4PropertyId(integration.settings.ga4PropertyId));
    const refreshTokenPresent = hasRefreshToken(integration);
    const liveReady = environmentConfigured && authenticated && refreshTokenPresent && resourceSelected;
    const demoMode = Boolean(integration.settings.demoMode);

    if (!environmentConfigured && !demoMode) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "env_missing",
        message: googleEnvironmentMessage("GA4"),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (demoMode) {
      return {
        valid: true,
        mode: "demo" as const,
        code: "demo_mode",
        message: "GA4 is running in demo mode until OAuth and a property ID are configured.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!authenticated) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "oauth_required",
        message: "Connect GA4 with Google OAuth before requesting live data.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!refreshTokenPresent) {
      return {
        valid: false,
        mode: "api" as const,
        code: "refresh_token_missing",
        message: "Reconnect GA4 so the app can store a refresh token for live reporting.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!resourceSelected) {
      return {
        valid: false,
        mode: "api" as const,
        code: "property_required",
        message: ga4PropertySelectionMessage(),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    return {
      valid: true,
      mode: "api" as const,
      code: "ready_for_healthcheck",
      message: "GA4 OAuth is connected. Run the health check to confirm property access.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady,
    };
  }

  async discoverMetadata({ integration }: ConnectorContext) {
    if (!integration.credentials.accessToken) {
      return {};
    }

    const propertySummaries = await fetchGa4PropertySummaries(integration.credentials.accessToken);
    return { propertySummaries };
  }

  async healthCheck(integration: IntegrationRecord) {
    const property = normalizeGa4PropertyId(integration.settings.ga4PropertyId);
    if (!hasGoogleOAuthEnvironment()) {
      return {
        ok: false,
        code: "env_missing",
        message: googleEnvironmentMessage("GA4"),
      };
    }
    if (!integration.credentials.accessToken) {
      return {
        ok: false,
        code: "oauth_required",
        message: "Connect GA4 with Google OAuth before requesting live data.",
      };
    }
    if (!integration.credentials.refreshToken) {
      return {
        ok: false,
        code: "refresh_token_missing",
        message: "Reconnect GA4 so the app can refresh expired access tokens automatically.",
      };
    }
    if (!property) {
      return {
        ok: false,
        code: "property_required",
        message: ga4PropertySelectionMessage(),
      };
    }

    try {
      await verifyGa4PropertyAccess(integration.credentials.accessToken, property);
      return {
        ok: true,
        code: "ok",
        message: `GA4 property ${property.replace("properties/", "")} is ready for live reporting.`,
      };
    } catch (error) {
      return classifyGa4HealthError(error);
    }
  }

  async fetchSnapshot({ client, integration, dateRange }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const property = normalizeGa4PropertyId(integration.settings.ga4PropertyId);
    if (!integration.credentials.accessToken || !integration.credentials.refreshToken || !property) {
      return buildGa4DemoSnapshot(client, integration);
    }

    const ga4 = await fetchGa4TrafficSnapshot(integration.credentials.accessToken, property, dateRange);
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.sourceEvidence.push(
      nowEvidence(this.key, this.platformType(), "GA4 property", "trafficAttribution.property", ga4.property),
      nowEvidence(this.key, this.platformType(), "GA4 users", "trafficAttribution.users", ga4.users),
      nowEvidence(this.key, this.platformType(), "GA4 sessions", "trafficAttribution.sessions", ga4.sessions),
    );
    snapshot.trafficAttribution = withSupport("supported", {
      property: ga4.property,
      users: ga4.users,
      sessions: ga4.sessions,
      engagementRate: ga4.engagementRate,
      conversionRate: ga4.conversionRate,
      topChannels: ga4.topChannels,
      topSourceMediums: ga4.topSourceMediums,
      topLandingPages: ga4.topLandingPages,
    });
    return snapshot;
  }
}

export class GoogleAdsConnector implements PlatformConnector {
  key = "google_ads" as const;

  platformType(): PlatformType {
    return "paid_media";
  }

  capabilities(): AuditCapability[] {
    return ["paid_media_performance"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    const environmentConfigured = hasGoogleAdsEnvironment();
    const authenticated = hasOAuthToken(integration);
    const refreshTokenPresent = hasRefreshToken(integration);
    const resourceSelected = Boolean(
      normalizeGoogleAdsCustomerId(integration.settings.googleAdsCustomerId),
    );
    const demoMode = Boolean(integration.settings.demoMode);

    if (!environmentConfigured && !demoMode) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "env_missing",
        message: googleAdsEnvironmentMessage(),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (demoMode) {
      return {
        valid: true,
        mode: "demo" as const,
        code: "demo_mode",
        message: "Google Ads is running in demo mode until OAuth, the developer token, and the customer ID are configured.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!authenticated) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "oauth_required",
        message: "Connect Google Ads with Google OAuth before requesting live paid media data.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!refreshTokenPresent) {
      return {
        valid: false,
        mode: "api" as const,
        code: "refresh_token_missing",
        message: "Reconnect Google Ads so the app can refresh expired access tokens automatically.",
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!resourceSelected) {
      return {
        valid: false,
        mode: "api" as const,
        code: "customer_required",
        message: googleAdsCustomerSelectionMessage(),
        environmentConfigured,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    return {
      valid: true,
      mode: "api" as const,
      code: "ready_for_healthcheck",
      message: "Google Ads OAuth is connected. Run the health check to confirm customer access.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: true,
    };
  }

  async discoverMetadata({ integration }: ConnectorContext) {
    const accessToken = integration.credentials.accessToken;
    const developerToken = googleAdsDeveloperToken();
    if (!accessToken || !developerToken) {
      return {};
    }

    const customers = await fetchGoogleAdsAccessibleCustomers(accessToken, developerToken);
    return {
      propertySummaries: customers.map((customer) => ({
        resourceName: `customers/${customer.customerId}`,
        propertyId: customer.customerId,
        displayName: customer.displayName,
        parentAccountName: customer.currencyCode,
      })),
    };
  }

  async healthCheck(integration: IntegrationRecord) {
    const accessToken = integration.credentials.accessToken;
    const customerId = normalizeGoogleAdsCustomerId(integration.settings.googleAdsCustomerId);
    const loginCustomerId = normalizeGoogleAdsCustomerId(
      integration.settings.googleAdsLoginCustomerId,
    );
    const developerToken = googleAdsDeveloperToken();

    if (!hasGoogleAdsEnvironment()) {
      return {
        ok: false,
        code: "env_missing",
        message: googleAdsEnvironmentMessage(),
      };
    }

    if (!accessToken) {
      return {
        ok: false,
        code: "oauth_required",
        message: "Connect Google Ads with Google OAuth before requesting live data.",
      };
    }

    if (!integration.credentials.refreshToken) {
      return {
        ok: false,
        code: "refresh_token_missing",
        message: "Reconnect Google Ads so the app can refresh expired access tokens automatically.",
      };
    }

    if (!customerId) {
      return {
        ok: false,
        code: "customer_required",
        message: googleAdsCustomerSelectionMessage(),
      };
    }

    if (!developerToken) {
      return {
        ok: false,
        code: "developer_token_missing",
        message: googleAdsEnvironmentMessage(),
      };
    }

    try {
      const customer = await verifyGoogleAdsCustomerAccess(
        accessToken,
        developerToken,
        customerId,
        loginCustomerId,
      );
      return {
        ok: true,
        code: "ok",
        message: `Google Ads customer ${customer.customerId} (${customer.displayName}) is ready for live reporting.`,
      };
    } catch (error) {
      return classifyGoogleAdsHealthError(error);
    }
  }

  async fetchSnapshot({ client, integration, dateRange }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const accessToken = integration.credentials.accessToken;
    const customerId = normalizeGoogleAdsCustomerId(integration.settings.googleAdsCustomerId);
    const loginCustomerId = normalizeGoogleAdsCustomerId(
      integration.settings.googleAdsLoginCustomerId,
    );
    const developerToken = googleAdsDeveloperToken();

    if (!accessToken || !integration.credentials.refreshToken || !customerId || !developerToken) {
      return buildGoogleAdsDemoSnapshot(client, integration);
    }

    const paidMedia = await fetchGoogleAdsSnapshot(
      accessToken,
      developerToken,
      customerId,
      loginCustomerId,
      dateRange,
    );
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.sourceEvidence.push(
      nowEvidence(this.key, this.platformType(), "Google Ads customer", "paidMedia.adAccountId", paidMedia.adAccountId),
      nowEvidence(this.key, this.platformType(), "Google Ads spend", "paidMedia.spend", paidMedia.spend),
      nowEvidence(this.key, this.platformType(), "Google Ads conversions", "paidMedia.purchases", paidMedia.purchases),
    );
    snapshot.paidMedia = paidMedia;
    return snapshot;
  }
}
