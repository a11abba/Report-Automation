import { finishMicrosoftOAuth } from "@/lib/audit-engine";

function renderCallbackPage(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload).replaceAll("<", "\\u003c");
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
          if (window.opener) {
            window.opener.postMessage({ type: "audit-platform:oauth-complete", payload }, window.location.origin);
          }
          window.setTimeout(() => window.close(), 500);
        </script>
      </body>
    </html>
  `;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await finishMicrosoftOAuth(url);
    return new Response(renderCallbackPage({ ok: true, ...result }), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return new Response(
      renderCallbackPage({
        ok: false,
        error: error instanceof Error ? error.message : "OAuth callback failed.",
      }),
      {
        status: 400,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
  }
}
