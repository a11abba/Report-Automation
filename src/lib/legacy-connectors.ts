import {
  type AutomationFlowSnapshot,
  type AuditedMetric,
  type AuditCapability,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformKey,
  type PlatformType,
} from "@/lib/audit/types";
import {
  baseSnapshot,
  nowEvidence,
  type ConnectorContext,
  type PlatformConnector,
  withSupport,
} from "./connectors";

function percentageMetric(
  label: string,
  value: number,
  evidence: AuditedMetric["evidence"],
): AuditedMetric {
  return {
    label,
    unit: "percentage",
    value,
    supportState: "supported",
    evidence,
  };
}

export class KlaviyoConnector implements PlatformConnector {
  key = "klaviyo" as const;

  platformType(): PlatformType {
    return "messaging_automation";
  }

  capabilities(): AuditCapability[] {
    return [
      "campaign_analytics",
      "automation_inventory",
      "deliverability",
      "forms_segments",
      "event_tracking",
      "commerce_catalog",
      "orders_revenue",
      "templates_assets",
    ];
  }

  async validateCredentials(integration: IntegrationRecord) {
    return {
      valid: true,
      mode: integration.credentials.apiKey ? ("api" as const) : ("demo" as const),
      message: integration.credentials.apiKey
        ? "API key provided. Connector is ready for a real adapter implementation."
        : "Running in demo mode until a production Klaviyo adapter is added.",
    };
  }

  async fetchSnapshot({ client }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    const evidence = (label: string, path: string, rawValue?: number | string | boolean | null) =>
      nowEvidence(this.key, this.platformType(), label, path, rawValue);
    const flows: AutomationFlowSnapshot[] = [
      {
        id: "flow_welcome",
        name: "Welcome Series",
        live: true,
        status: "live",
        triggerType: "list_segment",
        emailCount: 4,
        hasConditionalSplit: true,
        hasSpacingIssue: false,
        profile: "welcome",
        metrics: { openRate: 0.54, clickRate: 0.08, bounceRate: 0.002, spamComplaintRate: 0.00003, unsubscribeRate: 0.001 },
      },
      {
        id: "flow_post_purchase",
        name: "Post Purchase",
        live: true,
        status: "manual",
        triggerType: "metric",
        emailCount: 1,
        hasConditionalSplit: false,
        hasSpacingIssue: false,
        profile: "post_purchase",
        metrics: { openRate: 0.33, clickRate: 0.018, bounceRate: 0.004, spamComplaintRate: 0.0001, unsubscribeRate: 0.0021 },
      },
    ];

    snapshot.campaigns = withSupport("supported", {
      sentLast12Months: 118,
      averagePerMonth: 9.8,
      bestDay: "Thursday",
      worstDay: "Sunday",
      exclusionUsageRate: 0.24,
      abTestCount: 12,
      metrics: {
        openRate: percentageMetric("Open rate", 0.41, [evidence("Campaign open rate", "campaigns.unique_open_rate", 0.41)]),
        clickRate: percentageMetric("Click rate", 0.034, [evidence("Campaign click rate", "campaigns.unique_click_rate", 0.034)]),
        clickToOpenRate: percentageMetric("Click-to-open rate", 0.083, [evidence("Campaign click-to-open rate", "campaigns.ctor", 0.083)]),
        bounceRate: percentageMetric("Bounce rate", 0.0038, [evidence("Campaign bounce rate", "campaigns.bounce_rate", 0.0038)]),
        spamComplaintRate: percentageMetric("Spam complaint rate", 0.00008, [evidence("Campaign spam rate", "campaigns.spam_rate", 0.00008)]),
        unsubscribeRate: percentageMetric("Unsubscribe rate", 0.0012, [evidence("Campaign unsubscribe rate", "campaigns.unsubscribe_rate", 0.0012)]),
      },
    });

    snapshot.automations = withSupport("supported", {
      liveCount: 7,
      manualCount: 1,
      distinctTriggerTypes: ["metric", "list_segment", "date"],
      requiredCoverageRate: 0.64,
      missingFlowProfiles: ["review_request", "price_drop", "sunset", "cross_sell"],
      flows,
    });

    snapshot.audiences = withSupport("supported", {
      liveForms: 3,
      totalSegments: 9,
      staleSegments: 2,
      engagementSegments: 2,
      zeroPartyFields: 4,
    });
    snapshot.deliverability = withSupport("supported", {
      bounceRate: 0.0041,
      spamComplaintRate: 0.00009,
      unsubscribeRate: 0.0014,
    });
    snapshot.events = withSupport("supported", {
      hasPlacedOrder: true,
      hasViewedProduct: true,
      customEventCount: 6,
    });
    snapshot.revenue = withSupport("supported", {
      totalRevenue: 724000,
      campaignRevenueShare: 0.38,
      automationRevenueShare: 0.62,
    });
    snapshot.products = withSupport("supported", {
      productCount: 186,
      catalogConnected: true,
      healthySync: true,
    });
    snapshot.templatesAssets = withSupport("supported", {
      templateCount: 23,
      staleTemplateCount: 4,
    });
    snapshot.operationalFlags.push("klaviyo_demo_mode");
    return snapshot;
  }
}

export class HubSpotConnector implements PlatformConnector {
  key: PlatformKey;

  constructor(key: PlatformKey = "hubspot") {
    this.key = key;
  }

  platformType(): PlatformType {
    return "crm";
  }

  capabilities(): AuditCapability[] {
    return ["crm_contacts_pipeline", "forms_segments", "templates_assets"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    return {
      valid: true,
      mode: integration.credentials.apiKey ? ("api" as const) : ("demo" as const),
      message: "CRM connector scaffolded for multi-platform expansion.",
    };
  }

  async fetchSnapshot({ client }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.crm = withSupport("supported", {
      contactCount: 12840,
      lifecycleStageCoverageRate: 0.76,
      ownerCoverageRate: 0.82,
      recentActivityRate: 0.58,
      attributedSourceCount: 7,
      engagementSegmentCount: 3,
    });
    snapshot.audiences = withSupport("supported", {
      liveForms: 2,
      totalSegments: 11,
      staleSegments: 1,
      engagementSegments: 3,
      zeroPartyFields: 2,
    });
    snapshot.templatesAssets = withSupport("supported", {
      templateCount: 10,
      staleTemplateCount: 1,
    });
    snapshot.operationalFlags.push("crm_demo_mode");
    return snapshot;
  }
}

export class ShopifyConnector implements PlatformConnector {
  key: PlatformKey;

  constructor(key: PlatformKey = "shopify") {
    this.key = key;
  }

  platformType(): PlatformType {
    return "commerce_pos";
  }

  capabilities(): AuditCapability[] {
    return ["commerce_catalog", "orders_revenue", "event_tracking"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    return {
      valid: true,
      mode: integration.credentials.apiKey ? ("api" as const) : ("demo" as const),
      message: "Commerce/POS connector scaffolded for open API systems.",
    };
  }

  async fetchSnapshot({ client }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.products = withSupport("supported", {
      productCount: 412,
      catalogConnected: true,
      healthySync: true,
    });
    snapshot.commerce = withSupport("supported", {
      orderCount: 9382,
      repeatCustomerRate: 0.32,
      retentionSignalCount: 4,
    });
    snapshot.revenue = withSupport("supported", {
      totalRevenue: 1289000,
      campaignRevenueShare: null,
      automationRevenueShare: null,
    });
    snapshot.events = withSupport("supported", {
      hasPlacedOrder: true,
      hasViewedProduct: false,
      customEventCount: 2,
    });
    snapshot.operationalFlags.push("commerce_demo_mode");
    return snapshot;
  }
}
