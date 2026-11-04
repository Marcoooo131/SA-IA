import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { affiliateUrl } from "@/server/services/affiliate";
import { getCommerceSettings } from "@/server/settings";
import { Card, EmptyState, PageHeader, ButtonLink, Badge } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { pct } from "@/lib/format";
import { formatEUR } from "@/lib/money";

export default async function Links() {
  const actor = await requireActor();
  const [profile, settings, links] = await Promise.all([
    db.professionalProfile.findUniqueOrThrow({ where: { userId: actor.id } }), getCommerceSettings(),
    db.affiliateLink.findMany({ where: { professionalId: actor.id, product: { selections: { some: { professionalId: actor.id } } } }, include: { product: true, attributions: { where: { convertedAt: { not: null } }, select: { id: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const sales = await db.orderItem.groupBy({ by: ["productId"], where: { professionalId: actor.id, saleType: "SUPPLIER_AFFILIATE", order: { paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } } }, _sum: { quantity: true } });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <>
      <PageHeader title="Mes liens commerciaux" subtitle={<>Votre code : <strong className="text-pro">{profile.refCode}</strong>. Attribution « {settings.attributionModel === "LAST_CLICK" ? "dernier clic" : "premier clic"} » pendant {settings.attributionWindowDays} jours (sous réserve du consentement du visiteur aux traceurs ; sinon, attribution lors de la visite).</>}
        action={<ButtonLink href="/pro/catalogue" variant="accent">Ajouter des produits</ButtonLink>} />
      {!links.length ? <EmptyState title="Aucun lien" text="Sélectionnez des produits dans le catalogue fournisseurs pour générer vos liens." /> : (
        <div className="space-y-3">{links.map((l) => {
          const sold = sales.find((s) => s.productId === l.productId)?._sum.quantity ?? 0;
          return (
            <Card key={l.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{l.product.title} <span className="font-normal text-ink-3">· {formatEUR(l.product.priceCents)}</span></p>
                <div className="flex gap-2 text-xs"><Badge>{l.clicks} clics</Badge><Badge tone="success">{l.attributions.length} conversion(s)</Badge><Badge>{sold} vendu(s)</Badge><Badge tone="pro">Conversion {pct(l.attributions.length, l.clicks)}</Badge></div>
              </div>
              <CopyLink url={affiliateUrl(appUrl, l.productId, profile.refCode)} title={l.product.title} />
            </Card>);
        })}</div>
      )}
      <p className="mt-6 text-xs text-ink-3">Règles : pas d&apos;achat via votre propre lien, pas de publicité trompeuse, mention de votre statut de commercial rémunéré lors du partage (obligation de transparence). Voir les <a href="/legal/collaboration" className="underline">règles de collaboration</a>.</p>
    </>
  );
}
