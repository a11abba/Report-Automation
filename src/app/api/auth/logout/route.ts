import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  GOOGLE_LOGIN_COOKIE,
  getLoginCookieOptions,
  getSessionCookieOptions,
} from "@/lib/auth-session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(AUTH_SESSION_COOKIE, "", getSessionCookieOptions(0));
  response.cookies.set(GOOGLE_LOGIN_COOKIE, "", getLoginCookieOptions(0));
  return response;
}
