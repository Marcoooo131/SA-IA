import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, Briefcase, Flag, MapPin, MessageCircle, Package, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getPublicProduct, similarProducts } from "@/server/services/catalog";
import { reputation } from "@/server/services/orders";
import { recordAffiliateVisit } from "@/server/services/affiliate";
import { getActor } from "@/server/auth/session";
import { readConsent } from "@/server/consent";
import { Gallery } from "@/components/product/Gallery";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductGrid } from "@/components/product/ProductCard";
import { Avatar, Badge, Card, Container, Field, Input, Select, Stars, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { contactAction, offerAction, reportAction } from "@/app/actions/shop";
import { conditionLabel, carriers } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await db.product.findUnique({ where: { id: (await params).id }, include: { images: { take: 1 } } });
  if (!p) return { title: "Annonce introuvable" };
  return { title: p.title, description: p.description.slice(0, 160), openGraph: { images: p.images[0] ? [p.images[0].url] : [] } };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ref } = await searchParams;
  const p = await getPublicProduct(id);
  const actor = await getActor();
  if (!p) notFound();
  const isOwner = actor?.id === p.ownerId;
  const isAdmin = actor?.roles.includes("ADMIN");
  if (p.status !== "ACTIVE" && p.status !== "SOLD_OUT" && !isOwner && !isAdmin) notFound();

  // Lien commercial : enregistrement de la visite (traceur seulement si consentement)
  let attributionId: string | null = null;
  let referrer: string | null = null;
  if (ref && /^[A-Z0-9]{3,20}$/i.test(ref)) {
    const consent = await readConsent();
    const att = await recordAffiliateVisit({ refCode: ref, productId: p.id, consented: !!consent?.affiliate, visitorKey: consent?.key, userId: actor?.id });
    if (att) {
      attributionId = att.id;
      const prof = await db.professionalProfile.findUnique({ where: { refCode: ref.toUpperCase() }, include: { user: { select: { displayName: true } } } });
      referrer = prof?.user.displayName ?? null;
    }
  }
  if (!isOwner) await db.product.update({ where: { id: p.id }, data: { viewCount: { increment: 1 } } });

  const [rep, reviews, similar, fav, sellerCount] = await Promise.all([
    reputation(p.ownerId),
    db.review.findMany({ where: { targetId: p.ownerId }, orderBy: { createdAt: "desc" }, take: 4, include: { author: { select: { displayName: true } } } }),
    similarProducts(p),
    actor ? db.favorite.findUnique({ where: { userId_productId: { userId: actor.id, productId: p.id } } }) : null,
    db.product.count({ where: { ownerId: p.ownerId, status: "ACTIVE" } }),
  ]);
  const stock = p.inventory.reduce((a, i) => a + i.quantity, 0);
  const isSupplier = p.sellerKind === "SUPPLIER";
  const delegated = p.contract?.status === "ACTIVE" ? p.contract : null;
  const sellerName = isSupplier ? p.owner.supplierProfile?.companyName ?? p.owner.displayName : p.owner.displayName;
  const handler = delegated ? delegated.professional : null;

  return (
    <Container className="py-8">
      <nav className="mb-5 text-sm text-ink-3" aria-label="Fil d'Ariane">
        <Link href="/" className="hover:text-ink">Accueil</Link> / <Link href={`/recherche?category=${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link>
      </nav>
      {p.status !== "ACTIVE" && <div className="mb-4 rounded-xl bg-warning/10 px-4 py-2 text-sm text-warning">Cette annonce n&apos;est pas en ligne ({p.status === "SOLD_OUT" ? "vendue / épuisée" : "statut : " + p.status}).</div>}
      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <Gallery images={p.images} title={p.title} />
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge>{conditionLabel[p.condition]}</Badge>
              {isSupplier ? <Badge tone="supplier"><BadgeCheck className="h-3 w-3" />Vendeur professionnel</Badge> : <Badge>Vendeur particulier</Badge>}
              {delegated && <Badge tone="pro"><Briefcase className="h-3 w-3" />Vente accompagnée</Badge>}
            </div>
            <h1 className="text-2xl font-semibold md:text-3xl">{p.title}</h1>
            {p.brand && <p className="mt-1 text-ink-3">{p.brand}</p>}
          </div>
          {referrer && (
            <div className="rounded-2xl border border-pro/20 bg-pro/5 px-4 py-3 text-sm">
              <span className="font-medium text-pro">Recommandé par {referrer}</span>, commercial indépendant. Il perçoit une commission versée par le fournisseur si vous achetez ; le prix reste identique.
            </div>
          )}
          <Card className="p-5">
            <BuyBox productId={p.id} priceCents={p.priceCents} stock={stock} attributionId={attributionId} isFavorite={!!fav}
              variants={p.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents, stock: v.inventory?.quantity ?? 0 }))}
              disabled={isOwner || p.status !== "ACTIVE" || stock <= 0} disabledReason={isOwner ? "C'est votre annonce." : "Cet article n'est plus disponible."} />
          </Card>
          <Card className="divide-y divide-line text-sm">
            <div className="flex gap-3 p-4"><Truck className="h-5 w-5 shrink-0 text-ink-3" />
              <div><p className="font-medium">{p.shippingCents ? `Livraison : ${formatEUR(p.shippingCents)}` : "Livraison offerte"} {p.shippingMethods.length > 0 && <span className="font-normal text-ink-3">· {p.shippingMethods.map((m) => carriers.find((c) => c.id === m)?.label ?? m).join(", ")}</span>}</p>
                <p className="text-ink-3">Expédition sous {p.shippingDays} jour{p.shippingDays > 1 ? "s" : ""}{p.handPickup ? " · remise en main propre possible" : ""}{p.city ? ` · depuis ${p.city}` : ""}</p></div></div>
            <div className="flex gap-3 p-4"><ShieldCheck className="h-5 w-5 shrink-0 text-ink-3" />
              <div><p className="font-medium">Paiement sécurisé</p><p className="text-ink-3">Le vendeur n&apos;est payé qu&apos;après confirmation de la réception.</p></div></div>
            <div className="flex gap-3 p-4"><RotateCcw className="h-5 w-5 shrink-0 text-ink-3" />
              <div>{isSupplier
                ? <><p className="font-medium">Droit de rétractation de 14 jours</p><p className="text-ink-3">Vendeur professionnel : garanties légales de conformité (2 ans) et des vices cachés applicables.</p></>
                : <><p className="font-medium">Vente entre particuliers</p><p className="text-ink-3">Le droit de rétractation et la garantie légale de conformité ne s&apos;appliquent pas ; la garantie des vices cachés reste applicable. Litige possible en cas de non-conformité.</p></>}
              </div></div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={sellerName} size={44} />
              <div className="min-w-0 flex-1">
                <Link href={`/vendeur/${p.ownerId}`} className="font-semibold hover:underline">{sellerName}</Link>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
                  {rep.count ? <Stars value={rep.average} count={rep.count} /> : <span>Pas encore d&apos;avis</span>}
                  <span>· {sellerCount} annonce{sellerCount > 1 ? "s" : ""}</span>
                  {p.owner.city && <span className="inline-flex items-center gap-0.5">· <MapPin className="h-3 w-3" />{p.owner.city}</span>}
                </div>
              </div>
              <div className="text-right text-xs text-ink-3"><p className="text-lg font-semibold text-ink">{rep.reliability}</p>fiabilité</div>
            </div>
            {handler && (
              <div className="mt-4 rounded-xl bg-pro/5 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-pro"><Briefcase className="h-4 w-4" />Vente gérée par <Link href={`/independants/${handler.id}`} className="underline">{handler.displayName}</Link></p>
                <p className="mt-0.5 text-ink-2">Commercial indépendant mandaté par le propriétaire de l&apos;article, rémunéré par une commission sur la vente.</p>
              </div>
            )}
            {actor && !isOwner && (
              <details className="mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink"><MessageCircle className="h-4 w-4" />Poser une question {handler ? "à l'indépendant" : "au vendeur"}</summary>
                <Form action={contactAction} className="mt-3 space-y-2">
                  <input type="hidden" name="to" value={handler?.id ?? p.ownerId} /><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="subject" value={p.title} />
                  <Textarea name="body" required placeholder="Bonjour, l'article est-il toujours disponible ?" />
                  <Submit size="sm">Envoyer</Submit>
                </Form>
              </details>
            )}
            {actor && !isOwner && !isSupplier && p.status === "ACTIVE" && (
              <details className="mt-3">
                <summary className="cursor-pointer list-none text-sm font-medium text-ink-2 hover:text-ink">💬 Faire une offre</summary>
                <Form action={offerAction} className="mt-3 space-y-2">
                  <input type="hidden" name="productId" value={p.id} />
                  <Field label="Votre prix (€)"><Input name="amount" inputMode="decimal" required placeholder={(p.priceCents / 100 * 0.9).toFixed(0)} /></Field>
                  <Textarea name="message" placeholder="Message (facultatif)" className="min-h-16" />
                  <Submit size="sm">Envoyer l&apos;offre</Submit>
                </Form>
              </details>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Description</h2>
          <p className="whitespace-pre-line leading-relaxed text-ink-2">{p.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white p-3"><dt className="text-ink-3">Catégorie</dt><dd className="font-medium">{p.category.name}</dd></div>
            <div className="rounded-xl bg-white p-3"><dt className="text-ink-3">État</dt><dd className="font-medium">{conditionLabel[p.condition]}</dd></div>
            {p.brand && <div className="rounded-xl bg-white p-3"><dt className="text-ink-3">Marque</dt><dd className="font-medium">{p.brand}</dd></div>}
            <div className="rounded-xl bg-white p-3"><dt className="text-ink-3">Publiée le</dt><dd className="font-medium">{formatDate(p.publishedAt ?? p.createdAt)}</dd></div>
            {isSupplier && p.recommendedPriceCents && <div className="rounded-xl bg-white p-3"><dt className="text-ink-3">Prix de vente conseillé</dt><dd className="font-medium">{formatEUR(p.recommendedPriceCents)}</dd></div>}
            {p.sku && <div className="rounded-xl bg-white p-3"><dt className="text-ink-3">Référence</dt><dd className="font-medium">{p.sku}</dd></div>}
          </dl>
          <details className="mt-6 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ink-3 hover:text-ink"><Flag className="h-4 w-4" />Signaler cette annonce</summary>
            <Form action={reportAction} className="mt-3 max-w-md space-y-2">
              <input type="hidden" name="targetType" value="PRODUCT" /><input type="hidden" name="targetId" value={p.id} />
              <Select name="reason" required defaultValue="">
                <option value="" disabled>Motif</option><option>Produit interdit ou réglementé</option><option>Contrefaçon</option><option>Annonce frauduleuse</option><option>Contenu inapproprié</option><option>Autre</option>
              </Select>
              <Textarea name="details" placeholder="Précisions (facultatif)" className="min-h-16" />
              <Submit size="sm" variant="secondary">Envoyer le signalement</Submit>
            </Form>
          </details>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Avis sur le vendeur</h2>
          {reviews.length ? (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl bg-white p-4 text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">{r.author.displayName}</span><Stars value={r.rating} /></div>
                  {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}
                  <p className="mt-1 text-xs text-ink-3">{formatDate(r.createdAt)} · achat vérifié</p>
                </li>
              ))}
            </ul>
          ) : <p className="flex items-center gap-2 text-sm text-ink-3"><Package className="h-4 w-4" />Aucun avis pour le moment.</p>}
        </section>
      </div>

      {similar.length > 0 && <section className="mt-14"><h2 className="mb-5 text-xl font-semibold">Articles similaires</h2><ProductGrid products={similar} /></section>}
    </Container>
  );
}
