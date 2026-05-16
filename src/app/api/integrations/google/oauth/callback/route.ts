import { NextResponse } from "next/server";
import { finishGoogleOAuth } from "@/lib/audit-engine";
import {
  AUTH_SESSION_COOKIE,
  GOOGLE_LOGIN_COOKIE,
  createAuthSessionValue,
  getLoginCookieOptions,
  getSessionCookieOptions,
} from "@/lib/auth-session";
import {
  consumeGoogleLoginCallback,
  readGoogleOAuthState,
} from "@/lib/google-auth";
import { createSessionFromGoogleLogin } from "@/lib/auth-access";

function renderCallbackPage(payload: Record<string, unknown>, returnUrl: string) {
  const serialized = JSON.stringify(payload).replaceAll("<", "\\u003c");
  const safeReturnUrl = JSON.stringify(returnUrl).replaceAll("<", "\\u003c");
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>OAuth Complete</title>
        <style>
          body { font-family: Segoe UI, sans-serif; background: #f8fafc; color: #14213d; display: grid; place-items: center; min-height: 100vh; margin: 0; }
          main { max-width: 520px; padding: 32px; background: white; border: 1px solid #d7d1c7; border-radius: 24px; box-shadow: 0 16px 40px rgba(20, 33, 61, 0.08); }
          h1 { margin-top: 0; }
          p { line-height: 1.6; }
        </style>
      </head>
      <body>
        <main>
          <h1>Connection updated</h1>
          <p>You can close this window and return to the dashboard.</p>
        </main>
        <script>
          const payload = ${serialized};
          const returnUrl = ${safeReturnUrl};
          if (window.opener) {
            window.opener.postMessage({ type: "audit-platform:oauth-complete", payload }, window.location.origin);
            window.setTimeout(() => window.close(), 500);
          } else {
            window.setTimeout(() => window.location.replace(returnUrl), 800);
          }
        </script>
      </body>
    </html>
  `;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnUrl = new URL("/", request.url).toString();

  try {
    const state = await readGoogleOAuthState(url);

    if (state.flow === "login") {
      const loginCookieValue = request.headers
        .get("cookie")
        ?.split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${GOOGLE_LOGIN_COOKIE}=`))
        ?.slice(`${GOOGLE_LOGIN_COOKIE}=`.length);

      const result = await consumeGoogleLoginCallback(url, loginCookieValue);
      const sessionValue = await createAuthSessionValue(
        await createSessionFromGoogleLogin(result.profile, result.locale),
      );

      const response = NextResponse.redirect(new URL("/", request.url), 303);
      response.cookies.set(AUTH_SESSION_COOKIE, sessionValue, getSessionCookieOptions());
      response.cookies.set(GOOGLE_LOGIN_COOKIE, "", getLoginCookieOptions(0));
      return response;
    }

    const result = await finishGoogleOAuth(url);
    return new Response(renderCallbackPage({ ok: true, ...result }, returnUrl), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    try {
      const state = await readGoogleOAuthState(url);
      if (state.flow === "login") {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set(
          "error",
          error instanceof Error ? error.message : "Google login failed.",
        );
        const response = NextResponse.redirect(loginUrl, 303);
        response.cookies.set(GOOGLE_LOGIN_COOKIE, "", getLoginCookieOptions(0));
        return response;
      }
    } catch {
      // Fall through to the generic popup response for malformed states.
    }

    return new Response(
      renderCallbackPage({
        ok: false,
        error: error instanceof Error ? error.message : "OAuth callback failed.",
      }, returnUrl),
      {
        status: 400,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
  }
}
