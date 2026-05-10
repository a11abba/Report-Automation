import type { AuditFinding, ReportFocus, ReportLanguage } from "@/lib/audit/types";

const focusLabels = {
  en: {
    full_funnel: "Full funnel",
    lifecycle_marketing: "Lifecycle / Email",
    seo_local: "SEO / Local",
    paid_media: "Paid media",
  },
  "pt-BR": {
    full_funnel: "Funil completo",
    lifecycle_marketing: "Lifecycle / Email",
    seo_local: "SEO / Local",
    paid_media: "Mídia paga",
  },
  "pt-PT": {
    full_funnel: "Funil completo",
    lifecycle_marketing: "Lifecycle / Email",
    seo_local: "SEO / Local",
    paid_media: "Mídia paga",
  },
} as const;

const focusCategories: Record<ReportFocus, AuditFinding["category"][]> = {
  full_funnel: [
    "channel_performance",
    "deliverability",
    "automation_coverage",
    "audience_capture",
    "data_quality",
    "integration_health",
    "commerce_revenue_attribution",
    "crm_lifecycle_health",
    "seo_visibility",
    "local_presence_health",
    "reviews_reputation",
    "website_performance",
    "technical_seo",
    "traffic_quality",
    "paid_media_performance",
  ],
  lifecycle_marketing: [
    "channel_performance",
    "deliverability",
    "automation_coverage",
    "audience_capture",
    "data_quality",
    "integration_health",
    "commerce_revenue_attribution",
    "crm_lifecycle_health",
  ],
  seo_local: [
    "integration_health",
    "seo_visibility",
    "local_presence_health",
    "reviews_reputation",
    "website_performance",
    "technical_seo",
    "traffic_quality",
  ],
  paid_media: [
    "integration_health",
    "paid_media_performance",
    "traffic_quality",
    "website_performance",
  ],
};

export function getReportFocusLabel(locale: ReportLanguage, focus: ReportFocus) {
  return focusLabels[locale][focus];
}

export function getCategoriesForReportFocus(focus: ReportFocus) {
  return new Set(focusCategories[focus]);
}
