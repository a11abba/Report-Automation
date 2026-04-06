import { describe, expect, it } from "vitest";
import { renderReportHtml } from "../reports";
import { buildReport, evaluateRules } from "../rules";
import { getConnector, mergeSnapshots } from "../connectors";
import type { ClientRecord, IntegrationRecord } from "./types";

const client: ClientRecord = {
  id: "client_pdf",
  name: "Aurora Health",
  industry: "Healthcare",
  industryLabelPt: "Saude",
  operatingModel: "composed_source",
  primaryDomain: "https://aurora.example",
  reportLanguage: "pt-PT",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const integrations: IntegrationRecord[] = [
  {
    id: "int_sc",
    clientId: client.id,
    platformKey: "google_search_console",
    platformType: "search_visibility",
    displayName: "Search Console",
    credentials: { authOrigin: "none" },
    settings: { demoMode: true, targetUrl: client.primaryDomain ?? undefined },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "int_gbp",
    clientId: client.id,
    platformKey: "google_business_profile",
    platformType: "local_presence",
    displayName: "Business Profile",
    credentials: { authOrigin: "none" },
    settings: { demoMode: true, targetUrl: client.primaryDomain ?? undefined },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("report rendering", () => {
  it("renders google and location data in report html", async () => {
    const snapshots = await Promise.all(
      integrations.map((integration) =>
        getConnector(integration.platformKey).fetchSnapshot({
          client,
          integration,
          requestedCapabilities: getConnector(integration.platformKey).capabilities(),
        }),
      ),
    );
    const merged = mergeSnapshots(client, snapshots);
    const report = buildReport("audit_pdf", client, merged, evaluateRules(merged), {
      includedIntegrations: integrations.map((integration) => ({
        id: integration.id,
        label: integration.displayName,
        platformKey: integration.platformKey,
      })),
      excludedIntegrations: [],
    });
    const html = renderReportHtml(report);

    expect(html).toContain("Auditoria de Crescimento Multi-Plataforma");
    expect(html).toContain(report.clientName);
    expect(html).toContain("Localizações");
    expect(html).toContain("Saude");
  });
});
