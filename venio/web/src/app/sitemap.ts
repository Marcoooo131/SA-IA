import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";

export const dynamic = "force-static";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://venio-rdv.netlify.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/fonctionnalites", "/secteurs", "/tarifs", "/demo", "/ressources", "/faq", "/inscription"];
  return [
    ...pages.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.7 })),
    ...GUIDES.map((g) => ({ url: `${SITE}/ressources/${g.slug}`, changeFrequency: "yearly" as const, priority: 0.5 })),
  ];
}
