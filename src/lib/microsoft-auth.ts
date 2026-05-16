import crypto from "node:crypto";
import type {
  IntegrationCredentials,
  OAuthSessionRecord,
  PlatformKey,
} from "@/lib/audit/types";
import { resolveOAuthRedirectUri } from "@/lib/oauth-redirect";
import { getStore } from "@/lib/storage";
import { createHmac } from "@/services/app-secret";

const MICROSOFT_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

interface MicrosoftOAuthStatePayload {
  flow: "integration";
  sessionId: string;
  clientId: string;
  platformKey: PlatformKey;
  expiresAt: string;
}

function assertMicrosoftPlatform(platformKey: PlatformKey) {
  if (platformKey !== "microsoft_ads" && platformKey !== "microsoft_merchant_center") {
    throw new Error(`Platform "${platformKey}" does not use Microsoft OAuth.`);
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

async function encodeOAuthState(payload: MicrosoftOAuthStatePayload) {
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

  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")) as MicrosoftOAuthStatePayload;
}

function getRedirectUri(requestOrigin?: string | null) {
  return resolveOAuthRedirectUri({
    configuredRedirectUri: process.env.MICROSOFT_OAUTH_REDIRECT_URI,
    requestOrigin,
    fallbackPath: "/api/integrations/microsoft/oauth/callback",
  });
}

export function getMicrosoftScopes(platformKey: PlatformKey): string[] {
  assertMicrosoftPlatform(platformKey);
  return ["https://ads.microsoft.com/msads.manage", "offline_access"];
}

export async function readMicrosoftOAuthState(url: URL) {
  const state = url.searchParams.get("state");
  if (!state) {
    throw new Error("Missing OAuth state.");
  }

  return decodeOAuthState(state);
}

export async function buildMicrosoftOAuthUrl(
  clientId: string,
  platformKey: PlatformKey,
  requestOrigin?: string,
) {
  assertMicrosoftPlatform(platformKey);
  const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
  if (!microsoftClientId) {
    throw new Error("MICROSOFT_CLIENT_ID is not configured.");
  }

  const scopes = getMicrosoftScopes(platformKey);
  const redirectUri = getRedirectUri(requestOrigin);
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

  const authUrl = new URL(MICROSOFT_AUTH_BASE);
  authUrl.searchParams.set("client_id", microsoftClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  return {
    authUrl: authUrl.toString(),
    state,
    redirectUri,
    scopes,
  };
}

async function parseTokenPayload(response: Response): Promise<IntegrationCredentials> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to exchange Microsoft authorization code.");
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

export async function exchangeMicrosoftCode(
  code: string,
  codeVerifier: string,
  redirectUri = getRedirectUri(),
): Promise<IntegrationCredentials> {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth environment variables are incomplete.");
  }

  const response = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  return parseTokenPayload(response);
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string,
  scopes?: string[],
): Promise<IntegrationCredentials> {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth environment variables are incomplete.");
  }

  const response = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
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

export async function consumeMicrosoftOAuthCallback(url: URL): Promise<{
  clientId: string;
  platformKey: PlatformKey;
  scopes: string[];
  session: OAuthSessionRecord;
  credentials: IntegrationCredentials | null;
}> {
  const code = url.searchParams.get("code");
  const parsedState = await readMicrosoftOAuthState(url);
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

  const credentials = await exchangeMicrosoftCode(code, session.codeVerifier, session.redirectUri);
  await store.deleteOAuthSession(session.id);
  return {
    clientId: session.clientId,
    platformKey: session.platformKey,
    scopes: session.scopes,
    session,
    credentials,
  };
}
