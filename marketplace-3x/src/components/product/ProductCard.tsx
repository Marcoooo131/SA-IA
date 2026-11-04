import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Briefcase, MapPin } from "lucide-react";
import { formatEUR } from "@/lib/money";
import { conditionLabel } from "@/lib/labels";
import type { ProductCondition, SellerKind } from "@prisma/client";

export type CardProduct = {
  id: string; title: string; priceCents: number; condition: ProductCondition; sellerKind: SellerKind; city: string | null; brand: string | null;
  images: { url: string; alt: string | null }[];
  owner: { displayName: string; supplierProfile: { companyName: string; verificationStatus?: string } | null };
  contract: { status: string; professional: { displayName: string } } | null;
};

export function ProductCard({ p, priority }: { p: CardProduct; priority?: boolean }) {
  const img = p.images[0];
  const delegated = p.contract?.status === "ACTIVE";
  return (
    <Link href={`/produit/${p.id}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-black/5">
        {img ? (
          <Image src={img.url} alt={img.alt ?? p.title} fill sizes="(max-width:768px) 50vw, 25vw" priority={priority}
            className="object-cover transition duration-500 group-hover:scale-[1.04]" />
        ) : <div className="flex h-full items-center justify-center text-sm text-ink-3">Pas de photo</div>}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {p.condition === "NEW" && <span className="rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm">Neuf</span>}
          {p.sellerKind === "SUPPLIER" && <span className="rounded-full bg-supplier px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">Pro</span>}
          {delegated && <span className="inline-flex items-center gap-1 rounded-full bg-pro px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"><Briefcase className="h-3 w-3" />Accompagné</span>}
        </div>
      </div>
      <div className="mt-2.5 space-y-0.5 px-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">{formatEUR(p.priceCents)}</p>
          {p.brand && <p className="truncate text-xs text-ink-3">{p.brand}</p>}
        </div>
        <p className="line-clamp-1 text-sm text-ink-2">{p.title}</p>
        <p className="flex items-center gap-1 text-xs text-ink-3">
          {p.sellerKind === "SUPPLIER"
            ? <><BadgeCheck className="h-3.5 w-3.5 text-supplier" />{p.owner.supplierProfile?.companyName ?? p.owner.displayName}</>
            : <>{conditionLabel[p.condition]}{p.city && <><span>·</span><MapPin className="h-3 w-3" />{p.city}</>}</>}
        </p>
      </div>
    </Link>
  );
}

export function ProductGrid({ products, cols = 4 }: { products: CardProduct[]; cols?: 4 | 5 | 6 }) {
  const c = { 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols];
  return <div className={`grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 ${c}`}>{products.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 4} />)}</div>;
}
