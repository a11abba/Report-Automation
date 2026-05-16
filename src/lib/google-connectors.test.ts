import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientRecord, IntegrationRecord } from "./audit/types";
import { getConnector } from "./connectors";

const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
};

const client: ClientRecord = {
  id: "client_ga4",
  accountId: "acct_ga4",
  name: "FXR",
  industry: "Retail",
  industryLabelPt: "Varejo",
  operatingModel: "single_source",
  primaryDomain: "https://fxrracing.example",
  reportLanguage: "pt-BR",
  reportFocus: "full_funnel",
  monthlyReportEnabled: false,
  monthlyReportDay: null,
  monthlyReportAutoGenerate: true,
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
    accountId: client.accountId,
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
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = originalEnv.GOOGLE_ADS_DEVELOPER_TOKEN;
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

describe("google ads connector", () => {
  it("requires a customer ID even after OAuth succeeds", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-token";
    const connector = getConnector("google_ads");

    const validation = await connector.validateCredentials(
      integration({
        platformKey: "google_ads",
        platformType: "paid_media",
        displayName: "Google Ads",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      }),
    );

    expect(validation.code).toBe("customer_required");
    expect(validation.authenticated).toBe(true);
    expect(validation.liveReady).toBe(false);
    expect(validation.mode).toBe("api");
  });

  it("reports when the Google Ads API is disabled in the Google Cloud project", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI =
      "http://localhost:3000/api/integrations/google/oauth/callback";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-token";

    const connector = getConnector("google_ads");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message:
              "Google Ads API has not been used in project 881040242091 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/googleads.googleapis.com/overview?project=881040242091 then retry.",
            status: "PERMISSION_DENIED",
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await connector.healthCheck(
      integration({
        platformKey: "google_ads",
        platformType: "paid_media",
        displayName: "Google Ads",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        settings: {
          googleAdsCustomerId: "123-456-7890",
          googleAdsLoginCustomerId: "999-888-7777",
        },
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      code: "api_disabled",
      message:
        "Google Ads API is disabled for this Google Cloud project. Enable googleads.googleapis.com, wait a few minutes, and try again.",
    });
  });

  it("maps live Google Ads API data into the paid media snapshot", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "developer-token";

    const connector = getConnector("google_ads");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                customer: {
                  id: "1234567890",
                  currencyCode: "USD",
                },
                metrics: {
                  costMicros: "6240000000",
                  impressions: "168400",
                  clicks: "4860",
                  ctr: 2.89,
                  averageCpc: "1280000",
                  averageCpm: "37050000",
                  conversions: "88",
                  conversionsValue: 13920,
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                campaign: { id: "1001", name: "Brand Search", status: "ENABLED" },
                metrics: {
                  costMicros: "1820000000",
                  impressions: "25200",
                  clicks: "1480",
                  ctr: 5.87,
                  averageCpc: "1230000",
                  averageCpm: "72220000",
                  conversions: "34",
                  conversionsValue: 5680,
                },
              },
              {
                campaign: { id: "1002", name: "Non-Brand Search", status: "ENABLED" },
                metrics: {
                  costMicros: "2940000000",
                  impressions: "97100",
                  clicks: "2460",
                  ctr: 2.53,
                  averageCpc: "1190000",
                  averageCpm: "30280000",
                  conversions: "39",
                  conversionsValue: 6020,
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const snapshot = await connector.fetchSnapshot({
      client,
      integration: integration({
        platformKey: "google_ads",
        platformType: "paid_media",
        displayName: "Google Ads",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        settings: {
          googleAdsCustomerId: "123-456-7890",
          googleAdsLoginCustomerId: "999-888-7777",
        },
      }),
      requestedCapabilities: connector.capabilities(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.operationalFlags).not.toContain("google_ads_demo_mode");
    expect(snapshot.paidMedia?.adAccountId).toBe("1234567890");
    expect(snapshot.paidMedia?.accountCurrency).toBe("USD");
    expect(snapshot.paidMedia?.spend).toBe(6240);
    expect(snapshot.paidMedia?.purchases).toBe(88);
    expect(snapshot.paidMedia?.topCampaigns[0]?.name).toBe("Brand Search");
    expect(snapshot.paidMedia?.topCampaigns[0]?.ctr).toBe(0.0587);
    expect(snapshot.paidMedia?.roas).toBeCloseTo(2.230769, 5);
  });
});

describe("google search console connector", () => {
  it("requires a property even after OAuth succeeds", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    const connector = getConnector("google_search_console");

    const validation = await connector.validateCredentials(
      integration({
        platformKey: "google_search_console",
        platformType: "search_visibility",
        displayName: "Search Console",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      }),
    );

    expect(validation.authenticated).toBe(true);
    expect(validation.code).toBe("property_required");
    expect(validation.liveReady).toBe(false);
  });

  it("maps live Search Console data into the search snapshot", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    const connector = getConnector("google_search_console");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                clicks: 1480,
                impressions: 26200,
                ctr: 0.056,
                position: 6.4,
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
                keys: ["fxr"],
                clicks: 620,
                impressions: 4800,
                ctr: 0.129,
                position: 1.8,
              },
              {
                keys: ["motocross gear"],
                clicks: 210,
                impressions: 6200,
                ctr: 0.034,
                position: 7.1,
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
                keys: ["https://fxrracing.example/"],
                clicks: 510,
                impressions: 7200,
                ctr: 0.071,
                position: 5.6,
              },
              {
                keys: ["https://fxrracing.example/pricing"],
                clicks: 82,
                impressions: 2500,
                ctr: 0.033,
                position: 9.2,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const snapshot = await connector.fetchSnapshot({
      client,
      integration: integration({
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
      requestedCapabilities: connector.capabilities(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(snapshot.operationalFlags).not.toContain("search_console_demo_mode");
    expect(snapshot.search?.property).toBe("sc-domain:fxrracing.example");
    expect(snapshot.search?.clicks).toBe(1480);
    expect(snapshot.search?.topQueries[0]?.term).toBe("fxr");
    expect(snapshot.search?.topPages[1]?.page).toBe("/pricing");
    expect(snapshot.search?.brandedShare).toBeCloseTo(620 / 1480, 4);
  });
});

describe("google business profile connector", () => {
  it("requires an account ID even after OAuth succeeds", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    const connector = getConnector("google_business_profile");

    const validation = await connector.validateCredentials(
      integration({
        platformKey: "google_business_profile",
        platformType: "local_presence",
        displayName: "Business Profile",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      }),
    );

    expect(validation.authenticated).toBe(true);
    expect(validation.code).toBe("business_account_required");
    expect(validation.liveReady).toBe(false);
  });

  it("maps live Business Profile data into the local presence snapshot", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/google/oauth/callback";
    const connector = getConnector("google_business_profile");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [
              {
                name: "accounts/123456789",
                accountName: "FXR Local",
                type: "LOCATION_GROUP",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locations: [
              {
                name: "locations/111",
                title: "Chicago",
                websiteUri: "https://fxrracing.example/chicago",
                profile: { description: "Local showroom" },
                phoneNumbers: { primaryPhone: "+1 312 555 0100" },
                storefrontAddress: {
                  addressLines: ["123 Lake St"],
                  locality: "Chicago",
                  administrativeArea: "IL",
                  postalCode: "60601",
                  regionCode: "US",
                },
                regularHours: { periods: [{ openDay: "MONDAY" }] },
                categories: { primaryCategory: { displayName: "Motorcycle shop" } },
              },
              {
                name: "locations/222",
                title: "Dallas",
                storefrontAddress: {
                  addressLines: ["500 Elm St"],
                  locality: "Dallas",
                  administrativeArea: "TX",
                  postalCode: "75201",
                  regionCode: "US",
                },
                categories: { primaryCategory: { displayName: "Motorcycle shop" } },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reviews: [
              { starRating: "FIVE", comment: "Great service", createTime: "2026-04-03T12:00:00Z", reviewReply: { comment: "Thanks" } },
              { starRating: "FOUR", comment: "Fast delivery", createTime: "2026-04-10T12:00:00Z" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reviews: [
              { starRating: "FIVE", comment: "Helpful staff", createTime: "2026-04-18T12:00:00Z", reviewReply: { comment: "Appreciate it" } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const snapshot = await connector.fetchSnapshot({
      client,
      integration: integration({
        platformKey: "google_business_profile",
        platformType: "local_presence",
        displayName: "Business Profile",
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        settings: {
          businessAccountId: "accounts/123456789",
        },
      }),
      requestedCapabilities: connector.capabilities(),
      dateRange: {
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(snapshot.operationalFlags).not.toContain("business_profile_demo_mode");
    expect(snapshot.localPresence?.accountName).toBe("FXR Local");
    expect(snapshot.localPresence?.locationCount).toBe(2);
    expect(snapshot.localPresence?.completedProfiles).toBe(1);
    expect(snapshot.localPresence?.averageCompletionRate).toBeCloseTo(0.7143, 4);
    expect(snapshot.reputation?.totalReviews).toBe(3);
    expect(snapshot.reputation?.averageRating).toBeCloseTo(4.67, 2);
    expect(snapshot.reputation?.responseRate).toBeCloseTo(2 / 3, 4);
    expect(snapshot.reputation?.unansweredReviews).toBe(1);
    expect(snapshot.locations[0]?.landingPageUrl).toBe("https://fxrracing.example/chicago");
    expect(snapshot.locations[1]?.findings).toContain("Missing website URL");
  });
});
