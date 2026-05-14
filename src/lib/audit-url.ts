import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
  ".home.arpa",
];

const IPV4_BLOCKLIST: Array<[number, number]> = [
  [toIpv4Int("0.0.0.0"), toIpv4Int("0.255.255.255")],
  [toIpv4Int("10.0.0.0"), toIpv4Int("10.255.255.255")],
  [toIpv4Int("100.64.0.0"), toIpv4Int("100.127.255.255")],
  [toIpv4Int("127.0.0.0"), toIpv4Int("127.255.255.255")],
  [toIpv4Int("169.254.0.0"), toIpv4Int("169.254.255.255")],
  [toIpv4Int("172.16.0.0"), toIpv4Int("172.31.255.255")],
  [toIpv4Int("192.0.0.0"), toIpv4Int("192.0.0.255")],
  [toIpv4Int("192.0.2.0"), toIpv4Int("192.0.2.255")],
  [toIpv4Int("192.168.0.0"), toIpv4Int("192.168.255.255")],
  [toIpv4Int("198.18.0.0"), toIpv4Int("198.19.255.255")],
  [toIpv4Int("198.51.100.0"), toIpv4Int("198.51.100.255")],
  [toIpv4Int("203.0.113.0"), toIpv4Int("203.0.113.255")],
  [toIpv4Int("224.0.0.0"), toIpv4Int("255.255.255.255")],
];

interface ResolvedAuditTarget {
  addresses: string[];
  normalizedUrl: string;
}

function toIpv4Int(address: string) {
  return address
    .split(".")
    .map((part) => Number(part))
    .reduce((total, part) => (total << 8) + part, 0) >>> 0;
}

function isBlockedIpv4(address: string) {
  const value = toIpv4Int(address);
  return IPV4_BLOCKLIST.some(([start, end]) => value >= start && value <= end);
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe8:") ||
    normalized.startsWith("fe9:") ||
    normalized.startsWith("fea:") ||
    normalized.startsWith("feb:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }

  const mappedPrefix = "::ffff:";
  if (!normalized.startsWith(mappedPrefix)) {
    return false;
  }

  const mapped = normalized.slice(mappedPrefix.length);
  return net.isIP(mapped) === 4 ? isBlockedIpv4(mapped) : false;
}

function assertAllowedAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4 && isBlockedIpv4(address)) {
    throw new Error("Target URL must resolve to a public IP address.");
  }
  if (family === 6 && isBlockedIpv6(address)) {
    throw new Error("Target URL must resolve to a public IP address.");
  }
}

async function resolvePublicHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(normalizedHostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))
  ) {
    throw new Error("Target URL must use a public hostname.");
  }

  if (net.isIP(normalizedHostname)) {
    assertAllowedAddress(normalizedHostname);
    return [normalizedHostname];
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Target URL hostname could not be resolved.");
  }

  if (records.length === 0) {
    throw new Error("Target URL hostname could not be resolved.");
  }

  const addresses = records.map((record) => record.address);
  for (const address of addresses) {
    assertAllowedAddress(address);
  }

  return [...new Set(addresses)];
}

function buildHostHeader(url: URL) {
  const defaultPort = url.protocol === "https:" ? "443" : "80";
  const hostname = net.isIP(url.hostname) === 6 ? `[${url.hostname}]` : url.hostname;
  return url.port && url.port !== defaultPort ? `${hostname}:${url.port}` : hostname;
}

function toNodeHeaders(headers: Headers, hostHeader: string) {
  const values: Record<string, string> = { host: hostHeader };
  headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      values[key] = value;
    }
  });
  if (!headers.has("accept-encoding")) {
    values["accept-encoding"] = "identity";
  }
  return values;
}

function toNodeBody(body: RequestInit["body"]) {
  if (body == null) {
    return null;
  }

  if (typeof body === "string" || body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  throw new Error("Unsupported request body for safe audit fetch.");
}

async function resolveSafeAuditTarget(input: string): Promise<ResolvedAuditTarget> {
  const normalizedUrl = normalizeAuditUrl(input);
  const addresses = await resolvePublicHostname(new URL(normalizedUrl).hostname);
  return {
    addresses,
    normalizedUrl,
  };
}

export function normalizeAuditUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Target URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Target URL must use http or https.");
  }

  if (!parsed.hostname) {
    throw new Error("Target URL must include a hostname.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Target URL cannot include embedded credentials.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export async function assertSafeAuditUrl(input: string) {
  return (await resolveSafeAuditTarget(input)).normalizedUrl;
}

async function requestPinnedAddress(
  targetUrl: string,
  address: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(targetUrl);
  const headers = new Headers(init?.headers);
  const body = toNodeBody(init?.body);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const request = transport.request(
      {
        hostname: address,
        port: url.port || undefined,
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        headers: toNodeHeaders(headers, buildHostHeader(url)),
        servername: url.protocol === "https:" ? url.hostname : undefined,
        rejectUnauthorized: url.protocol === "https:" ? true : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        response.on("end", () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              value.forEach((item) => responseHeaders.append(key, item));
            } else if (value !== undefined) {
              responseHeaders.set(key, value);
            }
          }

          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 502,
              headers: responseHeaders,
            }),
          );
        });
      },
    );

    request.on("error", reject);

    if (init?.signal) {
      if (init.signal.aborted) {
        request.destroy(new Error("The request was aborted."));
      } else {
        init.signal.addEventListener(
          "abort",
          () => request.destroy(new Error("The request was aborted.")),
          { once: true },
        );
      }
    }

    if (body != null) {
      request.write(body);
    }

    request.end();
  });
}

async function requestPinnedTarget(
  target: ResolvedAuditTarget,
  init?: RequestInit,
) {
  let lastError: unknown = null;

  for (const address of target.addresses) {
    try {
      return await requestPinnedAddress(target.normalizedUrl, address, init);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Target URL could not be fetched from a public IP address.");
}

export async function fetchWithSafeRedirects(
  input: string,
  init?: RequestInit,
  maxRedirects = 3,
): Promise<Response> {
  let currentTarget = await resolveSafeAuditTarget(input);

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const response = await requestPinnedTarget(currentTarget, {
      ...init,
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    currentTarget = await resolveSafeAuditTarget(
      new URL(location, currentTarget.normalizedUrl).toString(),
    );
  }

  throw new Error("Too many redirects while fetching target URL.");
}
