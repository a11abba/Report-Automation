import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGoogleLoginUrl, consumeGoogleLoginCallback } from "./google-auth";

const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
};

afterEach(() => {
  vi.restoreAllMocks();
  process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_OAUTH_REDIRECT_URI = originalEnv.GOOGLE_OAUTH_REDIRECT_URI;
});

describe("Google login OAuth", () => {
  it("uses the authorization redirect URI again during the token exchange", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "reporting.ferro.me";

    const login = await buildGoogleLoginUrl("en", "https://reports.fergro.me");
    const authorizationUrl = new URL(login.authUrl);
    const redirectUri =
      "https://reports.fergro.me/api/integrations/google/oauth/callback";
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(redirectUri);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: "google-user-id",
          email: "user@example.com",
          name: "Example User",
        }),
      );

    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set("code", "authorization-code");
    callbackUrl.searchParams.set("state", state!);

    await consumeGoogleLoginCallback(callbackUrl, login.loginCookieValue);

    const tokenRequest = fetchMock.mock.calls[0]?.[1];
    const tokenBody = tokenRequest?.body as URLSearchParams;
    expect(tokenBody.get("redirect_uri")).toBe(redirectUri);
  });

  it("surfaces Google token errors as readable messages", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI =
      "https://reports.fergro.me/api/integrations/google/oauth/callback";

    const login = await buildGoogleLoginUrl("en", "https://reports.fergro.me");
    const authorizationUrl = new URL(login.authUrl);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        {
          error: "invalid_request",
          error_description: "Google rejected the token request.",
        },
        { status: 400 },
      ),
    );

    const callbackUrl = new URL(
      "https://reports.fergro.me/api/integrations/google/oauth/callback",
    );
    callbackUrl.searchParams.set("code", "authorization-code");
    callbackUrl.searchParams.set(
      "state",
      authorizationUrl.searchParams.get("state")!,
    );

    await expect(
      consumeGoogleLoginCallback(callbackUrl, login.loginCookieValue),
    ).rejects.toThrow("Google rejected the token request.");
  });
});
