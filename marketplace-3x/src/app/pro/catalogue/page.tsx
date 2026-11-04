import Image from "next/image";
import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { platformFeeOnCommission, supplierCommission } from "@/server/commission/engine";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { selectAction, unselectAction } from "@/app/actions/pro";
import { formatBps, formatEUR } from "@/lib/money";

export const metadata = { title: "Catalogue fournisseurs" };
type SP = { q?: string; category?: string; sort?: string };

export default async function SupplierCatalog({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [profile, settings, categories, selections] = await Promise.all([
    db.professionalProfile.findUniqueOrThrow({ where: { userId: actor.id } }), getCommerceSettings(),
    db.category.findMany({ where: { parentId: null }, orderBy: { position: "asc" } }),
    db.catalogSelection.findMany({ where: { professionalId: actor.id }, select: { productId: true } }),
  ]);
  if (profile.verificationStatus !== "VERIFIED") return <><PageHeader title="Catalogue fournisseurs" /><EmptyState title="Accès réservé aux indépendants vérifiés" text="Complétez votre profil et demandez la vérification pour accéder aux prix professionnels et aux commissions." /></>;
  const selected = new Set(selections.map((s) => s.productId));
  const products = await db.product.findMany({
    where: {
      sellerKind: "SUPPLIER", affiliateEnabled: true, status: "ACTIVE", owner: { status: "ACTIVE", supplierProfile: { verificationStatus: "VERIFIED" } },
      ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
      ...(sp.category ? { category: { slug: sp.category } } : {}),
    },
    include: { images: { take: 1 }, category: true, inventory: true, commissionRules: { where: { active: true }, take: 1 }, owner: { select: { supplierProfile: { select: { companyName: true } } } }, _count: { select: { selections: true } } },
    take: 120,
  });
  const rows = products.filter((p) => p.commissionRules[0]).map((p) => {
    const gross = supplierCommission(p.commissionRules[0], p.priceCents, 1);
    const net = gross - platformFeeOnCommission(gross, settings);
    return { p, gross, net, stock: p.inventory.reduce((a, i) => a + i.quantity, 0), match: profile.categorySlugs.includes(p.category.slug) };
  });
  rows.sort((a, b) => sp.sort === "price" ? a.p.priceCents - b.p.priceCents : sp.sort === "rate" ? b.net / b.p.priceCents - a.net / a.p.priceCents : (Number(b.match) - Number(a.match)) || b.net - a.net);
  return (
    <>
      <PageHeader eyebrow="Catalogue" title="Produits des fournisseurs" subtitle="Sélectionnez les produits que vous souhaitez recommander : un lien personnel traçable est généré pour chacun." />
      <form className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-4">
        <Input name="q" placeholder="Rechercher" defaultValue={sp.q} />
        <Select name="category" defaultValue={sp.category ?? ""}><option value="">Toutes catégories</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select>
        <Select name="sort" defaultValue={sp.sort ?? ""}><option value="">Recommandés pour vous</option><option value="net">Commission la plus élevée</option><option value="rate">Meilleur taux</option><option value="price">Prix croissant</option></Select>
        <Button variant="dark">Filtrer</Button>
      </form>
      {!rows.length ? <EmptyState title="Aucun produit" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(({ p, gross, net, stock, match }) => (
          <Card key={p.id} className="flex flex-col overflow-hidden">
            <div className="relative aspect-[16/10] bg-black/5">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="33vw" className="object-cover" />}
              {match && <span className="absolute left-2 top-2 rounded-full bg-pro px-2 py-0.5 text-[11px] font-semibold text-white">Votre spécialité</span>}</div>
            <div className="flex flex-1 flex-col p-4">
              <Link href={`/produit/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
              <p className="text-xs text-ink-3">{p.owner.supplierProfile?.companyName} · {p.category.name} · stock {stock} · {p._count.selections} indépendant(s)</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-3">Prix public</dt><dd className="font-semibold">{formatEUR(p.priceCents)}</dd></div>
                <div className="rounded-lg bg-canvas p-2"><dt className="text-ink-3">Prix pro</dt><dd className="font-semibold">{p.wholesalePriceCents ? formatEUR(p.wholesalePriceCents) : "—"}</dd></div>
                <div className="rounded-lg bg-pro/10 p-2"><dt className="text-pro">Votre gain</dt><dd className="font-semibold text-pro">{formatEUR(net)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-ink-3">Commission {p.commissionRules[0].type === "PERCENT" ? formatBps(p.commissionRules[0].value) : formatEUR(p.commissionRules[0].value)} = {formatEUR(gross)} − frais plateforme {formatEUR(gross - net)}</p>
              <div className="mt-auto pt-3">
                {selected.has(p.id)
                  ? <div className="flex items-center gap-2"><Badge tone="success">Dans ma sélection</Badge><ActionButton action={unselectAction} fields={{ productId: p.id }} variant="ghost">Retirer</ActionButton><Link href="/pro/liens" className="ml-auto text-sm text-pro underline">Mon lien</Link></div>
                  : <ActionButton action={selectAction} fields={{ productId: p.id }} variant="accent" size="md" className="w-full">Ajouter à ma sélection</ActionButton>}
              </div>
            </div>
          </Card>
        ))}</div>
      )}
    </>
  );
}
