import {
  type AuditCapability,
  type ConnectorHealthCheckResult,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformType,
} from "@/lib/audit/types";
import {
  fetchMetaAdAccounts,
  fetchMetaAdsSnapshot,
  MetaAdsApiError,
  normalizeMetaAdAccountId,
  verifyMetaAdAccountAccess,
} from "./meta-ads-api";
import {
  baseSnapshot,
  nowEvidence,
  type ConnectorContext,
  type PlatformConnector,
  withSupport,
} from "./connectors";

function buildMetaAdsDemoSnapshot(client: ConnectorContext["client"], integration: ConnectorContext["integration"]) {
  const snapshot = baseSnapshot(client, "meta_ads", "paid_media", ["paid_media_performance"]);
  snapshot.paidMedia = withSupport("supported", {
    adAccountId: normalizeMetaAdAccountId(integration.settings.adAccountId) ?? "act_1234567890",
    accountCurrency: "USD",
    spend: 8420,
    impressions: 214500,
    reach: 118300,
    clicks: 4920,
    ctr: 0.0229,
    cpc: 1.71,
    cpm: 39.25,
    purchases: 94,
    purchaseValue: 15180,
    roas: 1.8,
    topCampaigns: [
      {
        id: "238000000001",
        name: "Prospecting - Offers",
        status: null,
        spend: 3560,
        impressions: 91200,
        reach: 50100,
        clicks: 2280,
        ctr: 0.025,
        cpc: 1.56,
        cpm: 39.04,
        purchases: 42,
        purchaseValue: 6840,
        roas: 1.92,
      },
      {
        id: "238000000002",
        name: "Retargeting - Cart Abandoners",
        status: null,
        spend: 2180,
        impressions: 41100,
        reach: 20120,
        clicks: 1280,
        ctr: 0.0311,
        cpc: 1.7,
        cpm: 53.04,
        purchases: 31,
        purchaseValue: 5920,
        roas: 2.72,
      },
      {
        id: "238000000003",
        name: "Creators - New Collection",
        status: null,
        spend: 1680,
        impressions: 52200,
        reach: 31840,
        clicks: 720,
        ctr: 0.0138,
        cpc: 2.33,
        cpm: 32.18,
        purchases: 12,
        purchaseValue: 1450,
        roas: 0.86,
      },
    ],
  });
  snapshot.operationalFlags.push("meta_ads_demo_mode");
  return snapshot;
}

function classifyMetaAdsHealthError(error: unknown): ConnectorHealthCheckResult {
  if (error instanceof MetaAdsApiError) {
    if (error.status === 401) {
      return {
        ok: false,
        code: "token_invalid",
        message: "The Meta Ads token is no longer valid. Reconnect with a fresh access token.",
      };
    }
    if (error.status === 403) {
      return {
        ok: false,
        code: "permission_denied",
        message: "The Meta token does not have access to the selected ad account.",
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
    code: "meta_ads_health_failed",
    message: error instanceof Error ? error.message : "Meta Ads health check failed.",
  };
}

export class MetaAdsConnector implements PlatformConnector {
  key = "meta_ads" as const;

  platformType(): PlatformType {
    return "paid_media";
  }

  capabilities(): AuditCapability[] {
    return ["paid_media_performance"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    const authenticated = Boolean(integration.credentials.apiKey || integration.credentials.accessToken);
    const resourceSelected = Boolean(normalizeMetaAdAccountId(integration.settings.adAccountId));
    const demoMode = Boolean(integration.settings.demoMode);

    if (demoMode) {
      return {
        valid: true,
        mode: "demo" as const,
        code: "demo_mode",
        message: "Meta Ads is running in demo mode until a live token and ad account ID are configured.",
        environmentConfigured: true,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!authenticated) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "token_required",
        message: "Provide a Meta Ads access token to enable live paid media reporting.",
        environmentConfigured: true,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    if (!resourceSelected) {
      return {
        valid: false,
        mode: "api" as const,
        code: "ad_account_required",
        message: "Enter a Meta ad account ID (for example, 1234567890 or act_1234567890).",
        environmentConfigured: true,
        authenticated,
        resourceSelected,
        liveReady: false,
      };
    }

    return {
      valid: true,
      mode: "api" as const,
      code: "ready_for_healthcheck",
      message: "Meta Ads token and ad account ID are configured. Run the health check to confirm account access.",
      environmentConfigured: true,
      authenticated,
      resourceSelected,
      liveReady: true,
    };
  }

  async discoverMetadata({ integration }: ConnectorContext) {
    const accessToken = integration.credentials.apiKey || integration.credentials.accessToken;
    if (!accessToken) {
      return {};
    }

    const propertySummaries = await fetchMetaAdAccounts(accessToken);
    return {
      propertySummaries: propertySummaries.map((account) => ({
        resourceName: account.adAccountId,
        propertyId: account.adAccountId.replace("act_", ""),
        displayName: account.displayName,
        parentAccountName: account.currency,
      })),
    };
  }

  async healthCheck(integration: IntegrationRecord) {
    const accessToken = integration.credentials.apiKey || integration.credentials.accessToken;
    const adAccountId = normalizeMetaAdAccountId(integration.settings.adAccountId);

    if (!accessToken) {
      return {
        ok: false,
        code: "token_required",
        message: "Provide a Meta Ads access token before requesting live data.",
      };
    }

    if (!adAccountId) {
      return {
        ok: false,
        code: "ad_account_required",
        message: "Enter a valid Meta ad account ID before requesting live data.",
      };
    }

    try {
      await verifyMetaAdAccountAccess(accessToken, adAccountId);
      return {
        ok: true,
        code: "ok",
        message: `Meta ad account ${adAccountId.replace("act_", "")} is ready for live reporting.`,
      };
    } catch (error) {
      return classifyMetaAdsHealthError(error);
    }
  }

  async fetchSnapshot({ client, integration, dateRange }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const accessToken = integration.credentials.apiKey || integration.credentials.accessToken;
    const adAccountId = normalizeMetaAdAccountId(integration.settings.adAccountId);
    if (!accessToken || !adAccountId) {
      return buildMetaAdsDemoSnapshot(client, integration);
    }

    const paidMedia = await fetchMetaAdsSnapshot(accessToken, adAccountId, dateRange);
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.sourceEvidence.push(
      nowEvidence(this.key, this.platformType(), "Meta ad account", "paidMedia.adAccountId", paidMedia.adAccountId),
      nowEvidence(this.key, this.platformType(), "Meta spend", "paidMedia.spend", paidMedia.spend),
      nowEvidence(this.key, this.platformType(), "Meta purchases", "paidMedia.purchases", paidMedia.purchases),
    );
    snapshot.paidMedia = paidMedia;
    return snapshot;
  }
}
