import Link from "next/link";
import { BadgeCheck, MapPin, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { reputation } from "@/server/services/orders";
import { matchScore } from "@/server/services/delegation";
import { Avatar, Badge, Card, Container, Input, PageHeader, Select, Stars, Button } from "@/components/ui";
import { formatBps } from "@/lib/money";

export const metadata = { title: "Annuaire des indépendants" };
export const dynamic = "force-dynamic";

export default async function Directory({ searchParams }: { searchParams: Promise<{ category?: string; city?: string; pickup?: string }> }) {
  const sp = await searchParams;
  const actor = await getActor();
  const me = actor ? await db.user.findUnique({ where: { id: actor.id }, include: { products: { where: { status: "ACTIVE" }, select: { category: { select: { slug: true } } } } } }) : null;
  const myCats = [...new Set(me?.products.map((p) => p.category.slug) ?? [])];
  const categories = await db.category.findMany({ where: { parentId: null }, orderBy: { position: "asc" } });
  const pros = await db.professionalProfile.findMany({
    where: {
      verificationStatus: "VERIFIED", user: { status: "ACTIVE" },
      ...(sp.category ? { categorySlugs: { has: sp.category } } : {}),
      ...(sp.city ? { serviceArea: { contains: sp.city, mode: "insensitive" } } : {}),
      ...(sp.pickup ? { offersPickup: true } : {}),
    },
    include: { user: { select: { id: true, displayName: true, city: true, postalCode: true } } },
    take: 60,
  });
  const enriched = await Promise.all(pros.map(async (p) => ({
    ...p, rep: await reputation(p.userId),
    score: matchScore({ categorySlugs: p.categorySlugs, serviceArea: p.serviceArea, postalCode: p.user.postalCode }, { categorySlugs: sp.category ? [sp.category] : myCats, city: me?.city, postalCode: me?.postalCode }),
  })));
  enriched.sort((a, b) => b.score - a.score || b.rep.sales - a.rep.sales);
  const catName = (s: string) => categories.find((c) => c.slug === s)?.name.split(" & ")[0] ?? s;

  return (
    <Container className="py-10">
      <PageHeader eyebrow="Annuaire professionnel" title="Trouvez l'indépendant qui vendra pour vous"
        subtitle="Tous les profils sont vérifiés (identité et SIRET). Comparez spécialités, résultats, avis et commissions, puis envoyez votre demande." />
      <form className="mb-8 grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Catégorie"><option value="">Toutes les spécialités</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select>
        <Input name="city" placeholder="Ville / zone d'intervention" defaultValue={sp.city} />
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="pickup" defaultChecked={!!sp.pickup} />Récupère les articles</label>
        <Button variant="dark">Filtrer</Button>
      </form>
      {myCats.length > 0 && !sp.category && <p className="mb-4 text-sm text-ink-3">Classement personnalisé selon vos annonces ({myCats.map(catName).join(", ")}) et votre localisation.</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {enriched.map((p) => (
          <Card key={p.id} className="flex flex-col p-5 transition hover:shadow-md">
            <div className="flex items-start gap-3">
              <Avatar name={p.user.displayName} size={52} />
              <div className="min-w-0">
                <Link href={`/independants/${p.userId}`} className="flex items-center gap-1 font-semibold hover:underline">{p.user.displayName}<BadgeCheck className="h-4 w-4 text-pro" /></Link>
                <p className="line-clamp-2 text-sm text-ink-2">{p.headline}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{p.categorySlugs.map((c) => <Badge key={c} tone="pro">{catName(c)}</Badge>)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-canvas p-2"><p className="font-semibold">{p.rep.sales}</p><p className="text-xs text-ink-3">ventes</p></div>
              <div className="rounded-xl bg-canvas p-2"><p className="font-semibold">{p.rep.count ? p.rep.average.toFixed(1) : "—"}</p><p className="text-xs text-ink-3">note</p></div>
              <div className="rounded-xl bg-canvas p-2"><p className="font-semibold">{formatBps(p.defaultCommissionBps)}</p><p className="text-xs text-ink-3">commission</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
              {p.serviceArea && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.serviceArea} ({p.serviceRadiusKm} km)</span>}
              {p.offersPickup && <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />Récupération & expédition</span>}
              {p.rep.count > 0 && <Stars value={p.rep.average} count={p.rep.count} />}
            </div>
            <div className="mt-auto pt-4"><Link href={`/independants/${p.userId}`} className="block rounded-full bg-pro py-2.5 text-center text-sm font-medium text-white hover:brightness-95">Voir le profil</Link></div>
          </Card>
        ))}
      </div>
      {!enriched.length && <p className="text-ink-3">Aucun indépendant ne correspond à ces critères.</p>}
    </Container>
  );
}
