import type {
  ClientRecord,
  IntegrationPropertySummary,
  SearchPageSnapshot,
  SearchQuerySnapshot,
} from "@/lib/audit/types";
import { GoogleApiError } from "./google-analytics-api";

const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";

interface SearchConsoleErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface SearchConsoleRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface SearchAnalyticsQueryResponse {
  rows?: SearchConsoleRow[];
}

interface SearchConsoleSitesResponse {
  siteEntry?: Array<{
    siteUrl?: string;
    permissionLevel?: string;
  }>;
}

export interface SearchConsoleSnapshot {
  property: string;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
  brandedShare: number | null;
  topQueries: SearchQuerySnapshot[];
  topPages: SearchPageSnapshot[];
}

function buildHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

function extractErrorMessage(payload: SearchConsoleErrorPayload | null, fallback: string) {
  return payload?.error?.message?.trim() || fallback;
}

async function fetchSearchConsoleJson<T>(
  input: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers">,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...buildHeaders(accessToken),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let payload: SearchConsoleErrorPayload | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as SearchConsoleErrorPayload;
      } catch {
        payload = null;
      }
    }
    throw new GoogleApiError(
      extractErrorMessage(payload, text || "Google Search Console request failed."),
      response.status,
    );
  }

  return (await response.json()) as T;
}

function metricNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
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

function normalizeRootUrl(url: URL) {
  url.hash = "";
  url.search = "";
  if (!url.pathname) {
    url.pathname = "/";
  }
  return url.toString();
}

export function normalizeSearchConsolePropertyId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("sc-domain:")) {
    const domain = raw.slice("sc-domain:".length).trim().toLowerCase();
    return domain ? `sc-domain:${domain}` : null;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return normalizeRootUrl(url);
  } catch {
    return null;
  }
}

function normalizePermissionLevel(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.replace("site", "").replaceAll("_", " ").trim() || normalized;
}

function siteUrlToDisplayName(siteUrl: string) {
  return siteUrl.replace(/^sc-domain:/, "");
}

function normalizePageValue(value: string) {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}`;
    return path || "/";
  } catch {
    return value;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBrandTokens(client: ClientRecord) {
  const tokens = new Set<string>();

  for (const token of client.name.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 3) {
      tokens.add(token);
    }
  }

  if (client.primaryDomain) {
    try {
      const hostname = new URL(client.primaryDomain).hostname.toLowerCase().replace(/^www\./, "");
      for (const token of hostname.split(/[^a-z0-9]+|\./)) {
        if (token.length >= 3 && !["com", "net", "org", "io", "co", "br"].includes(token)) {
          tokens.add(token);
        }
      }
    } catch {
      // Ignore malformed domains; the client name tokens are enough for the heuristic.
    }
  }

  return [...tokens];
}

function isBrandedQuery(term: string, brandTokens: string[]) {
  const normalized = term.toLowerCase();
  return brandTokens.some((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(normalized));
}

function computeBrandedShare(
  client: ClientRecord,
  totalClicks: number,
  topQueries: SearchQuerySnapshot[],
) {
  if (totalClicks <= 0 || topQueries.length === 0) {
    return null;
  }

  const brandTokens = buildBrandTokens(client);
  if (brandTokens.length === 0) {
    return null;
  }

  const brandedClicks = topQueries.reduce((sum, query) => (
    isBrandedQuery(query.term, brandTokens) ? sum + query.clicks : sum
  ), 0);

  return brandedClicks > 0 ? Number((brandedClicks / totalClicks).toFixed(4)) : 0;
}

async function querySearchAnalytics(
  accessToken: string,
  property: string,
  body: Record<string, unknown>,
) {
  return fetchSearchConsoleJson<SearchAnalyticsQueryResponse>(
    `${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchSearchConsolePropertySummaries(accessToken: string) {
  const payload = await fetchSearchConsoleJson<SearchConsoleSitesResponse>(
    `${SEARCH_CONSOLE_API_BASE}/sites`,
    accessToken,
  );

  return (payload.siteEntry ?? [])
    .map((entry) => {
      const property = normalizeSearchConsolePropertyId(entry.siteUrl);
      if (!property) return null;
      return {
        resourceName: property,
        propertyId: property,
        displayName: siteUrlToDisplayName(property),
        parentAccountName: normalizePermissionLevel(entry.permissionLevel),
      } satisfies IntegrationPropertySummary;
    })
    .filter((entry): entry is IntegrationPropertySummary => Boolean(entry))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function verifySearchConsolePropertyAccess(accessToken: string, property: string) {
  const normalizedProperty = normalizeSearchConsolePropertyId(property);
  if (!normalizedProperty) {
    throw new GoogleApiError(
      "Enter a valid Search Console property before requesting live data.",
      400,
    );
  }

  const range = defaultDateRange();
  await querySearchAnalytics(accessToken, normalizedProperty, {
    startDate: range.startDate,
    endDate: range.endDate,
    rowLimit: 1,
    dimensions: ["query"],
  });
}

export async function fetchSearchConsoleSnapshot(
  accessToken: string,
  client: ClientRecord,
  property: string,
  dateRange?: {
    startDate: string;
    endDate: string;
  },
): Promise<SearchConsoleSnapshot> {
  const normalizedProperty = normalizeSearchConsolePropertyId(property);
  if (!normalizedProperty) {
    throw new GoogleApiError(
      "Enter a valid Search Console property before requesting live data.",
      400,
    );
  }

  const resolvedDateRange = dateRange ?? defaultDateRange();
  const baseRequest = {
    startDate: resolvedDateRange.startDate,
    endDate: resolvedDateRange.endDate,
  };

  const [summaryPayload, topQueriesPayload, topPagesPayload] = await Promise.all([
    querySearchAnalytics(accessToken, normalizedProperty, {
      ...baseRequest,
      rowLimit: 1,
    }),
    querySearchAnalytics(accessToken, normalizedProperty, {
      ...baseRequest,
      dimensions: ["query"],
      rowLimit: 8,
    }),
    querySearchAnalytics(accessToken, normalizedProperty, {
      ...baseRequest,
      dimensions: ["page"],
      rowLimit: 8,
    }),
  ]);

  const summaryRow = summaryPayload.rows?.[0];
  const clicks = metricNumber(summaryRow?.clicks);
  const impressions = metricNumber(summaryRow?.impressions);
  const ctr = metricNumber(summaryRow?.ctr);
  const averagePosition = metricNumber(summaryRow?.position);

  const topQueries: SearchQuerySnapshot[] = (topQueriesPayload.rows ?? [])
    .map((row) => {
      const term = row.keys?.[0]?.trim();
      if (!term) return null;
      return {
        term,
        clicks: metricNumber(row.clicks),
        impressions: metricNumber(row.impressions),
        ctr: metricNumber(row.ctr),
        position: metricNumber(row.position),
      } satisfies SearchQuerySnapshot;
    })
    .filter((row): row is SearchQuerySnapshot => Boolean(row));

  const topPages: SearchPageSnapshot[] = (topPagesPayload.rows ?? [])
    .map((row) => {
      const page = row.keys?.[0]?.trim();
      if (!page) return null;
      return {
        page: normalizePageValue(page),
        clicks: metricNumber(row.clicks),
        impressions: metricNumber(row.impressions),
        ctr: metricNumber(row.ctr),
        position: metricNumber(row.position),
      } satisfies SearchPageSnapshot;
    })
    .filter((row): row is SearchPageSnapshot => Boolean(row));

  return {
    property: normalizedProperty,
    clicks,
    impressions,
    ctr,
    averagePosition,
    brandedShare: computeBrandedShare(client, clicks, topQueries),
    topQueries,
    topPages,
  };
}
