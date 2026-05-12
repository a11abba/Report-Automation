import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SESSION_COOKIE, readAuthSessionValue } from "@/lib/auth-session";
import { canManagePlatform, validateAuthSession } from "@/lib/auth-access";

export async function getAuthSession() {
  const cookieStore = await cookies();
  const session = await readAuthSessionValue(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
  return validateAuthSession(session);
}

export async function redirectIfUnauthenticated() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function redirectIfNotPlatformAdmin() {
  const session = await redirectIfUnauthenticated();
  if (!canManagePlatform(session)) {
    redirect("/");
  }
  return session;
}
