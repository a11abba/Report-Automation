import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientRecord, IntegrationRecord } from "./audit/types";
import { getConnector } from "./connectors";

const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
};

const client: ClientRecord = {
  id: "client_ga4",
  name: "FXR",
  industry: "Retail",
  industryLabelPt: "Varejo",
  operatingModel: "single_source",
  primaryDomain: "https://fxrracing.example",
  reportLanguage: "pt-BR",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function integration(
  patch: Partial<IntegrationRecord> & {
    settings?: Partial<IntegrationRecord["settings"]>;
    credentials?: Partial<IntegrationRecord["credentials"]>;
  } = {},
): IntegrationRecord {
  return {
    id: "int_ga4",
    clientId: client.id,
    platformKey: "google_analytics",
    platformType: "web_analytics",
    displayName: "Google Analytics 4",
    credentials: {
      authOrigin: "oauth",
      ...patch.credentials,
    },
    settings: {
      demoMode: false,
      ...patch.settings,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_OAUTH_REDIRECT_URI = originalEnv.GOOGLE_OAUTH_REDIRECT_URI;
});

describe("google analytics connector", () => {
  it("requires a GA4 property even after OAuth succeeds", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    const connector = getConnector("google_analytics");

    const validation = await connector.validateCredentials(
      integration({
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      }),
    );

    expect(validation.code).toBe("property_required");
    expect(validation.authenticated).toBe(true);
    expect(validation.liveReady).toBe(false);
    expect(validation.mode).toBe("api");
  });

  it("maps live GA4 API data into the report snapshot", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";

    const connector = getConnector("google_analytics");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                metricValues: [
                  { value: "18420" },
                  { value: "23610" },
                  { value: "0.58" },
                  { value: "0.019" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "Organic Search" }],
                metricValues: [{ value: "8120" }, { value: "10010" }, { value: "0.021" }],
              },
              {
                dimensionValues: [{ value: "Direct" }],
                metricValues: [{ value: "4200" }, { value: "5050" }, { value: "0.016" }],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "google" }, { value: "organic" }],
                metricValues: [
                  { value: "9230" },
                  { value: "14120" },
                  { value: "248" },
                  { value: "48210" },
                  { value: "0.026" },
                ],
              },
              {
                dimensionValues: [{ value: "(direct)" }, { value: "(none)" }],
                metricValues: [
                  { value: "5050" },
                  { value: "8140" },
                  { value: "112" },
                  { value: "22640" },
                  { value: "0.022" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "/" }],
                metricValues: [{ value: "6030" }, { value: "0.51" }, { value: "0.011" }],
              },
              {
                dimensionValues: [{ value: "/pricing" }],
                metricValues: [{ value: "980" }, { value: "0.42" }, { value: "0.038" }],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const snapshot = await connector.fetchSnapshot({
      client,
      integration: integration({
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        settings: {
          ga4PropertyId: "123456789",
        },
      }),
      requestedCapabilities: connector.capabilities(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(snapshot.operationalFlags).not.toContain("ga4_demo_mode");
    expect(snapshot.trafficAttribution?.property).toBe("properties/123456789");
    expect(snapshot.trafficAttribution?.users).toBe(18420);
    expect(snapshot.trafficAttribution?.topChannels[0]?.channel).toBe("Organic Search");
    expect(snapshot.trafficAttribution?.topSourceMediums[0]?.source).toBe("google");
    expect(snapshot.trafficAttribution?.topSourceMediums[0]?.medium).toBe("organic");
    expect(snapshot.trafficAttribution?.topLandingPages[1]?.path).toBe("/pricing");
  });
});

describe("google search console connector", () => {
  it("keeps oauth-connected search console out of live-ready state until the real adapter exists", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    const connector = getConnector("google_search_console");

    const validation = await connector.validateCredentials({
      ...integration({
        platformKey: "google_search_console",
        platformType: "search_visibility",
        displayName: "Search Console",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        settings: {
          propertyId: "sc-domain:fxrracing.example",
        },
      }),
      platformKey: "google_search_console",
      platformType: "search_visibility",
    });

    expect(validation.authenticated).toBe(true);
    expect(validation.code).toBe("adapter_pending");
    expect(validation.liveReady).toBe(false);
  });
});
