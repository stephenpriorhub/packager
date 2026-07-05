import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships a CJS build with an optional debug harness; keep it external
  // so Next's bundler doesn't try to trace its test fixtures at build time.
  serverExternalPackages: ["pdf-parse", "mammoth"],
  experimental: {
    // Next 16 caps request bodies at 10MB by default; scanned promo PDFs
    // exceed that and the truncated body fails FormData parsing (same fix as
    // promo-analyzer).
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
