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

function ga4PropertySelectionMessage() {
  return "Enter a GA4 property ID before this integration can use live data.";
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
  snapshot.operationalFlags.push("ga4_demo_mode");
  return snapshot;
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
    const resourceSelected = Boolean(integration.settings.propertyId);
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
        message: "Search Console is running in demo mode until the production adapter is completed.",
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

    return {
      valid: true,
      mode: "api" as const,
      code: "adapter_pending",
      message: "OAuth is connected, but Search Console still uses a demo-backed snapshot until its live adapter is implemented.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: false,
    };
  }

  async fetchSnapshot(context: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    return buildSearchConsoleDemoSnapshot(context.client, context.integration);
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
    const resourceSelected = Boolean(
      integration.settings.businessAccountId || integration.settings.businessProfileId,
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
        message: "Business Profile is running in demo mode until the production adapter is completed.",
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

    return {
      valid: true,
      mode: "api" as const,
      code: "adapter_pending",
      message: "OAuth is connected, but Business Profile still uses a demo-backed snapshot until its live adapter is implemented.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: false,
    };
  }

  async fetchSnapshot(context: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    return buildBusinessProfileDemoSnapshot(context.client, context.integration);
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

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const property = normalizeGa4PropertyId(integration.settings.ga4PropertyId);
    if (!integration.credentials.accessToken || !integration.credentials.refreshToken || !property) {
      return buildGa4DemoSnapshot(client, integration);
    }

    const ga4 = await fetchGa4TrafficSnapshot(integration.credentials.accessToken, property);
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
      topLandingPages: ga4.topLandingPages,
    });
    return snapshot;
  }
}
