import { afterEach, describe, expect, it } from "vitest";
import { assertSafeAuditUrl, normalizeAuditUrl } from "./audit-url";
import {
  canViewAccountBilling,
  normalizeAppRole,
  pickCustomerLoginMembership,
} from "./role-access";
import {
  getOperatorAccessSetupSummary,
  hasOperatorAccess,
  isAuthorizedSession,
} from "./operator-access";

const originalEmails = process.env.AUDIT_OPERATOR_EMAILS;
const originalDomains = process.env.AUDIT_OPERATOR_DOMAINS;

afterEach(() => {
  process.env.AUDIT_OPERATOR_EMAILS = originalEmails;
  process.env.AUDIT_OPERATOR_DOMAINS = originalDomains;
});

describe("operator access", () => {
  it("authorizes configured emails and domains", () => {
    process.env.AUDIT_OPERATOR_EMAILS = "owner@example.com, second@example.com";
    process.env.AUDIT_OPERATOR_DOMAINS = "agency.test";

    expect(hasOperatorAccess("owner@example.com")).toBe(true);
    expect(hasOperatorAccess("teammate@agency.test")).toBe(true);
    expect(hasOperatorAccess("outsider@example.net")).toBe(false);
    expect(isAuthorizedSession({ email: "second@example.com" })).toBe(true);
  });

  it("reports setup status when allowlist is missing", () => {
    process.env.AUDIT_OPERATOR_EMAILS = "";
    process.env.AUDIT_OPERATOR_DOMAINS = "";

    expect(getOperatorAccessSetupSummary().configured).toBe(false);
  });
});

describe("audit URL validation", () => {
  it("normalizes safe public URLs", async () => {
    expect(normalizeAuditUrl("https://8.8.8.8/path#frag")).toBe("https://8.8.8.8/path");
    await expect(assertSafeAuditUrl("https://8.8.8.8/path")).resolves.toBe(
      "https://8.8.8.8/path",
    );
  });

  it("rejects local and non-http targets", async () => {
    await expect(assertSafeAuditUrl("http://127.0.0.1/admin")).rejects.toThrow(
      "public IP",
    );
    await expect(assertSafeAuditUrl("ftp://example.com/file")).rejects.toThrow(
      "http or https",
    );
    await expect(assertSafeAuditUrl("https://localhost:3000")).rejects.toThrow(
      "public hostname",
    );
  });
});

describe("role enforcement", () => {
  it("maps the legacy customer role to client admin access", () => {
    expect(normalizeAppRole("account_user")).toBe("account_admin");
    expect(
      canViewAccountBilling(
        {
          accountId: "acc_1",
          role: "account_user",
        },
        "acc_1",
      ),
    ).toBe(true);
  });

  it("prevents client operators from seeing billing-only account details", () => {
    expect(
      canViewAccountBilling(
        {
          accountId: "acc_1",
          role: "account_operator",
        },
        "acc_1",
      ),
    ).toBe(false);
  });

  it("rejects ambiguous customer logins across multiple accounts", () => {
    expect(() =>
      pickCustomerLoginMembership([
        {
          id: "mem_1",
          accountId: "acc_1",
          userId: null,
          invitedEmail: "user@example.com",
          role: "account_admin",
          status: "invited",
          invitedByUserId: null,
          activatedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "mem_2",
          accountId: "acc_2",
          userId: null,
          invitedEmail: "user@example.com",
          role: "account_operator",
          status: "invited",
          invitedByUserId: null,
          activatedAt: null,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ]),
    ).toThrow("multiple customer workspaces");
  });
});
