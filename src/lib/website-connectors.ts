import {
  type AuditCapability,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformType,
} from "@/lib/audit/types";
import { fetchWithSafeRedirects } from "./audit-url";
import { baseSnapshot, getTargetUrl, type ConnectorContext, type PlatformConnector } from "./connectors";

async function fetchText(url: string) {
  try {
    const response = await fetchWithSafeRedirects(url, {
      headers: { "User-Agent": "Open API Audit Studio/0.1" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function pickFirstMatch(input: string, pattern: RegExp) {
  const match = input.match(pattern);
  return match?.[1]?.trim() ?? null;
}

async function runBasicWebsiteCrawl(targetUrl: string | null) {
  if (!targetUrl) {
    return {
      supportState: "manual_review" as const,
      targetUrl: null,
      pageSpeedScore: null,
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: null,
      interactionToNextPaintMs: null,
      pagesScanned: 0,
      indexablePages: 0,
      brokenLinkCount: 0,
      titleCoverageRate: null,
      metaDescriptionCoverageRate: null,
      missingCanonicalCount: 0,
      hasRobotsTxt: null,
      hasSitemapXml: null,
      notes: ["No target URL configured for website crawl."],
    };
  }

  const html = await fetchText(targetUrl);
  const robots = await fetchText(new URL("/robots.txt", targetUrl).toString());
  const sitemap = await fetchText(new URL("/sitemap.xml", targetUrl).toString());

  if (!html) {
    return {
      supportState: "manual_review" as const,
      targetUrl,
      pageSpeedScore: null,
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: null,
      interactionToNextPaintMs: null,
      pagesScanned: 0,
      indexablePages: 0,
      brokenLinkCount: 0,
      titleCoverageRate: null,
      metaDescriptionCoverageRate: null,
      missingCanonicalCount: 0,
      hasRobotsTxt: robots !== null,
      hasSitemapXml: sitemap !== null,
      notes: ["Homepage could not be crawled from the configured target URL."],
    };
  }

  const title = pickFirstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
  const description = pickFirstMatch(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const canonical = pickFirstMatch(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  const links = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  const brokenLinkCount = links.filter((href) => href.startsWith("#") || href.startsWith("javascript:")).length;

  return {
    supportState: "supported" as const,
    targetUrl,
    pageSpeedScore: null,
    largestContentfulPaintMs: null,
    cumulativeLayoutShift: null,
    interactionToNextPaintMs: null,
    pagesScanned: 1,
    indexablePages: title ? 1 : 0,
    brokenLinkCount,
    titleCoverageRate: title ? 1 : 0,
    metaDescriptionCoverageRate: description ? 1 : 0,
    missingCanonicalCount: canonical ? 0 : 1,
    hasRobotsTxt: robots !== null,
    hasSitemapXml: sitemap !== null,
    notes: title ? [`Homepage title: ${title}`] : ["Homepage title missing."],
  };
}

async function fetchPageSpeedMetrics(targetUrl: string | null) {
  if (!targetUrl) {
    return {
      supportState: "manual_review" as const,
      targetUrl: null,
      pageSpeedScore: null,
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: null,
      interactionToNextPaintMs: null,
      pagesScanned: 0,
      indexablePages: 0,
      brokenLinkCount: 0,
      titleCoverageRate: null,
      metaDescriptionCoverageRate: null,
      missingCanonicalCount: 0,
      hasRobotsTxt: null,
      hasSitemapXml: null,
      notes: ["No target URL configured for PageSpeed."],
    };
  }

  if (!process.env.PAGESPEED_API_KEY) {
    return {
      supportState: "supported" as const,
      targetUrl,
      pageSpeedScore: 74,
      largestContentfulPaintMs: 2350,
      cumulativeLayoutShift: 0.13,
      interactionToNextPaintMs: 190,
      pagesScanned: 1,
      indexablePages: 1,
      brokenLinkCount: 0,
      titleCoverageRate: 1,
      metaDescriptionCoverageRate: 1,
      missingCanonicalCount: 0,
      hasRobotsTxt: true,
      hasSitemapXml: true,
      notes: ["PageSpeed running in demo mode because PAGESPEED_API_KEY is not configured."],
    };
  }

  try {
    const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    apiUrl.searchParams.set("url", targetUrl);
    apiUrl.searchParams.set("key", process.env.PAGESPEED_API_KEY);
    apiUrl.searchParams.set("category", "performance");
    const response = await fetch(apiUrl.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error("PageSpeed request failed.");
    const payload = await response.json();
    const lighthouse = payload.lighthouseResult?.audits ?? {};
    const score = payload.lighthouseResult?.categories?.performance?.score;
    return {
      supportState: "supported" as const,
      targetUrl,
      pageSpeedScore: typeof score === "number" ? Math.round(score * 100) : null,
      largestContentfulPaintMs: lighthouse["largest-contentful-paint"]?.numericValue ?? null,
      cumulativeLayoutShift: lighthouse["cumulative-layout-shift"]?.numericValue ?? null,
      interactionToNextPaintMs: lighthouse["interaction-to-next-paint"]?.numericValue ?? null,
      pagesScanned: 1,
      indexablePages: 1,
      brokenLinkCount: 0,
      titleCoverageRate: 1,
      metaDescriptionCoverageRate: 1,
      missingCanonicalCount: 0,
      hasRobotsTxt: true,
      hasSitemapXml: true,
      notes: ["PageSpeed Insights API data loaded live."],
    };
  } catch {
    return {
      supportState: "manual_review" as const,
      targetUrl,
      pageSpeedScore: null,
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: null,
      interactionToNextPaintMs: null,
      pagesScanned: 1,
      indexablePages: 1,
      brokenLinkCount: 0,
      titleCoverageRate: 1,
      metaDescriptionCoverageRate: 1,
      missingCanonicalCount: 0,
      hasRobotsTxt: true,
      hasSitemapXml: true,
      notes: ["PageSpeed API could not be reached; review manually."],
    };
  }
}

export class PageSpeedConnector implements PlatformConnector {
  key = "pagespeed_insights" as const;

  platformType(): PlatformType {
    return "website_intelligence";
  }

  capabilities(): AuditCapability[] {
    return ["site_performance"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    void integration;
    const hasApiKey = Boolean(process.env.PAGESPEED_API_KEY);
    return {
      valid: true,
      mode: hasApiKey ? ("api" as const) : ("demo" as const),
      code: hasApiKey ? "api_key_present" : "demo_mode",
      message: hasApiKey ? "PageSpeed API key configured." : "PageSpeed is running in demo mode.",
      environmentConfigured: hasApiKey,
      authenticated: hasApiKey,
      resourceSelected: true,
      liveReady: hasApiKey,
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.website = await fetchPageSpeedMetrics(getTargetUrl(client, integration));
    if (!process.env.PAGESPEED_API_KEY) {
      snapshot.operationalFlags.push("pagespeed_demo_mode");
    }
    return snapshot;
  }
}

export class WebsiteCrawlerConnector implements PlatformConnector {
  key = "website_crawler" as const;

  platformType(): PlatformType {
    return "website_intelligence";
  }

  capabilities(): AuditCapability[] {
    return ["technical_seo", "site_performance"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    void integration;
    return {
      valid: true,
      mode: "api" as const,
      code: "public_access",
      message: "Crawler uses public website access and does not require platform auth.",
      environmentConfigured: true,
      authenticated: true,
      resourceSelected: true,
      liveReady: true,
    };
  }

  async fetchSnapshot({ client, integration }: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const snapshot = baseSnapshot(client, this.key, this.platformType(), this.capabilities());
    snapshot.website = await runBasicWebsiteCrawl(getTargetUrl(client, integration));
    return snapshot;
  }
}
