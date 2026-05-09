import { afterEach, describe, expect, it } from "vitest";
import { assertSafeAuditUrl, normalizeAuditUrl } from "./audit-url";
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
