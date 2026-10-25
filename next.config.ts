import path from "path";
import type { NextConfig } from "next";

// Content-Security-Policy: scripts, styles, fonts and requests only from this
// app; no plugins, no <base> or form hijacking, never framed. Scripts still
// allow 'unsafe-inline' because Next's App Router injects inline bootstrap
// scripts (a nonce would need per-request middleware and fully dynamic
// rendering); the policy still blocks any script from another origin.
// Images may come from https (Vercel Blob logos and documents). Vercel's
// preview toolbar (vercel.live) is allowed on preview deployments only.
const isDev = process.env.NODE_ENV !== "production";
const vercelLive = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${vercelLive}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}${vercelLive}`,
  `frame-src 'self'${vercelLive}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Baseline browser protections: HTTPS-only, no framing (clickjacking), no
// MIME sniffing, no referrer leaks, and no camera/mic/location access.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // An unrelated lockfile at C:\Users\Billions\package-lock.json makes Next
  // misdetect the workspace root — pin it explicitly to this repo.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
