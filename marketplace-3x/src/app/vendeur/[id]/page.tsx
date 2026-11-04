import { notFound, redirect } from "next/navigation";
import { BadgeCheck, MapPin } from "lucide-react";
import { db } from "@/server/db";
import { reputation } from "@/server/services/orders";
import { publicProductInclude, publicVisibilityWhere } from "@/server/services/catalog";
import { ProductGrid } from "@/components/product/ProductCard";
import { Avatar, Badge, Container, Stars } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, include: { supplierProfile: true } });
  if (!u || u.status !== "ACTIVE") notFound();
  if (u.primaryRole === "PROFESSIONAL") redirect(`/independants/${id}`);
  const [rep, products, reviews] = await Promise.all([
    reputation(id),
    db.product.findMany({ where: { AND: [await publicVisibilityWhere(), { ownerId: id }] }, include: publicProductInclude, orderBy: { publishedAt: "desc" }, take: 48 }),
    db.review.findMany({ where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 6, include: { author: { select: { displayName: true } } } }),
  ]);
  const name = u.supplierProfile?.companyName ?? u.displayName;
  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size={72} />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">{name}{u.supplierProfile?.verificationStatus === "VERIFIED" && <BadgeCheck className="h-5 w-5 text-supplier" />}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-3">
            {u.supplierProfile ? <Badge tone="supplier">Vendeur professionnel</Badge> : <Badge>Particulier</Badge>}
            {rep.count > 0 && <Stars value={rep.average} count={rep.count} />}
            {u.city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{u.city}</span>}
            <span>Membre depuis {formatDate(u.createdAt)}</span>
          </div>
          {u.supplierProfile?.description && <p className="mt-2 max-w-2xl text-ink-2">{u.supplierProfile.description}</p>}
        </div>
      </div>
      {reviews.length > 0 && (
        <div className="mt-8 grid gap-3 md:grid-cols-3">{reviews.map((r) => (
          <div key={r.id} className="rounded-2xl bg-white p-4 text-sm"><div className="flex justify-between"><span className="font-medium">{r.author.displayName}</span><Stars value={r.rating} /></div>{r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}</div>
        ))}</div>
      )}
      <h2 className="mb-5 mt-10 text-xl font-semibold">{products.length} annonce{products.length > 1 ? "s" : ""}</h2>
      <ProductGrid products={products} />
    </Container>
  );
}
