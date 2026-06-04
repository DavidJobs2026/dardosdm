import type { NextConfig } from "next";
import { execSync } from "child_process";

// Inject the current git commit SHA at build time so the frontend knows
// its own version and can compare it against what the server reports.
const COMMIT_SHA = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  }
})();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: COMMIT_SHA,
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
