import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditRecord, JobRecord, ReportPeriodRecord } from "@/lib/audit/types";

vi.mock("@/lib/storage", () => ({ getStore: vi.fn() }));
vi.mock("@/services/logger", () => ({ logEvent: vi.fn() }));

import {
  cancelAudit,
  deleteCanceledAudit,
  deleteCanceledAuditsForClient,
} from "@/lib/audit-engine";
import { getStore } from "@/lib/storage";
import { logEvent } from "@/services/logger";

const queuedAudit: AuditRecord = {
  id: "audit_queued",
  accountId: "account_test",
  clientId: "client_test",
  integrationIds: ["integration_test"],
  scope: { reportPeriodId: "period_test" },
  status: "queued",
  score: null,
  grade: null,
  createdAt: "2026-06-29T12:00:00.000Z",
  updatedAt: "2026-06-29T12:00:00.000Z",
  completedAt: null,
  errorMessage: null,
};

const canceledAudit: AuditRecord = {
  ...queuedAudit,
  status: "canceled",
  completedAt: "2026-06-29T12:01:00.000Z",
};

const queuedJob: JobRecord = {
  id: "job_test",
  accountId: "account_test",
  kind: "audit_run",
  status: "queued",
  payload: { auditId: queuedAudit.id },
  result: null,
  errorMessage: null,
  createdAt: "2026-06-29T12:00:00.000Z",
  updatedAt: "2026-06-29T12:00:00.000Z",
  startedAt: null,
  completedAt: null,
};

const queuedPeriod: ReportPeriodRecord = {
  id: "period_test",
  accountId: "account_test",
  clientId: "client_test",
  periodKey: "2026-06",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  baselinePeriodId: null,
  status: "queued",
  auditId: queuedAudit.id,
  manualInputs: {
    leads: null,
    qualifiedLeads: null,
    sales: null,
    revenue: null,
    notes: null,
  },
  generatedAt: null,
  createdAt: "2026-06-29T12:00:00.000Z",
  updatedAt: "2026-06-29T12:00:00.000Z",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("cancelAudit", () => {
  it("cancels the queued audit, job, and linked monthly report", async () => {
    const store = {
      getAudit: vi.fn().mockResolvedValue(queuedAudit),
      cancelQueuedAudit: vi.fn().mockResolvedValue(canceledAudit),
      listJobs: vi.fn().mockResolvedValue([queuedJob]),
      updateJob: vi.fn().mockResolvedValue({ ...queuedJob, status: "canceled" }),
      getReportPeriod: vi.fn().mockResolvedValue(queuedPeriod),
      updateReportPeriod: vi.fn().mockResolvedValue({ ...queuedPeriod, status: "canceled" }),
    };
    vi.mocked(getStore).mockResolvedValue(store as never);

    await expect(cancelAudit(queuedAudit.id)).resolves.toEqual(canceledAudit);

    expect(store.updateJob).toHaveBeenCalledWith(
      queuedJob.id,
      expect.objectContaining({ status: "canceled" }),
    );
    expect(store.updateReportPeriod).toHaveBeenCalledWith(
      queuedPeriod.id,
      expect.objectContaining({ status: "canceled", auditId: queuedAudit.id }),
    );
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ auditId: queuedAudit.id, code: "audit.canceled" }),
    );
  });

  it("rejects cancellation when the atomic queued transition loses the race", async () => {
    const store = {
      getAudit: vi.fn().mockResolvedValue(queuedAudit),
      cancelQueuedAudit: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(getStore).mockResolvedValue(store as never);

    await expect(cancelAudit(queuedAudit.id)).rejects.toThrow(
      "Only reports that are still queued can be canceled.",
    );
    expect(logEvent).not.toHaveBeenCalled();
  });
});

describe("canceled report cleanup", () => {
  it("permanently removes a canceled audit", async () => {
    const store = {
      getAudit: vi.fn().mockResolvedValue(canceledAudit),
      deleteAudit: vi.fn().mockResolvedValue(canceledAudit),
    };
    vi.mocked(getStore).mockResolvedValue(store as never);

    await expect(deleteCanceledAudit(canceledAudit.id)).resolves.toEqual(canceledAudit);
    expect(store.deleteAudit).toHaveBeenCalledWith(canceledAudit.id);
  });

  it("removes every canceled audit for a client and preserves other statuses", async () => {
    const completedAudit: AuditRecord = {
      ...queuedAudit,
      id: "audit_completed",
      status: "completed",
    };
    const secondCanceledAudit: AuditRecord = {
      ...canceledAudit,
      id: "audit_canceled_two",
    };
    const store = {
      listAuditsByClient: vi
        .fn()
        .mockResolvedValue([canceledAudit, completedAudit, secondCanceledAudit]),
      deleteAudit: vi.fn().mockResolvedValue(canceledAudit),
    };
    vi.mocked(getStore).mockResolvedValue(store as never);

    await expect(deleteCanceledAuditsForClient("client_test")).resolves.toEqual({
      deletedCount: 2,
    });
    expect(store.deleteAudit).toHaveBeenCalledTimes(2);
    expect(store.deleteAudit).not.toHaveBeenCalledWith(completedAudit.id);
  });
});
