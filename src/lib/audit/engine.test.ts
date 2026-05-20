import { describe, expect, it } from "vitest";
import { buildReport, evaluateRules, scoreAudit } from "../rules";
import { getConnector, mergeSnapshots } from "../connectors";
import type { ClientRecord, IntegrationRecord } from "./types";

const client: ClientRecord = {
  id: "client_test",
  accountId: "acct_test",
  name: "Northwind Demo",
  industry: "Retail",
  industryLabelPt: "Varejo",
  operatingModel: "composed_source",
  primaryDomain: "https://northwind.example",
  reportLanguage: "pt-BR",
  reportFocus: "full_funnel",
  reportIntro: null,
  reportBenchmarks: null,
  referenceReportNotes: null,
  monthlyReportEnabled: false,
  monthlyReportDay: null,
  monthlyReportAutoGenerate: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function integration(
  id: string,
  platformKey: IntegrationRecord["platformKey"],
  platformType: IntegrationRecord["platformType"],
): IntegrationRecord {
  return {
    id,
    accountId: client.accountId,
    clientId: client.id,
    platformKey,
    platformType,
    displayName: platformKey,
    credentials: { authOrigin: "none" },
    settings: { demoMode: true, targetUrl: client.primaryDomain ?? undefined },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("multi-platform audit domain", () => {
  it("merges messaging and google snapshots into one composed snapshot", async () => {
    const klaviyo = getConnector("klaviyo");
    const searchConsole = getConnector("google_search_console");
    const ga4 = getConnector("google_analytics");

    const [messaging, search, analytics] = await Promise.all([
      klaviyo.fetchSnapshot({
        client,
        integration: integration("int_1", "klaviyo", "messaging_automation"),
        requestedCapabilities: klaviyo.capabilities(),
      }),
      searchConsole.fetchSnapshot({
        client,
        integration: integration("int_2", "google_search_console", "search_visibility"),
        requestedCapabilities: searchConsole.capabilities(),
      }),
      ga4.fetchSnapshot({
        client,
        integration: integration("int_3", "google_analytics", "web_analytics"),
        requestedCapabilities: ga4.capabilities(),
      }),
    ]);

    const merged = mergeSnapshots(client, [messaging, search, analytics]);

    expect(merged.platformLabels).toContain("Klaviyo");
    expect(merged.platformLabels).toContain("Google Search Console");
    expect(merged.search?.impressions).toBeGreaterThan(1000);
    expect(merged.trafficAttribution?.users).toBeGreaterThan(1000);
    expect(merged.locations.length).toBe(0);
  });

  it("scores a google plus website audit with supported sections", async () => {
    const search = getConnector("google_search_console");
    const website = getConnector("website_crawler");

    const [searchSnapshot, websiteSnapshot] = await Promise.all([
      search.fetchSnapshot({
        client,
        integration: integration("int_4", "google_search_console", "search_visibility"),
        requestedCapabilities: search.capabilities(),
      }),
      website.fetchSnapshot({
        client,
        integration: integration("int_5", "website_crawler", "website_intelligence"),
        requestedCapabilities: website.capabilities(),
      }),
    ]);

    const merged = mergeSnapshots(client, [searchSnapshot, websiteSnapshot]);
    const findings = evaluateRules(merged);
    const scoring = scoreAudit(merged, findings, client.reportFocus);
    const report = buildReport("audit_demo", client, merged, findings, {
      execution: {
        includedIntegrations: [
          { id: "int_4", label: "google_search_console", platformKey: "google_search_console" },
          { id: "int_5", label: "website_crawler", platformKey: "website_crawler" },
        ],
        excludedIntegrations: [],
        coverage: [
          {
            id: "int_4",
            label: "google_search_console",
            platformKey: "google_search_console",
            status: "included",
            reason: null,
          },
          {
            id: "int_5",
            label: "website_crawler",
            platformKey: "website_crawler",
            status: "included",
            reason: null,
          },
        ],
      },
    });

    expect(scoring.score).toBeGreaterThan(55);
    expect(report.summary.locationCount).toBeGreaterThanOrEqual(0);
    expect(report.sectionScores.some((section) => section.id === "seo_visibility")).toBe(true);
    expect(report.locale).toBe("pt-BR");
  });

  it("keeps live paid media sources separate while aggregating the rollup", async () => {
    const googleAds = getConnector("google_ads");
    const metaAds = getConnector("meta_ads");

    const [googleSnapshot, metaSnapshot] = await Promise.all([
      googleAds.fetchSnapshot({
        client,
        integration: integration("int_google_ads", "google_ads", "paid_media"),
        requestedCapabilities: googleAds.capabilities(),
      }),
      metaAds.fetchSnapshot({
        client,
        integration: integration("int_meta_ads", "meta_ads", "paid_media"),
        requestedCapabilities: metaAds.capabilities(),
      }),
    ]);

    const merged = mergeSnapshots(client, [googleSnapshot, metaSnapshot]);

    expect(merged.paidMediaSources).toHaveLength(2);
    expect(merged.paidMedia?.spend).toBe(
      merged.paidMediaSources.reduce((total, source) => total + source.spend, 0),
    );
    expect(merged.paidMedia?.topCampaigns[0]?.name).toMatch(/Google Ads|Meta Ads/);
  });

  it("tracks task actions inside the report period", async () => {
    const wrike = getConnector("wrike");
    const snapshot = await wrike.fetchSnapshot({
      client,
      integration: integration("int_wrike", "wrike", "task_management"),
      requestedCapabilities: wrike.capabilities(),
      dateRange: {
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      },
    });

    expect(snapshot.taskManagement?.actionedTasks.length).toBeGreaterThan(0);
    expect(snapshot.taskManagement?.completedTasksInPeriod.length).toBeGreaterThan(0);
    expect(snapshot.taskManagement?.activeTasksTouchedInPeriod.length).toBeGreaterThan(0);
  });
});
