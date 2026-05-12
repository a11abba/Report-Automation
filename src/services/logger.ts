import type { AuditEventLevel } from "@/lib/audit/types";
import { getStore } from "@/lib/storage";

export async function logEvent(input: {
  auditId?: string | null;
  level?: AuditEventLevel;
  code: string;
  message: string;
  detail?: Record<string, unknown> | null;
}) {
  const store = await getStore();
  const audit = input.auditId ? await store.getAudit(input.auditId) : null;
  const fallbackAccount = await store.ensurePlatformAccount();
  return store.appendAuditEvent({
    accountId: audit?.accountId ?? fallbackAccount.id,
    auditId: input.auditId ?? null,
    level: input.level ?? "info",
    code: input.code,
    message: input.message,
    detail: input.detail ?? null,
  });
}
