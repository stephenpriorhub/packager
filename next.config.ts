import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships a CJS build with an optional debug harness; keep it external
  // so Next's bundler doesn't try to trace its test fixtures at build time.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
