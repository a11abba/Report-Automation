import crypto from "node:crypto";
import { createHmac } from "@/services/app-secret";
import type { AppRole } from "@/lib/audit/types";

export const AUTH_SESSION_COOKIE = "audit_platform_session";
export const GOOGLE_LOGIN_COOKIE = "audit_platform_google_login";

export type AppLocale = "en" | "pt";

export interface AuthSession {
  userId: string;
  accountId: string;
  membershipId: string | null;
  role: AppRole;
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  locale: AppLocale;
  issuedAt: string;
  expiresAt: string;
}

export interface GoogleLoginCookiePayload {
  flow: "login";
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  locale: AppLocale;
  expiresAt: string;
}

const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const LOGIN_COOKIE_DURATION_SECONDS = 60 * 10;

function toBase64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

async function signPayload(payload: string) {
  const signature = await createHmac(payload);
  return `${payload}.${signature}`;
}

async function readSignedPayload<T extends { expiresAt?: string }>(value?: string | null) {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = await createHmac(encodedPayload);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    received.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(received, expectedBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf-8"),
  ) as T;

  if (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return payload;
}

async function createSignedPayload<T extends { expiresAt?: string }>(payload: T) {
  return signPayload(toBase64Url(JSON.stringify(payload)));
}

export async function createAuthSessionValue(
  input: Omit<AuthSession, "issuedAt" | "expiresAt">,
) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000).toISOString();

  return createSignedPayload<AuthSession>({
    ...input,
    issuedAt,
    expiresAt,
  });
}

export async function readAuthSessionValue(value?: string | null) {
  return readSignedPayload<AuthSession>(value);
}

export async function createGoogleLoginCookieValue(input: {
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  locale: AppLocale;
}) {
  const expiresAt = new Date(Date.now() + LOGIN_COOKIE_DURATION_SECONDS * 1000).toISOString();

  return createSignedPayload<GoogleLoginCookiePayload>({
    flow: "login",
    nonce: input.nonce,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri,
    locale: input.locale,
    expiresAt,
  });
}

export async function readGoogleLoginCookieValue(value?: string | null) {
  return readSignedPayload<GoogleLoginCookiePayload>(value);
}

export function getSessionCookieOptions(maxAge = SESSION_DURATION_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function getLoginCookieOptions(maxAge = LOGIN_COOKIE_DURATION_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}
