import type { AuthSession } from "./auth-session";
import type { AccountMembershipRecord } from "./audit/types";

export type EffectiveAppRole = "platform_admin" | "account_admin" | "account_operator";

type RoleLike = AccountMembershipRecord["role"] | AuthSession["role"];
type AccountScopedSession = Pick<AuthSession, "role" | "accountId">;

export function normalizeAppRole(role: RoleLike): EffectiveAppRole {
  if (role === "account_user") {
    return "account_admin";
  }
  return role;
}

export function isPlatformRole(role: RoleLike) {
  return normalizeAppRole(role) === "platform_admin";
}

export function isAccountAdminRole(role: RoleLike) {
  return normalizeAppRole(role) === "account_admin";
}

export function getRoleLabel(role: RoleLike): string {
  switch (normalizeAppRole(role)) {
    case "platform_admin":
      return "Platform admin";
    case "account_admin":
      return "Client admin";
    case "account_operator":
      return "Client operator";
  }
}

export function pickCustomerLoginMembership(
  memberships: AccountMembershipRecord[],
): AccountMembershipRecord {
  const invitedMemberships = memberships.filter((membership) => membership.status !== "revoked");
  if (invitedMemberships.length === 0) {
    throw new Error("This Google account has not been invited to an account yet.");
  }

  const distinctAccounts = new Set(invitedMemberships.map((membership) => membership.accountId));
  if (distinctAccounts.size > 1) {
    throw new Error(
      "This Google account is linked to multiple customer workspaces. Ask a platform admin to keep one workspace per Google login.",
    );
  }

  return invitedMemberships.find((membership) => membership.status === "active") ?? invitedMemberships[0];
}

export function canAccessAccount(session: AccountScopedSession, accountId: string) {
  return isPlatformRole(session.role) || session.accountId === accountId;
}

export function canManagePlatform(session: Pick<AuthSession, "role">) {
  return isPlatformRole(session.role);
}

export function canManageCustomerAccount(
  session: AccountScopedSession,
  accountId: string,
) {
  return canAccessAccount(session, accountId) && (isPlatformRole(session.role) || isAccountAdminRole(session.role));
}

export function canViewAccountBilling(
  session: AccountScopedSession,
  accountId: string,
) {
  return canManageCustomerAccount(session, accountId);
}
