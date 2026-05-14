import type { PaidMediaCampaignSnapshot, PaidMediaSection } from "@/lib/audit/types";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v24";

interface GoogleAdsErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GoogleAdsSearchResponse {
  results?: GoogleAdsRow[];
  nextPageToken?: string;
}

interface GoogleAdsAccessibleCustomersResponse {
  resourceNames?: string[];
}

interface GoogleAdsRow {
  customer?: {
    id?: string;
    descriptiveName?: string;
    currencyCode?: string;
  };
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
  };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    ctr?: number | string;
    averageCpc?: string;
    averageCpm?: string;
    conversions?: string;
    conversionsValue?: number | string;
  };
}

interface GoogleAdsRequestOptions {
  loginCustomerId?: string | null;
}

interface GoogleAdsCustomerSummary {
  customerId: string;
  displayName: string;
  currencyCode: string | null;
}

export class GoogleAdsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleAdsApiError";
    this.status = status;
  }
}

function extractErrorMessage(payload: GoogleAdsErrorPayload | null, fallback: string) {
  return payload?.error?.message?.trim() || fallback;
}

function metricNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricCurrencyFromMicros(value: string | number | null | undefined) {
  return metricNumber(value) / 1_000_000;
}

function metricPercent(value: string | number | null | undefined) {
  const numeric = metricNumber(value);
  if (numeric === 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

function buildHeaders(accessToken: string, developerToken: string, loginCustomerId?: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "developer-token": developerToken,
  };

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  return headers;
}

async function parseGoogleAdsError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  let payload: GoogleAdsErrorPayload | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as GoogleAdsErrorPayload;
    } catch {
      payload = null;
    }
  }

  throw new GoogleAdsApiError(
    extractErrorMessage(payload, text || fallback),
    response.status,
  );
}

async function fetchGoogleAdsJson<T>(
  input: string,
  accessToken: string,
  developerToken: string,
  init?: Omit<RequestInit, "headers">,
  options?: GoogleAdsRequestOptions,
) {
  const response = await fetch(input, {
    ...init,
    headers: buildHeaders(accessToken, developerToken, options?.loginCustomerId),
    cache: "no-store",
  });

  if (!response.ok) {
    await parseGoogleAdsError(response, "Google Ads request failed.");
  }

  return (await response.json()) as T;
}

export function normalizeGoogleAdsCustomerId(value: string | null | undefined) {
  const normalized = value?.replaceAll("-", "").trim() ?? "";
  return /^\d+$/.test(normalized) ? normalized : null;
}

function extractCustomerId(resourceName: string) {
  const match = resourceName.match(/^customers\/(\d+)$/);
  return match?.[1] ?? null;
}

async function runGoogleAdsSearch(
  accessToken: string,
  developerToken: string,
  customerId: string,
  query: string,
  options?: GoogleAdsRequestOptions,
) {
  return fetchGoogleAdsJson<GoogleAdsSearchResponse>(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`,
    accessToken,
    developerToken,
    {
      method: "POST",
      body: JSON.stringify({ query }),
    },
    options,
  );
}

async function readGoogleAdsCustomerSummary(
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId?: string | null,
) {
  const payload = await runGoogleAdsSearch(
    accessToken,
    developerToken,
    customerId,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
    { loginCustomerId },
  );
  const row = payload.results?.[0];
  const resolvedCustomerId = normalizeGoogleAdsCustomerId(row?.customer?.id ?? customerId) ?? customerId;
  return {
    customerId: resolvedCustomerId,
    displayName: row?.customer?.descriptiveName?.trim() || `Google Ads ${resolvedCustomerId}`,
    currencyCode: row?.customer?.currencyCode?.trim() || null,
  } satisfies GoogleAdsCustomerSummary;
}

function defaultDateRange() {
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

function buildDateFilter(dateRange?: { startDate: string; endDate: string }) {
  const resolved = dateRange ?? defaultDateRange();
  return `segments.date BETWEEN '${resolved.startDate}' AND '${resolved.endDate}'`;
}

function mapCampaignRow(row: GoogleAdsRow): PaidMediaCampaignSnapshot | null {
  const campaignId = normalizeGoogleAdsCustomerId(row.campaign?.id);
  const campaignName = row.campaign?.name?.trim();
  if (!campaignId || !campaignName) {
    return null;
  }

  const spend = metricCurrencyFromMicros(row.metrics?.costMicros);
  const purchaseValue = metricNumber(row.metrics?.conversionsValue);

  return {
    id: campaignId,
    name: campaignName,
    status: row.campaign?.status?.trim() || null,
    spend,
    impressions: metricNumber(row.metrics?.impressions),
    reach: 0,
    clicks: metricNumber(row.metrics?.clicks),
    ctr: metricPercent(row.metrics?.ctr),
    cpc: row.metrics?.averageCpc == null ? null : metricCurrencyFromMicros(row.metrics.averageCpc),
    cpm: row.metrics?.averageCpm == null ? null : metricCurrencyFromMicros(row.metrics.averageCpm),
    purchases: metricNumber(row.metrics?.conversions),
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : null,
  };
}

export async function fetchGoogleAdsAccessibleCustomers(
  accessToken: string,
  developerToken: string,
) {
  const payload = await fetchGoogleAdsJson<GoogleAdsAccessibleCustomersResponse>(
    `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    accessToken,
    developerToken,
    {
      method: "GET",
    },
  );

  const customerIds = (payload.resourceNames ?? [])
    .map((resourceName) => extractCustomerId(resourceName))
    .filter((customerId): customerId is string => Boolean(customerId))
    .slice(0, 20);

  const summaries = await Promise.all(
    customerIds.map(async (customerId) => {
      try {
        return await readGoogleAdsCustomerSummary(accessToken, developerToken, customerId);
      } catch {
        return {
          customerId,
          displayName: `Google Ads ${customerId}`,
          currencyCode: null,
        } satisfies GoogleAdsCustomerSummary;
      }
    }),
  );

  return summaries.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function verifyGoogleAdsCustomerAccess(
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId?: string | null,
) {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  const normalizedLoginCustomerId = normalizeGoogleAdsCustomerId(loginCustomerId);
  if (!normalizedCustomerId) {
    throw new GoogleAdsApiError("Enter a valid Google Ads customer ID before requesting live data.", 400);
  }

  return readGoogleAdsCustomerSummary(
    accessToken,
    developerToken,
    normalizedCustomerId,
    normalizedLoginCustomerId,
  );
}

export async function fetchGoogleAdsSnapshot(
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId?: string | null,
  dateRange?: {
    startDate: string;
    endDate: string;
  },
): Promise<PaidMediaSection> {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  const normalizedLoginCustomerId = normalizeGoogleAdsCustomerId(loginCustomerId);

  if (!normalizedCustomerId) {
    throw new GoogleAdsApiError("Enter a valid Google Ads customer ID before requesting live data.", 400);
  }

  const dateFilter = buildDateFilter(dateRange);
  const [summaryPayload, campaignsPayload] = await Promise.all([
    runGoogleAdsSearch(
      accessToken,
      developerToken,
      normalizedCustomerId,
      [
        "SELECT customer.id, customer.currency_code, metrics.cost_micros, metrics.impressions,",
        "metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm,",
        "metrics.conversions, metrics.conversions_value",
        "FROM customer",
        `WHERE ${dateFilter}`,
      ].join(" "),
      { loginCustomerId: normalizedLoginCustomerId },
    ),
    runGoogleAdsSearch(
      accessToken,
      developerToken,
      normalizedCustomerId,
      [
        "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros,",
        "metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm,",
        "metrics.conversions, metrics.conversions_value",
        "FROM campaign",
        `WHERE ${dateFilter} AND campaign.status != 'REMOVED'`,
        "ORDER BY metrics.cost_micros DESC",
        "LIMIT 10",
      ].join(" "),
      { loginCustomerId: normalizedLoginCustomerId },
    ),
  ]);

  const summaryRow = summaryPayload.results?.[0];
  const spend = metricCurrencyFromMicros(summaryRow?.metrics?.costMicros);
  const purchaseValue = metricNumber(summaryRow?.metrics?.conversionsValue);
  const topCampaigns = (campaignsPayload.results ?? [])
    .map((row) => mapCampaignRow(row))
    .filter((row): row is PaidMediaCampaignSnapshot => Boolean(row));

  return {
    supportState: "supported",
    adAccountId: normalizedCustomerId,
    accountCurrency: summaryRow?.customer?.currencyCode?.trim() || null,
    spend,
    impressions: metricNumber(summaryRow?.metrics?.impressions),
    reach: 0,
    clicks: metricNumber(summaryRow?.metrics?.clicks),
    ctr: summaryRow?.metrics?.ctr == null ? null : metricPercent(summaryRow.metrics.ctr),
    cpc: summaryRow?.metrics?.averageCpc == null ? null : metricCurrencyFromMicros(summaryRow.metrics.averageCpc),
    cpm: summaryRow?.metrics?.averageCpm == null ? null : metricCurrencyFromMicros(summaryRow.metrics.averageCpm),
    purchases: metricNumber(summaryRow?.metrics?.conversions),
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : null,
    topCampaigns,
  };
}
