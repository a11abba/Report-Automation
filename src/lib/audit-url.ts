import dns from "node:dns/promises";
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

async function assertPublicHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(normalizedHostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))
  ) {
    throw new Error("Target URL must use a public hostname.");
  }

  if (net.isIP(normalizedHostname)) {
    assertAllowedAddress(normalizedHostname);
    return;
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

  for (const record of records) {
    assertAllowedAddress(record.address);
  }
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
  const normalized = normalizeAuditUrl(input);
  await assertPublicHostname(new URL(normalized).hostname);
  return normalized;
}

export async function fetchWithSafeRedirects(
  input: string,
  init?: RequestInit,
  maxRedirects = 3,
): Promise<Response> {
  let currentUrl = await assertSafeAuditUrl(input);

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const response = await fetch(currentUrl, {
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

    currentUrl = await assertSafeAuditUrl(new URL(location, currentUrl).toString());
  }

  throw new Error("Too many redirects while fetching target URL.");
}
