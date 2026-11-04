import type { MetadataRoute } from "next";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const [products, cats, pros] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, updatedAt: true }, take: 5000 }),
    db.category.findMany({ select: { slug: true } }),
    db.professionalProfile.findMany({ where: { verificationStatus: "VERIFIED" }, select: { userId: true } }),
  ]);
  return [
    { url: base }, { url: `${base}/recherche` }, { url: `${base}/independants` }, { url: `${base}/comment-ca-marche` },
    ...cats.map((c) => ({ url: `${base}/recherche?category=${c.slug}` })),
    ...products.map((p) => ({ url: `${base}/produit/${p.id}`, lastModified: p.updatedAt })),
    ...pros.map((p) => ({ url: `${base}/independants/${p.userId}` })),
  ];
}
