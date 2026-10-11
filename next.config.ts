import path from "path";
import type { NextConfig } from "next";

// Baseline browser protections: HTTPS-only, no framing (clickjacking), no
// MIME sniffing, no referrer leaks, and no camera/mic/location access.
const securityHeaders = [
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
