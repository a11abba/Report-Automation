import { describe, expect, it } from "vitest";
import { resolveOAuthRedirectUri, resolveRequestOrigin } from "./oauth-redirect";

describe("resolveOAuthRedirectUri", () => {
  it("reuses the current loopback origin for localhost callbacks", () => {
    expect(
      resolveOAuthRedirectUri({
        configuredRedirectUri: "http://localhost:3000/api/integrations/google/oauth/callback",
        requestOrigin: "http://127.0.0.1:3000",
        fallbackPath: "/api/integrations/google/oauth/callback",
      }),
    ).toBe("http://127.0.0.1:3000/api/integrations/google/oauth/callback");
  });

  it("keeps the configured callback for non-loopback origins", () => {
    expect(
      resolveOAuthRedirectUri({
        configuredRedirectUri: "https://beta.example.com/api/integrations/google/oauth/callback",
        requestOrigin: "http://127.0.0.1:3000",
        fallbackPath: "/api/integrations/google/oauth/callback",
      }),
    ).toBe("https://beta.example.com/api/integrations/google/oauth/callback");
  });

  it("falls back to the default localhost callback when nothing is configured", () => {
    expect(
      resolveOAuthRedirectUri({
        requestOrigin: null,
        fallbackPath: "/api/integrations/microsoft/oauth/callback",
      }),
    ).toBe("http://localhost:3000/api/integrations/microsoft/oauth/callback");
  });
});

describe("resolveRequestOrigin", () => {
  it("prefers the incoming host header over a normalized request URL", () => {
    const request = new Request("http://localhost:3000/api/auth/google/start", {
      headers: {
        host: "127.0.0.1:3000",
      },
    });

    expect(resolveRequestOrigin(request)).toBe("http://127.0.0.1:3000");
  });

  it("uses the referer origin when the browser sends a navigation referer", () => {
    const request = new Request("http://localhost:3000/api/auth/google/start", {
      headers: {
        referer: "http://127.0.0.1:3000/login?lang=en",
      },
    });

    expect(resolveRequestOrigin(request)).toBe("http://127.0.0.1:3000");
  });
});
