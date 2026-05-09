import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session-server";
import { getOperatorAccessSetupSummary } from "@/lib/operator-access";

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    lang?: string;
  }>;
}

function resolveLocale(lang?: string) {
  return lang === "pt" ? "pt" : "en";
}

const copy = {
  en: {
    tag: "Operator access",
    panelTag: "Login",
    panelTitle: "Presentation access",
    title: "Google login is back for the live dashboard.",
    body:
      "Use your Google account to enter the local presentation environment and keep the client audit workspace behind a simple operator gate.",
    ctaTop: "Continue with Google",
    ctaBottom: "Sign in with Google",
    note: "The same callback also powers the Google platform connections inside each client workspace.",
    switchLabel: "Português",
    helper: "Need the Portuguese view?",
    statusLabel: "Google OAuth",
    statusReady: "Ready",
    statusNeedsSetup: "Needs setup",
    configured: "Google OAuth and the operator allowlist are configured for the presentation flow.",
    missing:
      "Login is disabled until the required Google OAuth and operator access settings are added to .env.local.",
    oauthSetup: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    allowlistSetup: "Add AUDIT_OPERATOR_EMAILS or AUDIT_OPERATOR_DOMAINS.",
  },
  pt: {
    tag: "Acesso do operador",
    panelTag: "Acesso",
    panelTitle: "Acesso da apresentação",
    title: "O login com Google voltou para o dashboard ao vivo.",
    body:
      "Use a sua conta Google para entrar no ambiente local da apresentação e manter o workspace de auditoria atrás de uma porta simples para operador.",
    ctaTop: "Entrar com Google",
    ctaBottom: "Fazer login com Google",
    note: "O mesmo callback também alimenta as conexões das plataformas Google dentro de cada workspace de cliente.",
    switchLabel: "English",
    helper: "Prefere ver em inglês?",
    statusLabel: "Google OAuth",
    statusReady: "Pronto",
    statusNeedsSetup: "Falta configurar",
    configured: "O Google OAuth e a allowlist de operadores estão configurados para o fluxo da apresentação.",
    missing:
      "O login fica desativado até que as configurações obrigatórias de Google OAuth e acesso do operador sejam adicionadas ao .env.local.",
    oauthSetup: "Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
    allowlistSetup: "Adicione AUDIT_OPERATOR_EMAILS ou AUDIT_OPERATOR_DOMAINS.",
  },
} as const;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAuthSession();
  if (session) {
    redirect("/");
  }

  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const content = copy[locale];
  const alternateLocale = locale === "en" ? "pt" : "en";
  const operatorAccess = getOperatorAccessSetupSummary();
  const googleOAuthConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const googleConfigured = googleOAuthConfigured && operatorAccess.configured;
  const setupSteps = [
    !googleOAuthConfigured ? content.oauthSetup : null,
    !operatorAccess.configured ? content.allowlistSetup : null,
  ].filter(Boolean);
  const buttonClassName = googleConfigured
    ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--paper)] hover:translate-y-[-1px] hover:shadow-[0_18px_34px_rgba(20,33,61,0.18)]"
    : "cursor-not-allowed border-[color:var(--line)] bg-[#e6dfd3] text-[color:rgba(20,33,61,0.72)] shadow-none";
  const buttonAccentClassName = googleConfigured
    ? "text-[color:var(--gold)]"
    : "text-[color:rgba(221,107,32,0.75)]";
  const buttonSubcopyClassName = googleConfigured
    ? "text-[color:var(--mist)]"
    : "text-[color:var(--muted)]";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[2.25rem] border border-[color:var(--line)] bg-[color:var(--ink)] p-8 text-[color:var(--paper)] shadow-[0_30px_80px_rgba(10,13,26,0.22)] sm:p-10">
          <p className="text-xs uppercase tracking-[0.38em] text-[color:var(--gold)]">
            Open API Audit Studio
          </p>
          <p className="mt-6 text-xs uppercase tracking-[0.32em] text-[color:var(--mist)]">
            {content.tag}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            {content.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[color:var(--mist)]">
            {content.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.24em] text-[color:var(--mist)]">
              {content.statusLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.24em] text-[color:var(--mist)]">
              {googleConfigured ? content.statusReady : content.statusNeedsSetup}
            </span>
          </div>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-[color:var(--mist)]">
            {content.note}
          </p>
        </article>

        <article className="rounded-[2.25rem] border border-[color:var(--line)] bg-white p-8 shadow-[0_16px_40px_rgba(20,33,61,0.08)] sm:p-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
                {content.panelTag}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                {content.panelTitle}
              </h2>
            </div>
            <Link
              href={`/login?lang=${alternateLocale}`}
              className="rounded-full border border-[color:var(--line)] px-4 py-2 text-sm text-[color:var(--ink)] transition hover:bg-[color:var(--shell)]"
            >
              {content.switchLabel}
            </Link>
          </div>

          <p className="mt-4 text-sm leading-6 text-[color:var(--muted)]">
            {content.helper}
          </p>

          <div
            className={`mt-6 rounded-[1.5rem] border px-5 py-4 text-sm leading-6 ${
              googleConfigured
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <p>{googleConfigured ? content.configured : content.missing}</p>
            {!googleConfigured && setupSteps.length ? (
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-current/80">
                {setupSteps.join(" ")}
              </p>
            ) : null}
          </div>

          {params.error ? (
            <div className="mt-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-6 text-rose-900">
              {params.error}
            </div>
          ) : null}

          <form action="/api/auth/google/start" method="get" className="mt-8">
            <input type="hidden" name="lang" value={locale} />
            <button
              type="submit"
              disabled={!googleConfigured}
              className={`flex w-full items-center justify-between rounded-[1.75rem] border px-5 py-5 text-left transition ${buttonClassName}`}
            >
              <span>
                <span
                  className={`block text-xs uppercase tracking-[0.32em] ${buttonAccentClassName}`}
                >
                  Google
                </span>
                <span className="mt-3 block text-xl font-semibold tracking-[-0.03em]">
                  {content.ctaTop}
                </span>
                <span className={`mt-1 block text-sm ${buttonSubcopyClassName}`}>
                  {content.ctaBottom}
                </span>
              </span>
              <span className={`text-2xl ${buttonSubcopyClassName}`} aria-hidden="true">
                →
              </span>
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
