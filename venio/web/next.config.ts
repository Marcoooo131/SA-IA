import type { NextConfig } from "next";

// L'API est servie sous le même domaine (/api) : cookies de session HttpOnly sans CORS.
const API_URL = process.env.VENIO_API_URL ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=()" },
      ],
    }];
  },
};

export default config;
