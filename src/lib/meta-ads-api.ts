import type { PaidMediaCampaignSnapshot, PaidMediaSection } from "@/lib/audit/types";

const META_GRAPH_API_BASE = "https://graph.facebook.com/v25.0";

interface MetaAdsErrorPayload {
  error?: {
    code?: number;
    message?: string;
    type?: string;
    error_subcode?: number;
  };
}

interface MetaAdsInsightsResponse {
  data?: MetaAdsInsightRow[];
}

interface MetaAdsAccountListResponse {
  data?: MetaAdsAccountResponse[];
}

interface MetaAdsAccountResponse {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
}

interface MetaAdsInsightRow {
  account_currency?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaActionStat[];
  action_values?: MetaActionStat[];
  purchase_roas?: MetaActionStat[];
}

interface MetaActionStat {
  action_type?: string;
  value?: string;
}

export interface MetaAdsAccountSummary {
  adAccountId: string;
  displayName: string;
  currency: string | null;
}

export class MetaAdsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MetaAdsApiError";
    this.status = status;
  }
}

const PURCHASE_ACTION_TYPES = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "app_custom_event.fb_mobile_purchase",
]);

function metricNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isFinite(numeric) ? numeric : 0;
}

function extractErrorMessage(payload: MetaAdsErrorPayload | null, fallback: string) {
  return payload?.error?.message?.trim() || fallback;
}

async function fetchMetaJson<T>(url: URL, accessToken: string) {
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let payload: MetaAdsErrorPayload | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as MetaAdsErrorPayload;
      } catch {
        payload = null;
      }
    }
    throw new MetaAdsApiError(
      extractErrorMessage(payload, text || "Meta Ads request failed."),
      response.status,
    );
  }

  return (await response.json()) as T;
}

function parseActionValue(stats: MetaActionStat[] | undefined, actionTypes: Set<string>) {
  return (stats ?? []).reduce((total, item) => {
    if (!item.action_type || !actionTypes.has(item.action_type)) {
      return total;
    }
    return total + metricNumber(item.value);
  }, 0);
}

function parseRoas(stats: MetaActionStat[] | undefined) {
  const matched = (stats ?? []).find((item) => item.action_type && PURCHASE_ACTION_TYPES.has(item.action_type));
  return matched ? metricNumber(matched.value) : null;
}

export function normalizeMetaAdAccountId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^act_\d+$/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `act_${raw}`;
  return null;
}

function buildInsightsUrl(adAccountId: string, fields: string, extraParams?: Record<string, string>) {
  const url = new URL(`${META_GRAPH_API_BASE}/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("date_preset", "last_30d");
  url.searchParams.set("limit", "10");
  url.searchParams.set("use_unified_attribution_setting", "true");
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function fetchMetaAdAccounts(accessToken: string) {
  const url = new URL(`${META_GRAPH_API_BASE}/me/adaccounts`);
  url.searchParams.set("fields", "id,account_id,name,currency");
  url.searchParams.set("limit", "200");

  const payload = await fetchMetaJson<MetaAdsAccountListResponse>(url, accessToken);

  return (payload.data ?? [])
    .map((account) => {
      const normalized = normalizeMetaAdAccountId(account.account_id ?? account.id);
      if (!normalized || !account.name) {
        return null;
      }
      return {
        adAccountId: normalized,
        displayName: account.name,
        currency: account.currency?.trim() || null,
      } satisfies MetaAdsAccountSummary;
    })
    .filter((account): account is MetaAdsAccountSummary => Boolean(account))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function verifyMetaAdAccountAccess(accessToken: string, adAccountId: string) {
  const normalized = normalizeMetaAdAccountId(adAccountId);
  if (!normalized) {
    throw new MetaAdsApiError("Enter a valid Meta ad account ID before requesting live data.", 400);
  }

  await fetchMetaJson<MetaAdsAccountResponse>(
    new URL(`${META_GRAPH_API_BASE}/${normalized}?fields=id,account_id,name,currency`),
    accessToken,
  );
}

function mapCampaignRow(row: MetaAdsInsightRow): PaidMediaCampaignSnapshot | null {
  if (!row.campaign_id || !row.campaign_name) {
    return null;
  }

  const purchases = parseActionValue(row.actions, PURCHASE_ACTION_TYPES);
  const purchaseValue = parseActionValue(row.action_values, PURCHASE_ACTION_TYPES);

  return {
    id: row.campaign_id,
    name: row.campaign_name,
    status: null,
    spend: metricNumber(row.spend),
    impressions: metricNumber(row.impressions),
    reach: metricNumber(row.reach),
    clicks: metricNumber(row.clicks),
    ctr: row.ctr == null ? null : metricNumber(row.ctr) / 100,
    cpc: row.cpc == null ? null : metricNumber(row.cpc),
    cpm: row.cpm == null ? null : metricNumber(row.cpm),
    purchases,
    purchaseValue,
    roas: parseRoas(row.purchase_roas),
  };
}

export async function fetchMetaAdsSnapshot(accessToken: string, adAccountId: string): Promise<PaidMediaSection> {
  const normalized = normalizeMetaAdAccountId(adAccountId);
  if (!normalized) {
    throw new MetaAdsApiError("Enter a valid Meta ad account ID before requesting live data.", 400);
  }

  const fields = [
    "account_currency",
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "actions",
    "action_values",
    "purchase_roas",
  ].join(",");

  const [summaryPayload, campaignsPayload] = await Promise.all([
    fetchMetaJson<MetaAdsInsightsResponse>(
      buildInsightsUrl(normalized, fields, { level: "account", limit: "1" }),
      accessToken,
    ),
    fetchMetaJson<MetaAdsInsightsResponse>(
      buildInsightsUrl(normalized, fields, {
        level: "campaign",
        sort: "spend_descending",
      }),
      accessToken,
    ),
  ]);

  const summaryRow = summaryPayload.data?.[0];
  const topCampaigns = (campaignsPayload.data ?? [])
    .map((row) => mapCampaignRow(row))
    .filter((row): row is PaidMediaCampaignSnapshot => Boolean(row));

  return {
    supportState: "supported",
    adAccountId: normalized,
    accountCurrency: summaryRow?.account_currency?.trim() || null,
    spend: metricNumber(summaryRow?.spend),
    impressions: metricNumber(summaryRow?.impressions),
    reach: metricNumber(summaryRow?.reach),
    clicks: metricNumber(summaryRow?.clicks),
    ctr: summaryRow?.ctr == null ? null : metricNumber(summaryRow.ctr) / 100,
    cpc: summaryRow?.cpc == null ? null : metricNumber(summaryRow.cpc),
    cpm: summaryRow?.cpm == null ? null : metricNumber(summaryRow.cpm),
    purchases: parseActionValue(summaryRow?.actions, PURCHASE_ACTION_TYPES),
    purchaseValue: parseActionValue(summaryRow?.action_values, PURCHASE_ACTION_TYPES),
    roas: parseRoas(summaryRow?.purchase_roas),
    topCampaigns,
  };
}
