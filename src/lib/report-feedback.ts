import type { ReportFeedbackRecord } from "@/lib/audit/types";
import { getStore } from "@/lib/storage";

export async function listReportFeedbackForAudit(auditId: string) {
  const store = await getStore();
  return store.listReportFeedbackByAudit(auditId);
}

export async function createReportFeedbackRecord(
  auditId: string,
  input: Pick<ReportFeedbackRecord, "rating" | "notes">,
) {
  const store = await getStore();
  return store.createReportFeedback(auditId, input);
}
