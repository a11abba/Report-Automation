import type { AuthSession, AppLocale } from "@/lib/auth-session";
import type { AccountMembershipRecord, AuditRecord, ClientRecord, IntegrationRecord, LocationRecord } from "@/lib/audit/types";
import { hasOperatorAccess } from "@/lib/operator-access";
import { getStore } from "@/lib/storage";

interface GoogleProfileInput {
  sub: string;
  email: string;
  name: string;
  picture?: string | null;
}

async function ensurePlatformAdminMembership(userId: string, email: string) {
  const store = await getStore();
  const account = await store.ensurePlatformAccount();
  const memberships = await store.getMembershipsForEmail(email);
  const existing = memberships.find(
    (membership) =>
      membership.accountId === account.id &&
      membership.role === "platform_admin" &&
      membership.status !== "revoked",
  );
  if (existing) {
    return (await store.activateMembership(existing.id, userId)) ?? existing;
  }
  const invited = await store.inviteAccountUser({
    accountId: account.id,
    invitedEmail: email,
    role: "platform_admin",
    invitedByUserId: userId,
  });
  return (await store.activateMembership(invited.id, userId)) ?? invited;
}

export async function createSessionFromGoogleLogin(
  profile: GoogleProfileInput,
  locale: AppLocale,
): Promise<Omit<AuthSession, "issuedAt" | "expiresAt">> {
  const store = await getStore();
  const user = await store.upsertUser({
    email: profile.email,
    name: profile.name,
    picture: profile.picture ?? null,
    locale,
  });

  if (hasOperatorAccess(profile.email)) {
    const membership = await ensurePlatformAdminMembership(user.id, user.email);
    return {
      userId: user.id,
      accountId: membership.accountId,
      membershipId: membership.id,
      role: "platform_admin",
      sub: profile.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      locale,
    };
  }

  const invitedMemberships = (await store.getMembershipsForEmail(profile.email)).filter(
    (membership) => membership.status !== "revoked",
  );
  const membership = invitedMemberships[0];
  if (!membership) {
    throw new Error("This Google account has not been invited to an account yet.");
  }

  const activated =
    membership.userId === user.id && membership.status === "active"
      ? membership
      : await store.activateMembership(membership.id, user.id);
  if (!activated) {
    throw new Error("Unable to activate the invited account membership.");
  }

  return {
    userId: user.id,
    accountId: activated.accountId,
    membershipId: activated.id,
    role: activated.role,
    sub: profile.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    locale,
  };
}

export async function validateAuthSession(session?: AuthSession | null) {
  if (!session?.userId || !session.email || !session.accountId || !session.role) {
    return null;
  }

  const store = await getStore();
  const user = await store.getUser(session.userId);
  if (!user || user.email.toLowerCase() !== session.email.toLowerCase()) {
    return null;
  }

  if (session.role === "platform_admin") {
    const membership = session.membershipId ? await store.getMembership(session.membershipId) : null;
    const bootstrapAllowed = hasOperatorAccess(session.email);
    if (
      !bootstrapAllowed &&
      (!membership ||
        membership.userId !== user.id ||
        membership.accountId !== session.accountId ||
        membership.role !== "platform_admin" ||
        membership.status !== "active")
    ) {
      return null;
    }
    return {
      ...session,
      email: user.email,
      name: user.name,
      picture: user.picture,
      locale: user.locale,
    };
  }

  if (!session.membershipId) {
    return null;
  }

  const membership = await store.getMembership(session.membershipId);
  if (
    !membership ||
    membership.userId !== user.id ||
    membership.accountId !== session.accountId ||
    membership.role !== session.role ||
    membership.status !== "active"
  ) {
    return null;
  }

  return {
    ...session,
    email: user.email,
    name: user.name,
    picture: user.picture,
    locale: user.locale,
  };
}

export function canAccessAccount(session: Pick<AuthSession, "role" | "accountId">, accountId: string) {
  return session.role === "platform_admin" || session.accountId === accountId;
}

export function canManagePlatform(session: Pick<AuthSession, "role">) {
  return session.role === "platform_admin";
}

export function canManageClientRecord(
  session: Pick<AuthSession, "role" | "accountId">,
  client: Pick<ClientRecord, "accountId">,
) {
  return canAccessAccount(session, client.accountId);
}

export function canAccessAuditRecord(
  session: Pick<AuthSession, "role" | "accountId">,
  audit: Pick<AuditRecord, "accountId">,
) {
  return canAccessAccount(session, audit.accountId);
}

export function canAccessIntegrationRecord(
  session: Pick<AuthSession, "role" | "accountId">,
  integration: Pick<IntegrationRecord, "accountId">,
) {
  return canAccessAccount(session, integration.accountId);
}

export function canAccessLocationRecord(
  session: Pick<AuthSession, "role" | "accountId">,
  location: Pick<LocationRecord, "accountId">,
) {
  return canAccessAccount(session, location.accountId);
}

export function pickMembershipForAccount(
  memberships: AccountMembershipRecord[],
  accountId: string,
) {
  return memberships.find((membership) => membership.accountId === accountId) ?? null;
}
