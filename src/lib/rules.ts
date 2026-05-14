import {
  type AuditFinding,
  type AuditReportPayload,
  type ClientRecord,
  type ContextEntryRecord,
  type LocationScore,
  type NormalizedBusinessSnapshot,
  type ReportFocus,
  type ReportPeriodRecord,
  type RulePackMetadata,
  type SectionScore,
} from "@/lib/audit/types";
import {
  getClientIndustryLabel,
  localizeFinding,
  localizeLocationNotes,
  localizeSectionScoreLabel,
} from "./report-i18n";
import { buildNarrativeSections } from "./report-narrative";
import { getCategoriesForReportFocus } from "./report-focus";

const severityPenalty: Record<AuditFinding["severity"], number> = {
  critical: 20,
  high: 12,
  medium: 6,
  low: 2,
};

const sectionCatalog = [
  { id: "channel_performance", weight: 14 },
  { id: "deliverability", weight: 10 },
  { id: "automation_coverage", weight: 10 },
  { id: "audience_capture", weight: 8 },
  { id: "data_quality", weight: 8 },
  { id: "integration_health", weight: 8 },
  { id: "commerce_revenue_attribution", weight: 8 },
  { id: "crm_lifecycle_health", weight: 6 },
  { id: "seo_visibility", weight: 10 },
  { id: "local_presence_health", weight: 8 },
  { id: "reviews_reputation", weight: 6 },
  { id: "website_performance", weight: 7 },
  { id: "technical_seo", weight: 7 },
  { id: "traffic_quality", weight: 8 },
  { id: "paid_media_performance", weight: 10 },
] as const;

export const rulePackCatalog: RulePackMetadata[] = [
  {
    id: "messaging-core",
    name: "Messaging Automation Core",
    version: "1.1.0",
    families: [
      "channel_performance",
      "deliverability",
      "automation_coverage",
      "audience_capture",
      "data_quality",
      "integration_health",
      "commerce_revenue_attribution",
    ],
    platformTypes: ["messaging_automation"],
    capabilities: [
      "campaign_analytics",
      "automation_inventory",
      "deliverability",
      "forms_segments",
      "event_tracking",
      "commerce_catalog",
      "orders_revenue",
      "templates_assets",
    ],
  },
  {
    id: "crm-core",
    name: "CRM Core",
    version: "1.1.0",
    families: ["audience_capture", "data_quality", "crm_lifecycle_health"],
    platformTypes: ["crm"],
    capabilities: ["crm_contacts_pipeline", "forms_segments", "templates_assets"],
  },
  {
    id: "google-growth-core",
    name: "Google Growth Core",
    version: "1.0.0",
    families: [
      "seo_visibility",
      "local_presence_health",
      "reviews_reputation",
      "website_performance",
      "technical_seo",
      "traffic_quality",
    ],
    platformTypes: [
      "search_visibility",
      "local_presence",
      "web_analytics",
      "website_intelligence",
    ],
    capabilities: [
      "search_performance",
      "local_profile_health",
      "local_reviews_reputation",
      "web_traffic_conversion",
      "site_performance",
      "technical_seo",
      "location_rollup",
    ],
  },
  {
    id: "commerce-core",
    name: "Commerce / POS Core",
    version: "1.1.0",
    families: ["integration_health", "data_quality", "commerce_revenue_attribution"],
    platformTypes: ["commerce_pos"],
    capabilities: ["commerce_catalog", "orders_revenue", "event_tracking"],
  },
  {
    id: "paid-media-core",
    name: "Paid Media Core",
    version: "1.0.0",
    families: ["paid_media_performance", "traffic_quality", "website_performance"],
    platformTypes: ["paid_media"],
    capabilities: ["paid_media_performance"],
  },
];

function pushFinding(
  findings: AuditFinding[],
  finding: Omit<
    AuditFinding,
    "sourcePlatforms" | "supportState" | "summary" | "recommendedAction" | "evidence" | "severityLabel" | "statusLabel"
  > & {
    sourcePlatforms?: AuditFinding["sourcePlatforms"];
    supportState?: AuditFinding["supportState"];
  },
) {
  findings.push({
    sourcePlatforms: finding.sourcePlatforms ?? ["klaviyo"],
    supportState: finding.supportState ?? "supported",
    summary: "",
    recommendedAction: "",
    evidence: [],
    severityLabel: "",
    statusLabel: "",
    ...finding,
  });
}

export function evaluateRules(snapshot: NormalizedBusinessSnapshot): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (snapshot.campaigns) {
    const openRate = Number(snapshot.campaigns.metrics.openRate.value ?? 0);
    const clickRate = Number(snapshot.campaigns.metrics.clickRate.value ?? 0);
    if (openRate < 0.25) {
      pushFinding(findings, { code: "channel.open-rate", sectionKey: "campaign_performance", category: "channel_performance", section: "", severity: "high", status: "failing", params: { openRate } });
    } else {
      pushFinding(findings, { code: "channel.open-rate.healthy", sectionKey: "campaign_performance", category: "channel_performance", section: "", severity: "low", status: "passing", params: { openRate } });
    }
    if (clickRate < 0.02) {
      pushFinding(findings, { code: "channel.click-rate", sectionKey: "campaign_performance", category: "channel_performance", section: "", severity: "medium", status: "watch", params: { clickRate } });
    }
    if ((snapshot.campaigns.exclusionUsageRate ?? 0) === 0) {
      pushFinding(findings, { code: "channel.exclusions", sectionKey: "campaign_targeting", category: "channel_performance", section: "", severity: "high", status: "failing", params: {} });
    }
  }

  if (snapshot.deliverability && (snapshot.deliverability.bounceRate ?? 0) > 0.0048) {
    pushFinding(findings, { code: "deliverability.bounce", sectionKey: "deliverability", category: "deliverability", section: "", severity: "critical", status: "failing", params: { bounceRate: snapshot.deliverability.bounceRate ?? 0 } });
  }

  if (snapshot.automations) {
    if (snapshot.automations.requiredCoverageRate < 0.7) {
      pushFinding(findings, {
        code: "automation.coverage",
        sectionKey: "automated_flows",
        category: "automation_coverage",
        section: "",
        severity: "high",
        status: "failing",
        params: {
          requiredCoverageRate: snapshot.automations.requiredCoverageRate,
          missingFlowProfiles: snapshot.automations.missingFlowProfiles.join(", "),
        },
      });
    }
    if (snapshot.automations.manualCount > 0) {
      pushFinding(findings, { code: "automation.manual", sectionKey: "automated_flows", category: "automation_coverage", section: "", severity: "medium", status: "watch", params: { manualCount: snapshot.automations.manualCount } });
    }
  }

  if (snapshot.audiences) {
    if (snapshot.audiences.liveForms === 0) {
      pushFinding(findings, { code: "audience.forms", sectionKey: "audience_growth", category: "audience_capture", section: "", severity: "critical", status: "failing", params: {} });
    }
    if (snapshot.audiences.totalSegments < 5) {
      pushFinding(findings, { code: "audience.segments", sectionKey: "audience_segmentation", category: "audience_capture", section: "", severity: "high", status: "watch", params: { totalSegments: snapshot.audiences.totalSegments } });
    }
  }

  if (snapshot.events) {
    if (!snapshot.events.hasPlacedOrder) {
      pushFinding(findings, { code: "data.placed-order", sectionKey: "event_tracking", category: "data_quality", section: "", severity: "critical", status: "failing", params: {} });
    }
    if (!snapshot.events.hasViewedProduct) {
      pushFinding(findings, { code: "data.viewed-product", sectionKey: "event_tracking", category: "data_quality", section: "", severity: "high", status: "watch", params: {} });
    }
  }

  if (snapshot.integrations.healthyIntegrationCount < snapshot.integrations.activeIntegrationCount) {
    pushFinding(findings, {
      code: "integration.health",
      sectionKey: "integrations",
      category: "integration_health",
      section: "",
      severity: "high",
      status: "failing",
      params: {
        healthyCount: snapshot.integrations.healthyIntegrationCount,
        activeCount: snapshot.integrations.activeIntegrationCount,
      },
    });
  }

  if (snapshot.revenue?.automationRevenueShare != null && snapshot.revenue.automationRevenueShare < 0.25) {
    pushFinding(findings, { code: "commerce.automation-share.low", sectionKey: "revenue_attribution", category: "commerce_revenue_attribution", section: "", severity: "high", status: "watch", params: { automationRevenueShare: snapshot.revenue.automationRevenueShare } });
  }

  if (snapshot.crm && snapshot.crm.lifecycleStageCoverageRate < 0.6) {
    pushFinding(findings, { code: "crm.lifecycle.coverage", sectionKey: "crm_lifecycle", category: "crm_lifecycle_health", section: "", severity: "high", status: "failing", params: { lifecycleStageCoverageRate: snapshot.crm.lifecycleStageCoverageRate }, sourcePlatforms: ["hubspot"] });
  }

  if (snapshot.search) {
    if (snapshot.search.ctr < 0.035 && snapshot.search.impressions > 5000) {
      pushFinding(findings, { code: "seo.ctr", sectionKey: "search_visibility", category: "seo_visibility", section: "", severity: "high", status: "watch", params: { ctr: snapshot.search.ctr, impressions: snapshot.search.impressions }, sourcePlatforms: ["google_search_console"] });
    }
    if (snapshot.search.averagePosition > 10) {
      pushFinding(findings, { code: "seo.position", sectionKey: "search_visibility", category: "seo_visibility", section: "", severity: "medium", status: "watch", params: { averagePosition: Number(snapshot.search.averagePosition.toFixed(1)).toString() }, sourcePlatforms: ["google_search_console"] });
    }
    const weakPage = snapshot.search.topPages.find((page) => page.impressions > 2000 && page.ctr < 0.04);
    if (weakPage) {
      pushFinding(findings, { code: "seo.page-ctr", sectionKey: "top_pages", category: "seo_visibility", section: "", severity: "medium", status: "watch", params: { page: weakPage.page, pageImpressions: weakPage.impressions, pageCtr: weakPage.ctr }, sourcePlatforms: ["google_search_console"] });
    }
  }

  if (snapshot.localPresence) {
    if (
      snapshot.localPresence.averageCompletionRate != null &&
      snapshot.localPresence.averageCompletionRate < 0.85
    ) {
      pushFinding(findings, { code: "local.completion", sectionKey: "business_profile", category: "local_presence_health", section: "", severity: "high", status: "failing", params: { averageCompletionRate: snapshot.localPresence.averageCompletionRate ?? 0 }, sourcePlatforms: ["google_business_profile"] });
    }
    if (
      snapshot.localPresence.photoCoverageRate != null &&
      snapshot.localPresence.photoCoverageRate < 0.6
    ) {
      pushFinding(findings, { code: "local.photos", sectionKey: "business_profile", category: "local_presence_health", section: "", severity: "medium", status: "watch", params: { photoCoverageRate: snapshot.localPresence.photoCoverageRate ?? 0 }, sourcePlatforms: ["google_business_profile"] });
    }
  }

  if (snapshot.reputation) {
    if (
      snapshot.reputation.averageRating != null &&
      snapshot.reputation.averageRating < 4.2
    ) {
      pushFinding(findings, { code: "reviews.rating", sectionKey: "review_reputation", category: "reviews_reputation", section: "", severity: "high", status: "watch", params: { averageRating: Number((snapshot.reputation.averageRating ?? 0).toFixed(1)).toString() }, sourcePlatforms: ["google_business_profile"] });
    }
    if (
      snapshot.reputation.responseRate != null &&
      snapshot.reputation.responseRate < 0.7
    ) {
      pushFinding(findings, { code: "reviews.response", sectionKey: "review_reputation", category: "reviews_reputation", section: "", severity: "medium", status: "watch", params: { responseRate: snapshot.reputation.responseRate ?? 0 }, sourcePlatforms: ["google_business_profile"] });
    }
  }

  if (snapshot.website) {
    if ((snapshot.website.pageSpeedScore ?? 100) < 70) {
      pushFinding(findings, { code: "website.speed", sectionKey: "website_performance", category: "website_performance", section: "", severity: "high", status: "watch", params: { pageSpeedScore: snapshot.website.pageSpeedScore != null ? String(snapshot.website.pageSpeedScore) : "N/A" }, sourcePlatforms: ["pagespeed_insights", "website_crawler"] });
    }
    if ((snapshot.website.largestContentfulPaintMs ?? 0) > 2500) {
      pushFinding(findings, { code: "website.lcp", sectionKey: "core_web_vitals", category: "website_performance", section: "", severity: "medium", status: "watch", params: { largestContentfulPaintMs: snapshot.website.largestContentfulPaintMs != null ? String(Math.round(snapshot.website.largestContentfulPaintMs)) : "N/A" }, sourcePlatforms: ["pagespeed_insights"] });
    }
    if ((snapshot.website.brokenLinkCount ?? 0) > 0) {
      pushFinding(findings, { code: "website.links", sectionKey: "technical_seo", category: "technical_seo", section: "", severity: "medium", status: "watch", params: { brokenLinkCount: snapshot.website.brokenLinkCount }, sourcePlatforms: ["website_crawler"] });
    }
    if ((snapshot.website.titleCoverageRate ?? 1) < 0.9) {
      pushFinding(findings, { code: "website.titles", sectionKey: "technical_seo", category: "technical_seo", section: "", severity: "medium", status: "watch", params: { titleCoverageRate: snapshot.website.titleCoverageRate ?? 0 }, sourcePlatforms: ["website_crawler"] });
    }
    if (!snapshot.website.hasRobotsTxt || !snapshot.website.hasSitemapXml) {
      pushFinding(findings, { code: "website.discovery", sectionKey: "technical_seo", category: "technical_seo", section: "", severity: "high", status: "watch", params: { hasRobotsTxt: snapshot.website.hasRobotsTxt, hasSitemapXml: snapshot.website.hasSitemapXml }, sourcePlatforms: ["website_crawler"] });
    }
  }

  if (snapshot.trafficAttribution) {
    if (snapshot.trafficAttribution.conversionRate < 0.015) {
      pushFinding(findings, { code: "traffic.conversion", sectionKey: "traffic_quality", category: "traffic_quality", section: "", severity: "high", status: "watch", params: { conversionRate: snapshot.trafficAttribution.conversionRate }, sourcePlatforms: ["google_analytics"] });
    }
    const heavyChannel = snapshot.trafficAttribution.topChannels.find((channel) => channel.share > 0.65);
    if (heavyChannel) {
      pushFinding(findings, { code: "traffic.dependency", sectionKey: "traffic_quality", category: "traffic_quality", section: "", severity: "medium", status: "watch", params: { channel: heavyChannel.channel, channelShare: heavyChannel.share }, sourcePlatforms: ["google_analytics"] });
    }
    const weakLanding = snapshot.trafficAttribution.topLandingPages.find((page) => page.sessions > 1000 && page.engagementRate < 0.45);
    if (weakLanding) {
      pushFinding(findings, { code: "traffic.landing-page", sectionKey: "landing_pages", category: "traffic_quality", section: "", severity: "medium", status: "watch", params: { path: weakLanding.path, engagementRate: weakLanding.engagementRate }, sourcePlatforms: ["google_analytics"] });
    }
  }

  if (snapshot.paidMedia) {
    if (snapshot.paidMedia.spend > 0 && snapshot.paidMedia.purchases === 0) {
      pushFinding(findings, {
        code: "paid.no-purchases",
        sectionKey: "paid_media",
        category: "paid_media_performance",
        section: "",
        severity: "critical",
        status: "failing",
        params: {
          spend: snapshot.paidMedia.spend,
          purchases: snapshot.paidMedia.purchases,
        },
        sourcePlatforms: ["meta_ads"],
      });
    }
    if ((snapshot.paidMedia.ctr ?? 0) < 0.01 && snapshot.paidMedia.impressions > 10000) {
      pushFinding(findings, {
        code: "paid.ctr",
        sectionKey: "paid_media",
        category: "paid_media_performance",
        section: "",
        severity: "high",
        status: "watch",
        params: {
          ctr: snapshot.paidMedia.ctr ?? 0,
          impressions: snapshot.paidMedia.impressions,
        },
        sourcePlatforms: ["meta_ads"],
      });
    }
    if ((snapshot.paidMedia.roas ?? 0) < 1.5 && snapshot.paidMedia.spend >= 1000) {
      pushFinding(findings, {
        code: "paid.roas",
        sectionKey: "paid_media",
        category: "paid_media_performance",
        section: "",
        severity: "high",
        status: "watch",
        params: {
          roas: snapshot.paidMedia.roas ?? 0,
          spend: snapshot.paidMedia.spend,
        },
        sourcePlatforms: ["meta_ads"],
      });
    }
    const heavyCampaign = snapshot.paidMedia.topCampaigns.find((campaign) =>
      snapshot.paidMedia && snapshot.paidMedia.spend > 0
        ? campaign.spend / snapshot.paidMedia.spend > 0.7
        : false,
    );
    if (heavyCampaign && snapshot.paidMedia.spend > 0) {
      pushFinding(findings, {
        code: "paid.concentration",
        sectionKey: "paid_media",
        category: "paid_media_performance",
        section: "",
        severity: "medium",
        status: "watch",
        params: {
          campaign: heavyCampaign.name,
          spendShare: heavyCampaign.spend / snapshot.paidMedia.spend,
        },
        sourcePlatforms: ["meta_ads"],
      });
    }
  }

  if (snapshot.locations.length > 1) {
    const ratings = snapshot.locations.map((location) => location.metrics.averageRating).filter((value): value is number => typeof value === "number");
    if (ratings.length > 1 && Math.max(...ratings) - Math.min(...ratings) > 0.5) {
      pushFinding(findings, {
        code: "locations.consistency",
        sectionKey: "location_consistency",
        category: "local_presence_health",
        section: "",
        severity: "medium",
        status: "watch",
        params: {
          locationSummary: snapshot.locations.map((location) => `${location.label}: rating ${location.metrics.averageRating ?? "N/A"}, response ${location.metrics.responseRate != null ? `${Math.round(location.metrics.responseRate * 100)}%` : "N/A"}`).join(" || "),
        },
        sourcePlatforms: ["google_business_profile", "google_analytics", "google_search_console"],
      });
    }
  }

  return findings;
}

function scoreSection(category: AuditFinding["category"], findings: AuditFinding[]): SectionScore {
  const meta = sectionCatalog.find((section) => section.id === category);
  if (!meta) throw new Error(`Unknown section "${category}"`);
  const relevant = findings.filter((finding) => finding.category === category && finding.supportState === "supported");
  if (relevant.length === 0) return { id: meta.id, label: meta.id, weight: meta.weight, score: 100, findingCount: 0 };
  const penalty = relevant.reduce((total, finding) => {
    if (finding.status === "passing" || finding.status === "info") return total;
    return total + severityPenalty[finding.severity];
  }, 0);
  return { id: meta.id, label: meta.id, weight: meta.weight, score: Math.max(20, 100 - penalty), findingCount: relevant.length };
}

function scoreLocations(snapshot: NormalizedBusinessSnapshot): LocationScore[] {
  return snapshot.locations.map((location) => {
    let score = 100;
    const notes: string[] = [];
    if ((location.metrics.averageRating ?? 5) < 4.2) {
      score -= 12;
      notes.push("rating_below_target");
    }
    if ((location.metrics.responseRate ?? 1) < 0.7) {
      score -= 8;
      notes.push("response_rate_low");
    }
    if ((location.metrics.pageSpeedScore ?? 100) < 70) {
      score -= 10;
      notes.push("performance_weak");
    }
    if ((location.metrics.clicks ?? 0) > 0 && (location.metrics.impressions ?? 0) > 0) {
      const ctr = (location.metrics.clicks ?? 0) / Math.max(1, location.metrics.impressions ?? 1);
      if (ctr < 0.03) {
        score -= 8;
        notes.push("organic_ctr_low");
      }
    }
    return { locationId: location.locationId, label: location.label, score: Math.max(40, score), notes };
  });
}

export function scoreAudit(
  snapshot: NormalizedBusinessSnapshot,
  findings: AuditFinding[],
  focus: ReportFocus,
) {
  const allowedCategories = getCategoriesForReportFocus(focus);
  const supported = sectionCatalog.filter((section) => {
    if (!allowedCategories.has(section.id)) return false;
    if (section.id === "channel_performance") return Boolean(snapshot.campaigns);
    if (section.id === "deliverability") return Boolean(snapshot.deliverability);
    if (section.id === "automation_coverage") return Boolean(snapshot.automations);
    if (section.id === "audience_capture") return Boolean(snapshot.audiences);
    if (section.id === "data_quality") return Boolean(snapshot.events || snapshot.templatesAssets);
    if (section.id === "integration_health") return true;
    if (section.id === "commerce_revenue_attribution") return Boolean(snapshot.revenue || snapshot.commerce);
    if (section.id === "crm_lifecycle_health") return Boolean(snapshot.crm);
    if (section.id === "seo_visibility") return Boolean(snapshot.search);
    if (section.id === "local_presence_health") return Boolean(snapshot.localPresence || snapshot.locations.length);
    if (section.id === "reviews_reputation") return Boolean(snapshot.reputation);
    if (section.id === "website_performance") return Boolean(snapshot.website);
    if (section.id === "technical_seo") return Boolean(snapshot.website);
    if (section.id === "traffic_quality") return Boolean(snapshot.trafficAttribution);
    if (section.id === "paid_media_performance") return Boolean(snapshot.paidMedia);
    return false;
  });

  const sectionScores = supported.map((section) => scoreSection(section.id, findings));
  const totalWeight = sectionScores.reduce((sum, section) => sum + section.weight, 0);
  const totalScore = sectionScores.reduce((sum, section) => sum + section.score * section.weight, 0) / Math.max(1, totalWeight);
  const roundedScore = Math.round(totalScore);
  return {
    score: roundedScore,
    grade: roundedScore >= 90 ? ("A" as const) : roundedScore >= 80 ? ("B" as const) : roundedScore >= 70 ? ("C" as const) : roundedScore >= 60 ? ("D" as const) : ("F" as const),
    sectionScores,
    locationScores: scoreLocations(snapshot),
  };
}

export function buildReport(
  auditId: string,
  client: ClientRecord,
  snapshot: NormalizedBusinessSnapshot,
  findings: AuditFinding[],
  options: {
    execution: AuditReportPayload["execution"];
    reportPeriod?: ReportPeriodRecord | null;
    baselineReport?: AuditReportPayload | null;
    contextEntries?: ContextEntryRecord[];
  },
): AuditReportPayload {
  const locale = client.reportLanguage;
  const relevantCategories = getCategoriesForReportFocus(client.reportFocus);
  const filteredFindings = findings.filter((finding) => relevantCategories.has(finding.category));
  const localizedFindings = filteredFindings.map((finding) => localizeFinding(locale, finding));
  const { score, grade, sectionScores, locationScores } = scoreAudit(
    snapshot,
    localizedFindings,
    client.reportFocus,
  );
  const localizedSectionScores = sectionScores.map((section) => ({
    ...section,
    label: localizeSectionScoreLabel(locale, section.id),
  }));
  const localizedLocationScores = locationScores.map((location) => ({
    ...location,
    notes: localizeLocationNotes(locale, location.notes),
  }));
  const topRisks = localizedFindings.filter((finding) => finding.status !== "passing").slice(0, 3).map((finding) => finding.summary);
  const strengths = localizedFindings.filter((finding) => finding.status === "passing").slice(0, 3).map((finding) => finding.summary);
  const reportPeriod = options.reportPeriod
    ? {
        id: options.reportPeriod.id,
        periodKey: options.reportPeriod.periodKey,
        periodStart: options.reportPeriod.periodStart,
        periodEnd: options.reportPeriod.periodEnd,
        baselinePeriodId: options.reportPeriod.baselinePeriodId,
        baselinePeriodKey: options.baselineReport?.reportPeriod.periodKey ?? null,
        manualInputs: options.reportPeriod.manualInputs,
      }
    : {
        id: null,
        periodKey: null,
        periodStart: null,
        periodEnd: null,
        baselinePeriodId: null,
        baselinePeriodKey: null,
        manualInputs: null,
      };
  const narrative = buildNarrativeSections({
    locale,
    snapshot,
    findings: localizedFindings,
    reportPeriod,
    baselineReport: options.baselineReport ?? null,
    contextEntries: options.contextEntries ?? [],
  });

  return {
    accountId: client.accountId,
    auditId,
    clientId: snapshot.clientId,
    clientName: snapshot.clientName,
    clientIndustryLabel: getClientIndustryLabel(client, locale),
    reportFocus: client.reportFocus,
    generatedAt: snapshot.generatedAt,
    locale,
    score,
    grade,
    summary: {
      supportedSections: localizedSectionScores.map((section) => section.label),
      topRisks,
      strengths,
      locationCount: snapshot.locations.length,
    },
    reportPeriod,
    execution: options.execution,
    sectionScores: localizedSectionScores,
    locationScores: localizedLocationScores,
    findings: localizedFindings,
    dataFacts: narrative.dataFacts,
    providedContext: narrative.providedContext,
    hypotheses: narrative.hypotheses,
    recommendations: narrative.recommendations,
    confidenceNotes: narrative.confidenceNotes,
    snapshot,
  };
}
