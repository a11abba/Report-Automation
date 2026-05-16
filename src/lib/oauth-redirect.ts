const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function safeParseUrl(input?: string | null) {
  if (!input) {
    return null;
  }

  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function resolveRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const requestProtocol = requestUrl.protocol.replace(/:$/, "");
  const directOrigin = safeParseUrl(request.headers.get("origin"));
  if (directOrigin) {
    return directOrigin.origin;
  }

  const refererOrigin = safeParseUrl(request.headers.get("referer"));
  if (refererOrigin) {
    return refererOrigin.origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    return `${request.headers.get("x-forwarded-proto") ?? requestProtocol}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    return `${requestProtocol}://${host}`;
  }

  return requestUrl.origin;
}

export function resolveOAuthRedirectUri(input: {
  configuredRedirectUri?: string | null;
  requestOrigin?: string | null;
  fallbackPath: string;
}) {
  const fallbackRedirectUri =
    input.configuredRedirectUri?.trim() ||
    `http://localhost:3000${input.fallbackPath}`;
  const configuredUrl = safeParseUrl(fallbackRedirectUri);
  const requestOriginUrl = safeParseUrl(input.requestOrigin);

  if (!configuredUrl || !requestOriginUrl) {
    return fallbackRedirectUri;
  }

  if (
    LOOPBACK_HOSTS.has(configuredUrl.hostname) &&
    LOOPBACK_HOSTS.has(requestOriginUrl.hostname)
  ) {
    const redirectUrl = new URL(configuredUrl.pathname, requestOriginUrl.origin);
    redirectUrl.search = configuredUrl.search;
    redirectUrl.hash = configuredUrl.hash;
    return redirectUrl.toString();
  }

  return configuredUrl.toString();
}
