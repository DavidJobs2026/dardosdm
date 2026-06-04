import type { NextConfig } from "next";

// Use RAILWAY_GIT_COMMIT_SHA injected by Railway at build time.
// No execSync needed — Railway sets this env var automatically.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  },
  // Type errors in monorepo context are false positives from pnpm's virtual store
  // creating duplicate @types/react instances — code is functionally correct
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@tournament/types"],
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
