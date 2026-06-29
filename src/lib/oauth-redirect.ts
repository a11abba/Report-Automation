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
  const configuredRedirectUri = input.configuredRedirectUri?.trim();
  const requestOriginUrl = safeParseUrl(input.requestOrigin);
  const configuredUrl = safeParseUrl(configuredRedirectUri);

  if (configuredRedirectUri && !configuredUrl) {
    if (requestOriginUrl) {
      return new URL(input.fallbackPath, requestOriginUrl.origin).toString();
    }
    return configuredRedirectUri;
  }

  const fallbackRedirectUri =
    configuredRedirectUri ||
    (requestOriginUrl
      ? new URL(input.fallbackPath, requestOriginUrl.origin).toString()
      : `http://localhost:3000${input.fallbackPath}`);
  const fallbackUrl = safeParseUrl(fallbackRedirectUri);

  if (!fallbackUrl || !requestOriginUrl) {
    return fallbackRedirectUri;
  }

  if (
    LOOPBACK_HOSTS.has(fallbackUrl.hostname) &&
    LOOPBACK_HOSTS.has(requestOriginUrl.hostname) &&
    fallbackUrl.hostname !== "localhost"
  ) {
    const redirectUrl = new URL(fallbackUrl.pathname, requestOriginUrl.origin);
    redirectUrl.search = fallbackUrl.search;
    redirectUrl.hash = fallbackUrl.hash;
    return redirectUrl.toString();
  }

  return fallbackUrl.toString();
}
