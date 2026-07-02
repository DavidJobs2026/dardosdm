import type { NextConfig } from "next";

// Use RAILWAY_GIT_COMMIT_SHA injected by Railway at build time.
// No execSync needed — Railway sets this env var automatically.

// ─── Security headers ─────────────────────────────────────────────────────────
// CSP origins are derived from the same env vars the app uses at runtime, so
// the policy follows the deployment (localhost in dev, Railway in prod) without
// manual edits. NEXT_PUBLIC_* vars are always present at build time because
// they get inlined into the client bundle.
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").origin;
const WS_ORIGIN  = new URL(process.env.NEXT_PUBLIC_WS_URL  ?? "http://localhost:4000").origin;
const WS_SOCKET  = WS_ORIGIN.replace(/^http/, "ws"); // http→ws, https→wss
const IS_DEV     = process.env.NODE_ENV !== "production";

const csp = [
  `default-src 'self'`,
  // Next.js injects inline bootstrap scripts; dev mode additionally needs eval for HMR
  `script-src 'self' 'unsafe-inline'${IS_DEV ? " 'unsafe-eval'" : ""}`,
  // Tailwind/next-font emit inline styles
  `style-src 'self' 'unsafe-inline'`,
  // Avatars & tournament images can load straight from the API host
  `img-src 'self' data: blob: ${API_ORIGIN} https://*.railway.app`,
  `font-src 'self' data:`,
  // API (axios) + Socket.IO (websocket upgrade needs the ws:/wss: scheme; polling fallback uses http)
  `connect-src 'self' ${API_ORIGIN} ${WS_ORIGIN} ${WS_SOCKET}`,
  `worker-src 'self'`,        // service worker (push notifications)
  `manifest-src 'self'`,      // PWA manifest
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,   // anti-clickjacking (CSP-level, pairs with X-Frame-Options)
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options",         value: "DENY" },
  { key: "X-Content-Type-Options",  value: "nosniff" },
  { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",      value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS: only meaningful over HTTPS (prod); browsers ignore it on plain http
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  },
  // TypeScript errors now fail the build (the duplicate @types/react that caused
  // phantom errors was removed by excluding the React-Native app from the pnpm
  // workspace — see pnpm-workspace.yaml).
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@tournament/types"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      // Production API on Railway — allows any subdomain of railway.app
      { protocol: "https", hostname: "**.railway.app" },
      // Local development API
      { protocol: "http",  hostname: "localhost", port: "4000" },
    ],
  },
};

export default nextConfig;
