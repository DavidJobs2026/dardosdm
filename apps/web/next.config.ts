import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tournament/types"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "localhost", port: "4000" },
    ],
  },
};

export default nextConfig;
