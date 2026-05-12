import { afterEach, describe, expect, it } from "vitest";
import type { ClientRecord, IntegrationRecord } from "./audit/types";
import { getConnector } from "./connectors";

const originalEnv = {
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
  MICROSOFT_OAUTH_REDIRECT_URI: process.env.MICROSOFT_OAUTH_REDIRECT_URI,
  MICROSOFT_ADS_DEVELOPER_TOKEN: process.env.MICROSOFT_ADS_DEVELOPER_TOKEN,
};

const client: ClientRecord = {
  id: "client_msft",
  accountId: "acct_msft",
  name: "Natural Life Collections",
  industry: "Retail",
  industryLabelPt: "Varejo",
  operatingModel: "single_source",
  primaryDomain: "https://naturallifecollections.example",
  reportLanguage: "pt-BR",
  reportFocus: "paid_media",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function integration(
  platformKey: IntegrationRecord["platformKey"],
  platformType: IntegrationRecord["platformType"],
  patch: Partial<IntegrationRecord> & {
    settings?: Partial<IntegrationRecord["settings"]>;
    credentials?: Partial<IntegrationRecord["credentials"]>;
  } = {},
): IntegrationRecord {
  return {
    id: `int_${platformKey}`,
    accountId: client.accountId,
    clientId: client.id,
    platformKey,
    platformType,
    displayName: platformKey,
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
  process.env.MICROSOFT_CLIENT_ID = originalEnv.MICROSOFT_CLIENT_ID;
  process.env.MICROSOFT_CLIENT_SECRET = originalEnv.MICROSOFT_CLIENT_SECRET;
  process.env.MICROSOFT_OAUTH_REDIRECT_URI = originalEnv.MICROSOFT_OAUTH_REDIRECT_URI;
  process.env.MICROSOFT_ADS_DEVELOPER_TOKEN = originalEnv.MICROSOFT_ADS_DEVELOPER_TOKEN;
});

describe("microsoft connectors", () => {
  it("requires customer and account IDs for Microsoft Ads after OAuth succeeds", async () => {
    process.env.MICROSOFT_CLIENT_ID = "client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
    process.env.MICROSOFT_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/microsoft/oauth/callback";
    process.env.MICROSOFT_ADS_DEVELOPER_TOKEN = "developer-token";

    const connector = getConnector("microsoft_ads");
    const validation = await connector.validateCredentials(
      integration("microsoft_ads", "paid_media", {
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
      }),
    );

    expect(validation.code).toBe("account_required");
    expect(validation.authenticated).toBe(true);
    expect(validation.liveReady).toBe(false);
  });

  it("requires a store ID for Microsoft Merchant Center after OAuth succeeds", async () => {
    process.env.MICROSOFT_CLIENT_ID = "client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "client-secret";
    process.env.MICROSOFT_OAUTH_REDIRECT_URI = "http://localhost:3000/api/integrations/microsoft/oauth/callback";
    process.env.MICROSOFT_ADS_DEVELOPER_TOKEN = "developer-token";

    const connector = getConnector("microsoft_merchant_center");
    const validation = await connector.validateCredentials(
      integration("microsoft_merchant_center", "commerce_pos", {
        credentials: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
        },
        settings: {
          microsoftCustomerId: "501071198",
          microsoftAccountId: "149461593",
        },
      }),
    );

    expect(validation.code).toBe("store_required");
    expect(validation.authenticated).toBe(true);
    expect(validation.liveReady).toBe(false);
  });
});
