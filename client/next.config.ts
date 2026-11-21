import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  devIndicators: false,
  turbopack: { root: path.resolve(__dirname, "..") },
  experimental: { proxyClientMaxBodySize: 32 * 1024 * 1024 },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/:path*`,
      },
    ];
  },
};
export default config;
