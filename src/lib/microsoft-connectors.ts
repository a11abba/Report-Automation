import {
  type AuditCapability,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformType,
} from "@/lib/audit/types";
import {
  baseSnapshot,
  nowEvidence,
  type ConnectorContext,
  type PlatformConnector,
  withSupport,
} from "./connectors";

function hasMicrosoftEnvironment() {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_OAUTH_REDIRECT_URI &&
      process.env.MICROSOFT_ADS_DEVELOPER_TOKEN,
  );
}

function hasMicrosoftOAuthToken(integration: IntegrationRecord) {
  return Boolean(integration.credentials.accessToken);
}

function hasMicrosoftRefreshToken(integration: IntegrationRecord) {
  return Boolean(integration.credentials.refreshToken);
}

function microsoftEnvironmentMessage(platformLabel: string) {
  return `${platformLabel} requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_OAUTH_REDIRECT_URI, and MICROSOFT_ADS_DEVELOPER_TOKEN.`;
}

function normalizeMicrosoftNumericId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function buildMicrosoftAdsDemoSnapshot(
  client: ConnectorContext["client"],
  integration: ConnectorContext["integration"],
) {
  const snapshot = baseSnapshot(client, "microsoft_ads", "paid_media", ["paid_media_performance"]);
  snapshot.paidMedia = withSupport("supported", {
    adAccountId: integration.settings.microsoftAccountId ?? "149461593",
    accountCurrency: "USD",
    spend: 3910,
    impressions: 126400,
    reach: 0,
    clicks: 2870,
    ctr: 0.0227,
    cpc: 1.36,
    cpm: 30.93,
    purchases: 41,
    purchaseValue: 7620,
    roas: 1.95,
    topCampaigns: [
      {
        id: "msft_brand_search",
        name: "Brand Search",
        status: "Active",
        spend: 1220,
        impressions: 25100,
        reach: 0,
        clicks: 740,
        ctr: 0.0295,
        cpc: 1.65,
        cpm: 48.61,
        purchases: 16,
        purchaseValue: 3240,
        roas: 2.66,
      },
      {
        id: "msft_shopping_best_sellers",
        name: "Shopping - Best Sellers",
        status: "Active",
        spend: 1840,
        impressions: 84400,
        reach: 0,
        clicks: 1510,
        ctr: 0.0179,
        cpc: 1.22,
        cpm: 21.8,
        purchases: 21,
        purchaseValue: 3480,
        roas: 1.89,
      },
      {
        id: "msft_competitor_terms",
        name: "Competitor Terms",
        status: "Limited",
        spend: 850,
        impressions: 16900,
        reach: 0,
        clicks: 620,
        ctr: 0.0367,
        cpc: 1.37,
        cpm: 50.3,
        purchases: 4,
        purchaseValue: 900,
        roas: 1.06,
      },
    ],
  });
  snapshot.sourceEvidence.push(
    nowEvidence("microsoft_ads", "paid_media", "Microsoft customer", "settings.microsoftCustomerId", integration.settings.microsoftCustomerId ?? null),
    nowEvidence("microsoft_ads", "paid_media", "Microsoft account", "settings.microsoftAccountId", integration.settings.microsoftAccountId ?? null),
  );
  snapshot.operationalFlags.push("microsoft_ads_demo_mode");
  return snapshot;
}

function buildMicrosoftMerchantCenterDemoSnapshot(
  client: ConnectorContext["client"],
  integration: ConnectorContext["integration"],
) {
  const snapshot = baseSnapshot(
    client,
    "microsoft_merchant_center",
    "commerce_pos",
    ["commerce_catalog"],
  );
  snapshot.products = withSupport("supported", {
    productCount: 2602,
    catalogConnected: true,
    healthySync: true,
  });
  snapshot.commerce = withSupport("supported", {
    orderCount: 0,
    repeatCustomerRate: 0,
    retentionSignalCount: 0,
  });
  snapshot.sourceEvidence.push(
    nowEvidence(
      "microsoft_merchant_center",
      "commerce_pos",
      "Merchant store",
      "settings.merchantStoreId",
      integration.settings.merchantStoreId ?? integration.displayName,
    ),
    nowEvidence(
      "microsoft_merchant_center",
      "commerce_pos",
      "Merchant feed",
      "settings.merchantFeedId",
      integration.settings.merchantFeedId ?? null,
    ),
  );
  snapshot.operationalFlags.push("microsoft_merchant_center_demo_mode");
  return snapshot;
}

export class MicrosoftAdsConnector implements PlatformConnector {
  key = "microsoft_ads" as const;

  platformType(): PlatformType {
    return "paid_media";
  }

  capabilities(): AuditCapability[] {
    return ["paid_media_performance"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    const environmentConfigured = hasMicrosoftEnvironment();
    const authenticated = hasMicrosoftOAuthToken(integration);
    const refreshTokenPresent = hasMicrosoftRefreshToken(integration);
    const resourceSelected = Boolean(
      normalizeMicrosoftNumericId(integration.settings.microsoftCustomerId) &&
        normalizeMicrosoftNumericId(integration.settings.microsoftAccountId),
    );
    const demoMode = Boolean(integration.settings.demoMode);

    if (!environmentConfigured && !demoMode) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "env_missing",
        message: microsoftEnvironmentMessage("Microsoft Ads"),
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
        message: "Microsoft Ads is running in demo mode until OAuth and the account identifiers are configured.",
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
        message: "Connect Microsoft Ads with OAuth before requesting live paid media data.",
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
        message: "Reconnect Microsoft Ads so the app can refresh expired access tokens automatically.",
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
        code: "account_required",
        message: "Enter the Microsoft Customer ID and Account ID for this client.",
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
      message: "OAuth is connected and the account IDs are saved. The live Microsoft Ads adapter is the next implementation step.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: false,
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    return buildMicrosoftAdsDemoSnapshot(client, integration);
  }
}

export class MicrosoftMerchantCenterConnector implements PlatformConnector {
  key = "microsoft_merchant_center" as const;

  platformType(): PlatformType {
    return "commerce_pos";
  }

  capabilities(): AuditCapability[] {
    return ["commerce_catalog"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    const environmentConfigured = hasMicrosoftEnvironment();
    const authenticated = hasMicrosoftOAuthToken(integration);
    const refreshTokenPresent = hasMicrosoftRefreshToken(integration);
    const resourceSelected = Boolean(
      normalizeMicrosoftNumericId(integration.settings.microsoftCustomerId) &&
        normalizeMicrosoftNumericId(integration.settings.microsoftAccountId) &&
        normalizeMicrosoftNumericId(integration.settings.merchantStoreId),
    );
    const demoMode = Boolean(integration.settings.demoMode);

    if (!environmentConfigured && !demoMode) {
      return {
        valid: false,
        mode: "demo" as const,
        code: "env_missing",
        message: microsoftEnvironmentMessage("Microsoft Merchant Center"),
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
        message: "Microsoft Merchant Center is running in demo mode until OAuth and the store identifiers are configured.",
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
        message: "Connect Microsoft Merchant Center with OAuth before requesting live catalog data.",
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
        message: "Reconnect Microsoft Merchant Center so the app can refresh expired access tokens automatically.",
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
        code: "store_required",
        message: "Enter the Microsoft Customer ID, Account ID, and Merchant Store ID for this client.",
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
      message: "OAuth is connected and the Merchant Center IDs are saved. The live catalog adapter is the next implementation step.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady: false,
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    return buildMicrosoftMerchantCenterDemoSnapshot(client, integration);
  }
}
