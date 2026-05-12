import crypto from "node:crypto";
import {
  type GoogleOAuthStartResult,
  type IntegrationCredentials,
  type OAuthSessionRecord,
  type PlatformKey,
} from "@/lib/audit/types";
import {
  createGoogleLoginCookieValue,
  readGoogleLoginCookieValue,
  type AppLocale,
} from "@/lib/auth-session";
import { getStore } from "@/lib/storage";
import { createHmac } from "@/services/app-secret";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

interface IntegrationOAuthStatePayload {
  flow: "integration";
  sessionId: string;
  clientId: string;
  platformKey: PlatformKey;
  expiresAt: string;
}

interface LoginOAuthStatePayload {
  flow: "login";
  nonce: string;
  locale: AppLocale;
  expiresAt: string;
}

type OAuthStatePayload = IntegrationOAuthStatePayload | LoginOAuthStatePayload;

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

function assertGooglePlatform(platformKey: PlatformKey) {
  if (
    platformKey !== "google_search_console" &&
    platformKey !== "google_business_profile" &&
    platformKey !== "google_analytics"
  ) {
    throw new Error(`Platform "${platformKey}" does not use Google OAuth.`);
  }
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function createCodeVerifier() {
  return base64Url(crypto.randomBytes(48));
}

function createCodeChallenge(codeVerifier: string) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

async function encodeOAuthState(payload: OAuthStatePayload) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = await createHmac(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function decodeOAuthState(state: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Malformed OAuth state.");
  }
  const expectedSignature = await createHmac(encodedPayload);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new Error("OAuth state verification failed.");
  }
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")) as OAuthStatePayload;
}

export async function readGoogleOAuthState(url: URL) {
  const state = url.searchParams.get("state");
  if (!state) {
    throw new Error("Missing OAuth state.");
  }

  return decodeOAuthState(state);
}

function getRedirectUri() {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    "http://localhost:3000/api/integrations/google/oauth/callback"
  );
}

export function getGoogleScopes(platformKey: PlatformKey): string[] {
  assertGooglePlatform(platformKey);
  if (platformKey === "google_search_console") {
    return ["https://www.googleapis.com/auth/webmasters.readonly"];
  }
  if (platformKey === "google_business_profile") {
    return [
      "https://www.googleapis.com/auth/business.manage",
      "openid",
      "email",
      "profile",
    ];
  }
  return [
    "https://www.googleapis.com/auth/analytics.readonly",
    "openid",
    "email",
    "profile",
  ];
}

export async function buildGoogleOAuthUrl(
  clientId: string,
  platformKey: PlatformKey,
): Promise<GoogleOAuthStartResult> {
  assertGooglePlatform(platformKey);
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  const scopes = getGoogleScopes(platformKey);
  const redirectUri = getRedirectUri();
  const codeVerifier = createCodeVerifier();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const store = await getStore();
  const client = await store.getClient(clientId);
  if (!client) {
    throw new Error("Client not found.");
  }
  const session = await store.createOAuthSession({
    id: `oauth_${crypto.randomUUID().replaceAll("-", "")}`,
    accountId: client.accountId,
    clientId,
    platformKey,
    codeVerifier,
    redirectUri,
    scopes,
    expiresAt,
  });
  const state = await encodeOAuthState({
    flow: "integration",
    sessionId: session.id,
    clientId,
    platformKey,
    expiresAt: session.expiresAt,
  });

  const authUrl = new URL(GOOGLE_AUTH_BASE);
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");

  return {
    authUrl: authUrl.toString(),
    state,
    redirectUri,
    scopes,
  };
}

export async function buildGoogleLoginUrl(locale: AppLocale) {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  const redirectUri = getRedirectUri();
  const codeVerifier = createCodeVerifier();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const state = await encodeOAuthState({
    flow: "login",
    nonce,
    locale,
    expiresAt,
  });
  const loginCookieValue = await createGoogleLoginCookieValue({
    nonce,
    codeVerifier,
    locale,
  });

  const authUrl = new URL(GOOGLE_AUTH_BASE);
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", ["openid", "email", "profile"].join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");

  return {
    authUrl: authUrl.toString(),
    loginCookieValue,
    expiresAt,
  };
}

async function parseTokenPayload(response: Response): Promise<IntegrationCredentials> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to exchange Google authorization code.");
  }

  const payload = await response.json();
  const expiresAt =
    typeof payload.expires_in === "number"
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    authOrigin: "oauth",
  };
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri = getRedirectUri(),
): Promise<IntegrationCredentials> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth environment variables are incomplete.");
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  return parseTokenPayload(response);
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  scopes?: string[],
): Promise<IntegrationCredentials> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth environment variables are incomplete.");
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      ...(scopes?.length ? { scope: scopes.join(" ") } : {}),
    }),
  });

  const next = await parseTokenPayload(response);
  return {
    ...next,
    refreshToken,
  };
}

async function fetchGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to read Google account profile.");
  }

  const payload = (await response.json()) as Partial<GoogleIdentity>;
  if (!payload.sub || !payload.email || !payload.name) {
    throw new Error("Google account profile is incomplete.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

export async function consumeGoogleOAuthCallback(url: URL): Promise<{
  clientId: string;
  platformKey: PlatformKey;
  scopes: string[];
  session: OAuthSessionRecord;
  credentials: IntegrationCredentials | null;
}> {
  const code = url.searchParams.get("code");
  const parsedState = await readGoogleOAuthState(url);
  if (parsedState.flow !== "integration") {
    throw new Error("OAuth state does not belong to an integration flow.");
  }
  const store = await getStore();
  const session = await store.getOAuthSession(parsedState.sessionId);
  if (!session) {
    throw new Error("OAuth session not found or already consumed.");
  }
  if (session.clientId !== parsedState.clientId || session.platformKey !== parsedState.platformKey) {
    await store.deleteOAuthSession(session.id);
    throw new Error("OAuth session mismatch.");
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await store.deleteOAuthSession(session.id);
    throw new Error("OAuth session expired.");
  }

  if (!code) {
    return {
      clientId: session.clientId,
      platformKey: session.platformKey,
      scopes: session.scopes,
      session,
      credentials: null,
    };
  }

  const credentials = await exchangeGoogleCode(code, session.codeVerifier, session.redirectUri);
  await store.deleteOAuthSession(session.id);
  return {
    clientId: session.clientId,
    platformKey: session.platformKey,
    scopes: session.scopes,
    session,
    credentials,
  };
}

export async function consumeGoogleLoginCallback(url: URL, loginCookieValue?: string | null) {
  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("Missing Google authorization code.");
  }

  const parsedState = await readGoogleOAuthState(url);
  if (parsedState.flow !== "login") {
    throw new Error("OAuth state does not belong to a login flow.");
  }

  if (new Date(parsedState.expiresAt).getTime() <= Date.now()) {
    throw new Error("Google login session expired.");
  }

  const loginCookie = await readGoogleLoginCookieValue(loginCookieValue);
  if (!loginCookie || loginCookie.flow !== "login") {
    throw new Error("Google login session was not found.");
  }

  if (loginCookie.nonce !== parsedState.nonce) {
    throw new Error("Google login session did not match the callback.");
  }

  const credentials = await exchangeGoogleCode(code, loginCookie.codeVerifier);
  if (!credentials.accessToken) {
    throw new Error("Google did not return an access token.");
  }

  const profile = await fetchGoogleIdentity(credentials.accessToken);

  return {
    locale: parsedState.locale,
    profile,
  };
}
