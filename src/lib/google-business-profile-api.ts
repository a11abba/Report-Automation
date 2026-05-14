import type {
  IntegrationPropertySummary,
  LocationSnapshot,
  LocalPresenceSection,
  ReputationSection,
} from "@/lib/audit/types";
import { GoogleApiError } from "./google-analytics-api";

const GBP_ACCOUNT_API_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const GBP_BUSINESS_INFO_API_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_REVIEWS_API_BASE = "https://mybusiness.googleapis.com/v4";

interface GoogleBusinessProfileErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GoogleBusinessAccount {
  name: string;
  accountName: string;
  type?: string;
}

interface GoogleBusinessAccountListResponse {
  accounts?: GoogleBusinessAccount[];
  nextPageToken?: string;
}

interface GoogleBusinessLocation {
  name: string;
  title?: string;
  websiteUri?: string;
  profile?: {
    description?: string;
  };
  phoneNumbers?: {
    primaryPhone?: string;
  };
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  regularHours?: {
    periods?: Array<unknown>;
  };
  categories?: {
    primaryCategory?: {
      displayName?: string;
    };
  };
}

interface GoogleBusinessLocationListResponse {
  locations?: GoogleBusinessLocation[];
  nextPageToken?: string;
}

interface GoogleBusinessReview {
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: {
    comment?: string;
    updateTime?: string;
  };
}

interface GoogleBusinessReviewsListResponse {
  reviews?: GoogleBusinessReview[];
  nextPageToken?: string;
}

interface GoogleBusinessProfileReviewStats {
  averageRating: number | null;
  totalReviews: number;
  responseRate: number | null;
  unansweredReviews: number;
}

interface GoogleBusinessProfileSnapshotOptions {
  businessAccountId: string;
  businessProfileId?: string | null;
  fallbackAccountName?: string | null;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

export interface GoogleBusinessProfileSnapshot {
  localPresence: LocalPresenceSection;
  reputation: ReputationSection;
  locations: LocationSnapshot[];
}

function buildHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

function extractErrorMessage(payload: GoogleBusinessProfileErrorPayload | null, fallback: string) {
  return payload?.error?.message?.trim() || fallback;
}

async function fetchGoogleBusinessProfileJson<T>(
  input: string,
  accessToken: string,
  init?: Omit<RequestInit, "headers">,
) {
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
    let payload: GoogleBusinessProfileErrorPayload | null = null;
    if (text) {
      try {
        payload = JSON.parse(text) as GoogleBusinessProfileErrorPayload;
      } catch {
        payload = null;
      }
    }
    throw new GoogleApiError(
      extractErrorMessage(payload, text || "Google Business Profile request failed."),
      response.status,
    );
  }

  return (await response.json()) as T;
}

function locationResourceNameToId(resourceName: string) {
  return resourceName.startsWith("locations/") ? resourceName.slice("locations/".length) : resourceName;
}

export function normalizeBusinessAccountId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^accounts\/[^/]+$/i.test(raw)) return raw;
  if (/^[a-z0-9_-]+$/i.test(raw)) return `accounts/${raw}`;
  return null;
}

export function normalizeBusinessProfileId(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^locations\/[^/]+$/i.test(raw)) return raw;
  if (/^[a-z0-9_-]+$/i.test(raw)) return `locations/${raw}`;
  return null;
}

function readAddress(location: GoogleBusinessLocation) {
  const address = location.storefrontAddress;
  if (!address) return null;
  const parts = [
    ...(address.addressLines ?? []),
    address.locality,
    address.administrativeArea,
    address.postalCode,
    address.regionCode,
  ]
    .map((value) => value?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function computeCompletionRate(location: GoogleBusinessLocation) {
  const checks = [
    Boolean(location.title?.trim()),
    Boolean(location.websiteUri?.trim()),
    Boolean(location.phoneNumbers?.primaryPhone?.trim()),
    Boolean(readAddress(location)),
    Boolean(location.categories?.primaryCategory?.displayName?.trim()),
    Boolean(location.regularHours?.periods?.length),
    Boolean(location.profile?.description?.trim()),
  ];
  const completeCount = checks.filter(Boolean).length;
  return checks.length > 0 ? completeCount / checks.length : 0;
}

function buildLocationFindings(location: GoogleBusinessLocation) {
  const findings: string[] = [];
  if (!location.websiteUri?.trim()) {
    findings.push("Missing website URL");
  }
  if (!location.phoneNumbers?.primaryPhone?.trim()) {
    findings.push("Missing primary phone");
  }
  if (!readAddress(location)) {
    findings.push("Missing storefront address");
  }
  if (!location.categories?.primaryCategory?.displayName?.trim()) {
    findings.push("Missing primary category");
  }
  if (!location.regularHours?.periods?.length) {
    findings.push("Missing regular hours");
  }
  return findings;
}

function reviewRatingToNumber(starRating: string | null | undefined) {
  switch (starRating?.trim().toUpperCase()) {
    case "ONE":
      return 1;
    case "TWO":
      return 2;
    case "THREE":
      return 3;
    case "FOUR":
      return 4;
    case "FIVE":
      return 5;
    default:
      return 0;
  }
}

function isReviewWithinDateRange(
  review: GoogleBusinessReview,
  dateRange?: { startDate: string; endDate: string },
) {
  if (!dateRange) return true;
  const createdAt = review.createTime ?? review.updateTime;
  if (!createdAt) return true;
  const dateOnly = createdAt.slice(0, 10);
  return dateOnly >= dateRange.startDate && dateOnly <= dateRange.endDate;
}

async function listBusinessProfileAccounts(accessToken: string) {
  const accounts: GoogleBusinessAccount[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GBP_ACCOUNT_API_BASE}/accounts`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await fetchGoogleBusinessProfileJson<GoogleBusinessAccountListResponse>(
      url.toString(),
      accessToken,
    );

    accounts.push(...(payload.accounts ?? []).filter((account) => Boolean(account.name)));
    pageToken = payload.nextPageToken || undefined;
  } while (pageToken);

  return accounts;
}

export async function fetchBusinessProfileAccounts(accessToken: string) {
  const accounts = await listBusinessProfileAccounts(accessToken);

  return accounts
    .map((account) => ({
      resourceName: account.name,
      propertyId: account.name,
      displayName: account.accountName?.trim() || account.name,
      parentAccountName: account.type?.trim() || null,
    }) satisfies IntegrationPropertySummary)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

async function listBusinessProfileLocations(accessToken: string, businessAccountId: string) {
  const normalizedAccountId = normalizeBusinessAccountId(businessAccountId);
  if (!normalizedAccountId) {
    throw new GoogleApiError(
      "Enter a valid Business Profile account ID before requesting live data.",
      400,
    );
  }

  const locations: GoogleBusinessLocation[] = [];
  let pageToken: string | undefined;
  const readMask = [
    "name",
    "title",
    "websiteUri",
    "profile",
    "phoneNumbers",
    "storefrontAddress",
    "regularHours",
    "categories",
  ].join(",");

  do {
    const url = new URL(`${GBP_BUSINESS_INFO_API_BASE}/${normalizedAccountId}/locations`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("readMask", readMask);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const payload = await fetchGoogleBusinessProfileJson<GoogleBusinessLocationListResponse>(
      url.toString(),
      accessToken,
    );

    locations.push(...(payload.locations ?? []).filter((location) => Boolean(location.name)));
    pageToken = payload.nextPageToken || undefined;
  } while (pageToken);

  return locations;
}

export async function fetchBusinessProfileLocations(
  accessToken: string,
  businessAccountId: string,
  accountLabel?: string | null,
) {
  const locations = await listBusinessProfileLocations(accessToken, businessAccountId);

  return locations
    .map((location) => ({
      resourceName: location.name,
      propertyId: location.name,
      displayName: location.title?.trim() || locationResourceNameToId(location.name),
      parentAccountName: accountLabel ?? null,
    }) satisfies IntegrationPropertySummary)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

async function readBusinessProfileReviewStats(
  accessToken: string,
  businessAccountId: string,
  locationName: string,
  dateRange?: { startDate: string; endDate: string },
): Promise<GoogleBusinessProfileReviewStats> {
  const normalizedAccountId = normalizeBusinessAccountId(businessAccountId);
  const normalizedLocationId = normalizeBusinessProfileId(locationName);
  if (!normalizedAccountId || !normalizedLocationId) {
    throw new GoogleApiError(
      "Enter a valid Business Profile account and location ID before requesting review data.",
      400,
    );
  }

  const reviews: GoogleBusinessReview[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const url = new URL(`${GBP_REVIEWS_API_BASE}/${normalizedAccountId}/${normalizedLocationId}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    try {
      const payload = await fetchGoogleBusinessProfileJson<GoogleBusinessReviewsListResponse>(
        url.toString(),
        accessToken,
      );
      reviews.push(...(payload.reviews ?? []));
      pageToken = payload.nextPageToken || undefined;
      pageCount += 1;
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        (error.status === 403 || error.status === 404)
      ) {
        return {
          averageRating: null,
          totalReviews: 0,
          responseRate: null,
          unansweredReviews: 0,
        };
      }
      throw error;
    }
  } while (pageToken && pageCount < 5);

  const filteredReviews = reviews.filter((review) => isReviewWithinDateRange(review, dateRange));
  const ratings: number[] = filteredReviews
    .map((review) => reviewRatingToNumber(review.starRating))
    .filter((rating) => rating > 0);
  const respondedReviewCount = filteredReviews.filter((review) => review.reviewReply?.comment?.trim()).length;
  const totalReviews = filteredReviews.length;

  return {
    averageRating:
      ratings.length > 0
        ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2))
        : null,
    totalReviews,
    responseRate: totalReviews > 0 ? Number((respondedReviewCount / totalReviews).toFixed(4)) : null,
    unansweredReviews: Math.max(0, totalReviews - respondedReviewCount),
  };
}

export async function verifyBusinessProfileAccess(
  accessToken: string,
  businessAccountId: string,
  businessProfileId?: string | null,
) {
  const normalizedAccountId = normalizeBusinessAccountId(businessAccountId);
  const normalizedLocationId = normalizeBusinessProfileId(businessProfileId);

  if (!normalizedAccountId) {
    throw new GoogleApiError(
      "Enter a valid Business Profile account ID before requesting live data.",
      400,
    );
  }

  const accounts = await listBusinessProfileAccounts(accessToken);
  const account = accounts.find((item) => item.name === normalizedAccountId);
  if (!account) {
    throw new GoogleApiError(
      "The connected Google account does not have access to the selected Business Profile account.",
      404,
    );
  }

  const locations = await listBusinessProfileLocations(accessToken, normalizedAccountId);
  if (normalizedLocationId && !locations.some((location) => location.name === normalizedLocationId)) {
    throw new GoogleApiError(
      "The selected Business Profile location could not be found under the selected account.",
      404,
    );
  }

  return {
    accountName: account.accountName?.trim() || normalizedAccountId,
    locationCount: locations.length,
    selectedLocationId: normalizedLocationId,
  };
}

export async function fetchBusinessProfileSnapshot(
  accessToken: string,
  options: GoogleBusinessProfileSnapshotOptions,
): Promise<GoogleBusinessProfileSnapshot> {
  const normalizedAccountId = normalizeBusinessAccountId(options.businessAccountId);
  const normalizedLocationId = normalizeBusinessProfileId(options.businessProfileId);

  if (!normalizedAccountId) {
    throw new GoogleApiError(
      "Enter a valid Business Profile account ID before requesting live data.",
      400,
    );
  }

  const [accounts, locations] = await Promise.all([
    listBusinessProfileAccounts(accessToken).catch(() => []),
    listBusinessProfileLocations(accessToken, normalizedAccountId),
  ]);
  const account = accounts.find((item) => item.name === normalizedAccountId);
  const scopedLocations = normalizedLocationId
    ? locations.filter((location) => location.name === normalizedLocationId)
    : locations;

  if (normalizedLocationId && scopedLocations.length === 0) {
    throw new GoogleApiError(
      "The selected Business Profile location could not be found under the selected account.",
      404,
    );
  }

  const reviewStatsByLocation = await Promise.all(
    scopedLocations.map(async (location) => ({
      locationName: location.name,
      stats: await readBusinessProfileReviewStats(
        accessToken,
        normalizedAccountId,
        location.name,
        options.dateRange,
      ),
    })),
  );

  const reviewMap = new Map(
    reviewStatsByLocation.map((item) => [item.locationName, item.stats] as const),
  );
  const completionRates = scopedLocations.map((location) => computeCompletionRate(location));
  const completedProfiles = completionRates.filter((rate) => rate >= 0.85).length;
  const locationSnapshots: LocationSnapshot[] = scopedLocations.map((location) => {
    const reviewStats = reviewMap.get(location.name);
    return {
      locationId: location.name,
      label: location.title?.trim() || locationResourceNameToId(location.name),
      businessProfileId: location.name,
      landingPageUrl: location.websiteUri?.trim() || null,
      metrics: {
        averageRating: reviewStats?.averageRating ?? null,
        reviewCount: reviewStats?.totalReviews ?? 0,
        responseRate: reviewStats?.responseRate ?? null,
      },
      findings: buildLocationFindings(location),
    };
  });

  const reputationTotals = reviewStatsByLocation.reduce(
    (accumulator, item) => {
      const stats = item.stats;
      if (stats.averageRating != null && stats.totalReviews > 0) {
        accumulator.weightedRating += stats.averageRating * stats.totalReviews;
        accumulator.ratedReviewCount += stats.totalReviews;
      }
      if (stats.responseRate != null && stats.totalReviews > 0) {
        accumulator.respondedReviewCount += Math.round(stats.responseRate * stats.totalReviews);
      }
      accumulator.totalReviews += stats.totalReviews;
      accumulator.unansweredReviews += stats.unansweredReviews;
      return accumulator;
    },
    {
      weightedRating: 0,
      ratedReviewCount: 0,
      respondedReviewCount: 0,
      totalReviews: 0,
      unansweredReviews: 0,
    },
  );

  return {
    localPresence: {
      supportState: "supported",
      accountName:
        account?.accountName?.trim() ||
        options.fallbackAccountName ||
        normalizedAccountId,
      locationCount: scopedLocations.length,
      completedProfiles,
      averageCompletionRate:
        completionRates.length > 0
          ? Number(
              (
                completionRates.reduce((sum, rate) => sum + rate, 0) / completionRates.length
              ).toFixed(4),
            )
          : null,
      photoCoverageRate: null,
      postCoverageRate: null,
    },
    reputation: {
      supportState: "supported",
      averageRating:
        reputationTotals.ratedReviewCount > 0
          ? Number((reputationTotals.weightedRating / reputationTotals.ratedReviewCount).toFixed(2))
          : null,
      totalReviews: reputationTotals.totalReviews,
      responseRate:
        reputationTotals.totalReviews > 0
          ? Number((reputationTotals.respondedReviewCount / reputationTotals.totalReviews).toFixed(4))
          : null,
      unansweredReviews: reputationTotals.unansweredReviews,
    },
    locations: locationSnapshots,
  };
}
