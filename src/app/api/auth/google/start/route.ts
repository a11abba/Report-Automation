import { NextResponse } from "next/server";
import { buildGoogleLoginUrl } from "@/lib/google-auth";
import { GOOGLE_LOGIN_COOKIE, getLoginCookieOptions } from "@/lib/auth-session";

function resolveLocale(value: string | null) {
  return value === "pt" ? "pt" : "en";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = resolveLocale(url.searchParams.get("lang"));

  try {
    const result = await buildGoogleLoginUrl(locale);
    const response = NextResponse.redirect(result.authUrl, 303);
    response.cookies.set(
      GOOGLE_LOGIN_COOKIE,
      result.loginCookieValue,
      getLoginCookieOptions(),
    );
    return response;
  } catch (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Unable to start Google login.",
    );
    loginUrl.searchParams.set("lang", locale);
    return NextResponse.redirect(loginUrl, 303);
  }
}
