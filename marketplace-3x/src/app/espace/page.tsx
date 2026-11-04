import Link from "next/link";
import { Handshake, Plus, Search } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { balances } from "@/server/services/finance";
import { ButtonLink, Card, CardHeader, PageHeader, Stat, StatGrid, Alert } from "@/components/ui";
import { OrderList } from "@/components/OrderList";
import { formatEUR } from "@/lib/money";

export const metadata = { title: "Mon espace" };

export default async function Dashboard() {
  const actor = await requireActor();
  const [active, views, sales, purchases, b, pendingCollab, pendingPrices, recentSales] = await Promise.all([
    db.product.count({ where: { ownerId: actor.id, status: "ACTIVE" } }),
    db.product.aggregate({ where: { ownerId: actor.id }, _sum: { viewCount: true } }),
    db.order.count({ where: { sellerId: actor.id, paidAt: { not: null } } }),
    db.order.count({ where: { buyerId: actor.id, paidAt: { not: null } } }),
    balances(actor.id),
    db.collaborationOffer.count({ where: { toUserId: actor.id, status: "PENDING" } }),
    db.priceProposal.count({ where: { status: "PENDING", product: { ownerId: actor.id } } }),
    db.order.findMany({ where: { sellerId: actor.id, paidAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 5, include: { items: { include: { product: { include: { images: { take: 1 } } } } } } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Particulier" title={`Bonjour ${actor.displayName.split(" ")[0]} 👋`} subtitle="Vendez vous-même ou confiez vos articles à un indépendant : tout se pilote d'ici."
        action={<><ButtonLink href="/espace/annonces/nouvelle" variant="accent"><Plus className="h-4 w-4" />Nouvelle annonce</ButtonLink><ButtonLink href="/espace/delegation" variant="secondary"><Handshake className="h-4 w-4" />Confier mes ventes</ButtonLink></>} />
      {!actor.emailVerified && <div className="mb-4"><Alert tone="warning" title="Confirmez votre adresse e-mail">Un lien vous a été envoyé. <Link href="/compte" className="underline">Renvoyer l&apos;e-mail</Link></Alert></div>}
      {(pendingCollab > 0 || pendingPrices > 0) && (
        <div className="mb-4"><Alert tone="info" title="Action attendue">
          {pendingCollab > 0 && <>{pendingCollab} proposition(s) de collaboration à examiner. </>}
          {pendingPrices > 0 && <>{pendingPrices} proposition(s) de prix de votre indépendant à valider. </>}
          <Link href="/espace/delegation" className="underline">Voir</Link>
        </Alert></div>
      )}
      <StatGrid>
        <Stat label="Annonces en ligne" value={active} hint={`${views._sum.viewCount ?? 0} vues au total`} />
        <Stat label="Ventes" value={sales} />
        <Stat label="Achats" value={purchases} />
        <Stat label="Revenus disponibles" value={formatEUR(b.available)} hint={`${formatEUR(b.validating + b.validated)} en cours de validation`} />
      </StatGrid>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card><CardHeader title="Dernières ventes" action={<Link href="/espace/ventes" className="text-sm text-ink-2 hover:text-ink">Tout voir</Link>} />
          <div className="p-4"><OrderList orders={recentSales} empty="Aucune vente pour le moment" /></div></Card>
        <Card className="p-5">
          <h2 className="font-semibold">Comment vendre plus vite ?</h2>
          <ul className="mt-3 space-y-3 text-sm text-ink-2">
            <li className="flex gap-2"><Search className="h-4 w-4 shrink-0 text-brand" />Des photos lumineuses et un titre précis (marque, taille, modèle).</li>
            <li className="flex gap-2"><Handshake className="h-4 w-4 shrink-0 text-brand" />Pas le temps ? Un indépendant vérifié s&apos;occupe de tout, vous validez les prix.</li>
          </ul>
          <ButtonLink href="/independants" variant="secondary" size="sm" className="mt-4">Annuaire des indépendants</ButtonLink>
        </Card>
      </div>
    </>
  );
}
