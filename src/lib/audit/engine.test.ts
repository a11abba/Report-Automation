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
      includedIntegrations: [
        { id: "int_4", label: "google_search_console", platformKey: "google_search_console" },
        { id: "int_5", label: "website_crawler", platformKey: "website_crawler" },
      ],
      excludedIntegrations: [],
    });

    expect(scoring.score).toBeGreaterThan(55);
    expect(report.summary.locationCount).toBeGreaterThanOrEqual(0);
    expect(report.sectionScores.some((section) => section.id === "seo_visibility")).toBe(true);
    expect(report.locale).toBe("pt-BR");
  });
});
