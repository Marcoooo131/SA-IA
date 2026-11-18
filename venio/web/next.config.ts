import type { NextConfig } from "next";

// Deux modes de construction :
// - normal : interface servie par Next.js, API servie sous le même domaine (/api → VENIO_API_URL) ;
// - démonstration (NEXT_PUBLIC_VENIO_DEMO=1) : site 100 % statique pour GitHub Pages, API simulée
//   dans le navigateur (src/lib/demo). Les fichiers page.server.tsx / page.demo.tsx sont propres à chaque mode.
const DEMO = process.env.NEXT_PUBLIC_VENIO_DEMO === "1";
const API_URL = process.env.VENIO_API_URL ?? "http://127.0.0.1:8000";

const config: NextConfig = DEMO
  ? {
      output: "export",
      basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
      trailingSlash: true,
      pageExtensions: ["demo.tsx", "tsx", "ts"],
      images: { unoptimized: true },
    }
  : {
      pageExtensions: ["server.tsx", "tsx", "ts"],
      outputFileTracingRoot: __dirname,
      // Image Docker autonome ; Netlify utilise son propre adaptateur.
      ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
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
