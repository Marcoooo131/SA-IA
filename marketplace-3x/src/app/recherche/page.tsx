import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { db } from "@/server/db";
import { searchProducts } from "@/server/services/catalog";
import { ProductGrid } from "@/components/product/ProductCard";
import { Button, Container, EmptyState, Input, Select } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { saveSearchAction } from "@/app/actions/shop";
import { conditionLabel } from "@/lib/labels";

export const metadata = { title: "Rechercher" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const clean = Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined && v !== ""));
  let result;
  try { result = await searchProducts(clean); } catch { result = await searchProducts({}); }
  const categories = await db.category.findMany({ where: { parentId: null }, orderBy: { position: "asc" } });
  const qs = (patch: SP) => {
    const u = new URLSearchParams({ ...clean, ...patch } as Record<string, string>);
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k);
    return `/recherche?${u.toString()}`;
  };
  const p = result.params;
  const activeCat = categories.find((c) => c.slug === p.category);

  return (
    <Container className="py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">{p.q ? <>Résultats pour « {p.q} »</> : activeCat ? activeCat.name : "Toutes les annonces"}</h1>
          <p className="mt-1 text-sm text-ink-3">{result.total} annonce{result.total > 1 ? "s" : ""}</p>
        </div>
        <Form action={saveSearchAction} showOk className="flex items-center gap-2">
          <input type="hidden" name="params" value={JSON.stringify(p)} />
          <input type="hidden" name="label" value={p.q ?? activeCat?.name ?? "Ma recherche"} />
          <Submit variant="secondary" size="sm">🔔 Créer une alerte</Submit>
        </Form>
      </div>

      <div className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
        <Link href={qs({ category: "" })} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${!p.category ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>Tout</Link>
        {categories.map((c) => (
          <Link key={c.id} href={qs({ category: c.slug, page: "" })} className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm ${p.category === c.slug ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink-3"}`}>{c.name}</Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside>
          <details open className="rounded-2xl border border-line bg-white p-4 lg:sticky lg:top-24">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4" />Filtres</summary>
            <form action="/recherche" className="mt-4 space-y-4 text-sm">
              {p.q && <input type="hidden" name="q" value={p.q} />}
              {p.category && <input type="hidden" name="category" value={p.category} />}
              <div>
                <p className="mb-1.5 font-medium">Prix (€)</p>
                <div className="flex gap-2"><Input name="min" type="number" min={0} placeholder="Min" defaultValue={p.min} /><Input name="max" type="number" min={0} placeholder="Max" defaultValue={p.max} /></div>
              </div>
              <div><p className="mb-1.5 font-medium">Neuf ou occasion</p>
                <Select name="state" defaultValue={p.state ?? ""}><option value="">Indifférent</option><option value="new">Neuf</option><option value="used">Occasion</option></Select></div>
              <div><p className="mb-1.5 font-medium">État</p>
                <Select name="condition" defaultValue={p.condition ?? ""}><option value="">Tous</option>{Object.entries(conditionLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
              <div><p className="mb-1.5 font-medium">Vendeur</p>
                <Select name="seller" defaultValue={p.seller ?? ""}><option value="">Tous</option><option value="individual">Particulier</option><option value="professional">Accompagné par un indépendant</option><option value="supplier">Professionnel (fournisseur)</option></Select></div>
              <div><p className="mb-1.5 font-medium">Localisation</p><Input name="city" placeholder="Ville ou département (35)" defaultValue={p.city} /></div>
              <div><p className="mb-1.5 font-medium">Marque</p><Input name="brand" defaultValue={p.brand} /></div>
              <div><p className="mb-1.5 font-medium">Livraison</p>
                <Select name="delivery" defaultValue={p.delivery ?? ""}><option value="">Indifférent</option><option value="shipping">Envoi possible</option><option value="pickup">Remise en main propre</option></Select></div>
              <div><p className="mb-1.5 font-medium">Publiée depuis</p>
                <Select name="since" defaultValue={p.since?.toString() ?? ""}><option value="">Toujours</option><option value="1">24 heures</option><option value="7">7 jours</option><option value="30">30 jours</option></Select></div>
              <div><p className="mb-1.5 font-medium">Trier par</p>
                <Select name="sort" defaultValue={p.sort ?? "recent"}><option value="recent">Plus récentes</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option><option value="popular">Popularité</option></Select></div>
              <div className="flex gap-2 pt-1"><Button className="flex-1" variant="dark">Appliquer</Button><Link href="/recherche" className="flex h-10 items-center px-3 text-ink-3 hover:text-ink">Effacer</Link></div>
            </form>
          </details>
        </aside>
        <div>
          {result.items.length ? <ProductGrid products={result.items} cols={4} /> : (
            <EmptyState title="Aucune annonce ne correspond" text="Élargissez vos filtres ou créez une alerte : nous vous préviendrons dès qu'un article correspondant sera publié." />
          )}
          {result.pages > 1 && (
            <nav className="mt-10 flex justify-center gap-2" aria-label="Pagination">
              {Array.from({ length: Math.min(result.pages, 10) }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={qs({ page: String(n) })} className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${n === result.page ? "bg-ink text-white" : "border border-line bg-white"}`}>{n}</Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </Container>
  );
}
