import type { IntegrationRecord } from "@/lib/audit/types";
import {
  fetchGoogleAdsAccessibleCustomers,
  resolveGoogleAdsCustomerSelection,
} from "@/lib/google-ads-api";
import { refreshGoogleAccessToken } from "@/lib/google-auth";
import { hydrateIntegrationForExecution } from "@/services/integrations";

export async function validateGoogleAdsSelection(
  integration: IntegrationRecord,
  customerId: string,
  loginCustomerId?: string | null,
) {
  const hydrated = await hydrateIntegrationForExecution(integration);
  let accessToken = hydrated.credentials.accessToken;
  const expiresAt = hydrated.credentials.expiresAt
    ? new Date(hydrated.credentials.expiresAt).getTime()
    : 0;

  if (
    (!accessToken || (Number.isFinite(expiresAt) && expiresAt - Date.now() < 5 * 60 * 1000)) &&
    hydrated.credentials.refreshToken
  ) {
    const refreshed = await refreshGoogleAccessToken(
      hydrated.credentials.refreshToken,
      hydrated.credentials.scopes,
    );
    accessToken = refreshed.accessToken;
  }

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!accessToken || !developerToken) {
    throw new Error(
      "Connect Google Ads with OAuth and configure the developer token before selecting an account.",
    );
  }

  const customers = await fetchGoogleAdsAccessibleCustomers(accessToken, developerToken);
  return resolveGoogleAdsCustomerSelection(customers, customerId, loginCustomerId);
}
