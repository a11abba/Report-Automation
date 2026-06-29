import type { AuditRecord } from "@/lib/audit/types";

interface AuditDisplayIntegration {
  id: string;
  displayName: string;
}

function formatPeriodLabel(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return periodKey;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatDetectedPlatform(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getScopeHostname(audit: Pick<AuditRecord, "scope">) {
  const candidate =
    audit.scope?.detectedContext?.suggestedDomain ??
    audit.scope?.detectedContext?.currentUrl;
  if (!candidate) return null;
  try {
    return new URL(candidate).hostname.replace(/^www\./i, "");
  } catch {
    return candidate;
  }
}

export function getAuditDisplayMetadata(
  audit: Pick<AuditRecord, "integrationIds" | "scope">,
  integrations: AuditDisplayIntegration[],
) {
  const isMonthly = Boolean(audit.scope?.reportPeriodId || audit.scope?.periodKey);
  const platform = audit.scope?.detectedContext?.platformDetected?.trim();
  const sources = integrations
    .filter((integration) => audit.integrationIds.includes(integration.id))
    .map((integration) => integration.displayName);
  const visibleSources = sources.slice(0, 3);
  const sourceSummary =
    sources.length > 0
      ? `Sources: ${visibleSources.join(" · ")}${sources.length > 3 ? ` · +${sources.length - 3}` : ""}`
      : getScopeHostname(audit)
        ? `Scope: ${getScopeHostname(audit)}`
        : "Client-wide scope";

  return {
    typeLabel: isMonthly ? "Monthly report" : "Diagnostic audit",
    title: isMonthly
      ? `${audit.scope?.periodKey ? formatPeriodLabel(audit.scope.periodKey) : "Monthly"} performance report`
      : platform
        ? `${formatDetectedPlatform(platform)} diagnostic`
        : "Live diagnostic report",
    sourceSummary,
  };
}
