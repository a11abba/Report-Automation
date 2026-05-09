import type { AuthSession } from "@/lib/auth-session";

const EMAILS_ENV_KEY = "AUDIT_OPERATOR_EMAILS";
const DOMAINS_ENV_KEY = "AUDIT_OPERATOR_DOMAINS";

function parseList(input?: string) {
  if (!input) {
    return [];
  }

  return input
    .split(/[\n,;]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getOperatorLists() {
  return {
    emails: new Set(parseList(process.env[EMAILS_ENV_KEY])),
    domains: new Set(parseList(process.env[DOMAINS_ENV_KEY])),
  };
}

export function isOperatorAccessConfigured() {
  const { emails, domains } = getOperatorLists();
  return emails.size > 0 || domains.size > 0;
}

export function hasOperatorAccess(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { emails, domains } = getOperatorLists();

  if (emails.has(normalizedEmail)) {
    return true;
  }

  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex === -1) {
    return false;
  }

  const domain = normalizedEmail.slice(atIndex + 1);
  return domains.has(domain);
}

export function assertOperatorAccess(email: string) {
  if (!isOperatorAccessConfigured()) {
    throw new Error(
      `${EMAILS_ENV_KEY} or ${DOMAINS_ENV_KEY} must be configured before Google login can be used.`,
    );
  }

  if (!hasOperatorAccess(email)) {
    throw new Error("This Google account is not authorized for operator access.");
  }
}

export function isAuthorizedSession(session?: Pick<AuthSession, "email"> | null) {
  return Boolean(session?.email && hasOperatorAccess(session.email));
}

export function getOperatorAccessSetupSummary() {
  const configured = isOperatorAccessConfigured();
  return {
    configured,
    message: configured
      ? "Operator allowlist configured."
      : `Configure ${EMAILS_ENV_KEY} or ${DOMAINS_ENV_KEY} to enable operator login.`,
  };
}
