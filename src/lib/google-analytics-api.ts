import type {
  IntegrationPropertySummary,
  LandingPageSnapshot,
  TrafficChannelSnapshot,
  TrafficSourceMediumSnapshot,
} from "@/lib/audit/types";

const GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta";

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface RunReportResponse {
  rows?: RunReportRow[];
}

interface RunReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

interface AccountSummariesResponse {
  accountSummaries?: Array<{
    displayName?: string;
    propertySummaries?: Array<{
      property?: string;
      displayName?: string;
    }>;
  }>;
  nextPageToken?: string;
}

export interface Ga4TrafficSnapshot {
  property: string;
  users: number;
  sessions: number;
  engagementRate: number;
  conversionRate: number;
  topChannels: TrafficChannelSnapshot[];
  topSourceMediums: TrafficSourceMediumSnapshot[];
  topLandingPages: LandingPageSnapshot[];
}

export class GoogleApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

function buildGoogleHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

function extractErrorMessage(payload: GoogleApiErrorPayload | null, fallback: string) {
  return payload?.error?.message?.trim() || fallback;
}

async function fetchGoogleJson<T>(
  input: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers">,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...buildGoogleHeaders(accessToken),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let payload: GoogleApiErrorPayload | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as GoogleApiErrorPayload;
      } catch {
        payload = null;
      }
    }
    throw new GoogleApiError(
      extractErrorMessage(payload, text || "Google Analytics request failed."),
      response.status,
    );
  }

  return (await response.json()) as T;
}

function metricNumber(
  row: RunReportRow,
  index: number,
) {
  const raw = row.metricValues?.[index]?.value;
  const parsed = raw == null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dimensionValue(
  row: RunReportRow,
  index: number,
) {
  return row.dimensionValues?.[index]?.value?.trim() ?? "";
}

export function normalizeGa4PropertyId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^properties\/\d+$/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `properties/${raw}`;
  return null;
}

function propertyIdFromResource(resourceName: string) {
  const normalized = normalizeGa4PropertyId(resourceName);
  return normalized ? normalized.replace("properties/", "") : resourceName;
}

async function runGa4Report(
  accessToken: string,
  property: string,
  body: Record<string, unknown>,
) {
  return fetchGoogleJson<RunReportResponse>(
    `${GA4_DATA_API_BASE}/${property}:runReport`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchGa4PropertySummaries(accessToken: string) {
  const properties: IntegrationPropertySummary[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GA4_ADMIN_API_BASE}/accountSummaries`);
    url.searchParams.set("pageSize", "200");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await fetchGoogleJson<AccountSummariesResponse>(url.toString(), accessToken);
    for (const accountSummary of payload.accountSummaries ?? []) {
      for (const propertySummary of accountSummary.propertySummaries ?? []) {
        if (!propertySummary.property || !propertySummary.displayName) continue;
        properties.push({
          resourceName: propertySummary.property,
          propertyId: propertyIdFromResource(propertySummary.property),
          displayName: propertySummary.displayName,
          parentAccountName: accountSummary.displayName?.trim() || null,
        });
      }
    }
    pageToken = payload.nextPageToken || undefined;
  } while (pageToken);

  return properties.sort((left, right) =>
    `${left.parentAccountName ?? ""} ${left.displayName}`.localeCompare(
      `${right.parentAccountName ?? ""} ${right.displayName}`,
    ),
  );
}

export async function verifyGa4PropertyAccess(accessToken: string, property: string) {
  await runGa4Report(accessToken, property, {
    dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
    metrics: [{ name: "sessions" }],
    keepEmptyRows: true,
    limit: "1",
  });
}

export async function fetchGa4TrafficSnapshot(accessToken: string, property: string): Promise<Ga4TrafficSnapshot> {
  const dateRanges = [{ startDate: "30daysAgo", endDate: "yesterday" }];
  const [summaryReport, channelReport, sourceMediumReport, landingPageReport] = await Promise.all([
    runGa4Report(accessToken, property, {
      dateRanges,
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "sessionKeyEventRate" },
      ],
      keepEmptyRows: true,
      limit: "1",
    }),
    runGa4Report(accessToken, property, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "sessionKeyEventRate" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "5",
    }),
    runGa4Report(accessToken, property, {
      dateRanges,
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "keyEvents" },
        { name: "purchaseRevenue" },
        { name: "sessionKeyEventRate" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "8",
    }),
    runGa4Report(accessToken, property, {
      dateRanges,
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "sessionKeyEventRate" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "5",
    }),
  ]);

  const summaryRow = summaryReport.rows?.[0];
  const users = summaryRow ? metricNumber(summaryRow, 0) : 0;
  const sessions = summaryRow ? metricNumber(summaryRow, 1) : 0;
  const engagementRate = summaryRow ? metricNumber(summaryRow, 2) : 0;
  const conversionRate = summaryRow ? metricNumber(summaryRow, 3) : 0;

  const topChannels: TrafficChannelSnapshot[] = (channelReport.rows ?? []).map((row) => {
    const channelSessions = metricNumber(row, 1);
    return {
      channel: dimensionValue(row, 0) || "(not set)",
      users: metricNumber(row, 0),
      sessions: channelSessions,
      conversionRate: metricNumber(row, 2),
      share: sessions > 0 ? channelSessions / sessions : 0,
    };
  });

  const topSourceMediums: TrafficSourceMediumSnapshot[] = (sourceMediumReport.rows ?? [])
    .map((row) => {
      const source = dimensionValue(row, 0) || "(direct)";
      const medium = dimensionValue(row, 1) || "(none)";
      const sourceSessions = metricNumber(row, 0);
      return {
        source,
        medium,
        sessions: sourceSessions,
        pageViews: metricNumber(row, 1),
        keyEvents: metricNumber(row, 2),
        revenue: metricNumber(row, 3),
        conversionRate: metricNumber(row, 4),
        share: sessions > 0 ? sourceSessions / sessions : 0,
      };
    })
    .filter((row) => row.source.length > 0 || row.medium.length > 0);

  const topLandingPages: LandingPageSnapshot[] = (landingPageReport.rows ?? [])
    .map((row) => ({
      path: dimensionValue(row, 0),
      sessions: metricNumber(row, 0),
      engagementRate: metricNumber(row, 1),
      conversionRate: metricNumber(row, 2),
    }))
    .filter((row) => row.path.length > 0 && row.path !== "(not set)");

  return {
    property,
    users,
    sessions,
    engagementRate,
    conversionRate,
    topChannels,
    topSourceMediums,
    topLandingPages,
  };
}
