import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  getSessionCookieOptions,
  readAuthSessionValue,
} from "@/lib/auth-session";

const DEV_LOOPBACK_ALIASES = new Set(["127.0.0.1", "::1", "[::1]"]);

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/google/start") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/integrations/google/oauth/callback") ||
    pathname.startsWith("/api/integrations/microsoft/oauth/callback")
  );
}

export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "development" &&
    DEV_LOOPBACK_ALIASES.has(request.nextUrl.hostname)
  ) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = "localhost";
    return NextResponse.redirect(canonicalUrl);
  }

  const { pathname, search } = request.nextUrl;
  const rawSession = await readAuthSessionValue(
    request.cookies.get(AUTH_SESSION_COOKIE)?.value,
  );
  const hasSessionCandidate = Boolean(
    rawSession?.userId &&
      rawSession.email &&
      rawSession.accountId &&
      rawSession.role,
  );

  if (!hasSessionCandidate && rawSession) {
    const response = isPublicPath(pathname)
      ? NextResponse.next()
      : pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Authentication required." }, { status: 401 })
        : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set(AUTH_SESSION_COOKIE, "", getSessionCookieOptions(0));
    return response;
  }

  if (isPublicPath(pathname) || hasSessionCandidate) {
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
    "/((?!_next/static|_next/image|_next/webpack-hmr|__nextjs_font|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
