import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SESSION_COOKIE, readAuthSessionValue } from "@/lib/auth-session";
import { isAuthorizedSession } from "@/lib/operator-access";

export async function getAuthSession() {
  const cookieStore = await cookies();
  const session = await readAuthSessionValue(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
  return isAuthorizedSession(session) ? session : null;
}

export async function redirectIfUnauthenticated() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
