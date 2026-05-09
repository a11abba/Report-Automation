import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  getSessionCookieOptions,
  readAuthSessionValue,
} from "@/lib/auth-session";
import { isAuthorizedSession } from "@/lib/operator-access";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/google/start") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/integrations/google/oauth/callback")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await readAuthSessionValue(
    request.cookies.get(AUTH_SESSION_COOKIE)?.value,
  );
  const hasAuthorizedSession = isAuthorizedSession(session);

  if (hasAuthorizedSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!hasAuthorizedSession && session) {
    const response = isPublicPath(pathname)
      ? NextResponse.next()
      : pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Authentication required." }, { status: 401 })
        : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set(AUTH_SESSION_COOKIE, "", getSessionCookieOptions(0));
    return response;
  }

  if (hasAuthorizedSession || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (search) {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
