import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " http: https: ws: wss:" : " https:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/audits/*/report.pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/report-periods/*/report.pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./.codex-*",
      "./apps/**/*",
      "./data/**/*",
      "./database/**/*",
      "./desktop/**/*",
      "./docs/**/*",
      "./node_modules/electron/**/*",
      "./*.log",
      "./*.png",
      "./*.pdf",
    ],
  },
  turbopack: {
    root: rootDir,
  },
  async headers() {
    const headers = [
      {
        key: "Content-Security-Policy",
        value: cspHeader,
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      },
    ];

    if (!isDev) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
};

export default nextConfig;
