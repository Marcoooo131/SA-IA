import type { MetadataRoute } from "next";

export const dynamic = "force-static";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://venio-rdv.netlify.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/r/", "/c/", "/design-system"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
