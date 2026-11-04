import { Briefcase, Building2, ShieldCheck, User } from "lucide-react";
import { getCommerceSettings } from "@/server/settings";
import { previewNet } from "@/server/commission/engine";
import { ButtonLink, Card, Container, PageHeader } from "@/components/ui";
import { formatBps, formatEUR } from "@/lib/money";
import { brand } from "@/config/brand";

export const metadata = { title: "Comment ça marche" };
export default async function HowItWorks() {
  const s = await getCommerceSettings();
  const ex1 = previewNet({ saleType: "P2P", unitPriceCents: 10000, quantity: 1 }, s);
  const ex2 = previewNet({ saleType: "DELEGATED", unitPriceCents: 10000, quantity: 1, contractCommissionBps: 2000 }, s);
  const ex3 = previewNet({ saleType: "SUPPLIER_AFFILIATE", unitPriceCents: 15000, quantity: 1, supplierRule: { type: "FIXED", value: 1500 } }, s);
  const blocks = [
    { id: "particuliers", icon: User, color: "var(--space-individual)", title: "Particuliers", steps: ["Publiez un article en quelques minutes (photos, prix, livraison).", "Vendez vous-même, ou confiez vos ventes à un indépendant vérifié choisi dans l'annuaire ou qui vous fait une proposition.", "Vous restez propriétaire : vous validez les produits confiés, les prix et le prix plancher des négociations.", "Suivez chaque action de l'indépendant, chaque vente et chaque paiement."] },
    { id: "independants", icon: Briefcase, color: "var(--space-pro)", title: "Indépendants", steps: ["Inscrivez-vous, complétez votre profil public, faites vérifier votre identité et votre SIRET.", "Prospectez les particuliers près de chez vous et envoyez des propositions commerciales.", "Sélectionnez des produits fournisseurs et partagez vos liens personnels traçables.", "Chaque vente vous est attribuée : vos commissions sont versées après validation."] },
    { id: "fournisseurs", icon: Building2, color: "var(--space-supplier)", title: "Fournisseurs", steps: ["Créez votre catalogue (ou importez-le en CSV / Excel) avec stocks et variantes.", "Définissez une commission par produit pour les apporteurs d'affaires.", "Les indépendants sélectionnent vos produits et génèrent des liens de vente.", "Vous recevez les commandes, expédiez, et êtes payé après validation."] },
  ];
  return (
    <Container className="py-12">
      <PageHeader eyebrow={brand.name} title="Comment ça marche" subtitle="Une marketplace, trois façons d'y gagner — avec des règles claires et un paiement sécurisé." />
      <div className="grid gap-4 md:grid-cols-3">{blocks.map((b) => (
        <Card key={b.id} id={b.id} className="p-6"><b.icon className="h-7 w-7" style={{ color: b.color }} /><h2 className="mt-3 text-xl font-semibold">{b.title}</h2>
          <ol className="mt-4 space-y-3 text-sm text-ink-2">{b.steps.map((t, i) => <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: b.color }}>{i + 1}</span>{t}</li>)}</ol></Card>
      ))}</div>
      <section id="acheteurs" className="mt-12 rounded-3xl bg-white p-8">
        <ShieldCheck className="h-8 w-8 text-success" />
        <h2 className="mt-3 text-2xl font-semibold">Acheteurs : vous êtes protégés</h2>
        <p className="mt-2 max-w-3xl text-ink-2">Vous payez en ligne via un prestataire de paiement agréé. Les fonds ne sont reversés au vendeur qu&apos;après confirmation de la réception, ou automatiquement {s.autoConfirmReceiptDays} jours après la livraison sans réclamation. En cas de problème (colis perdu, article non conforme), ouvrez un litige : les fonds sont gelés et notre équipe tranche. Les vendeurs professionnels sont clairement identifiés ; avec eux, vous bénéficiez du droit de rétractation de 14 jours et des garanties légales.</p>
      </section>
      <section id="commissions" className="mt-12">
        <h2 className="text-2xl font-semibold">Commissions et frais : transparence totale</h2>
        <p className="mt-2 text-ink-2">Barème en vigueur (configurable par la plateforme, toute évolution est annoncée à l&apos;avance).</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="p-5"><p className="font-semibold">Vente entre particuliers — 100 €</p><p className="mt-1 text-sm text-ink-3">Frais de service {formatBps(s.p2pFeeBps)} + {formatEUR(s.p2pFeeFixedCents)}</p><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><dt>Vendeur</dt><dd className="font-semibold">{formatEUR(ex1.seller)}</dd></div><div className="flex justify-between"><dt>Plateforme</dt><dd>{formatEUR(ex1.platform)}</dd></div></dl></Card>
          <Card className="p-5"><p className="font-semibold">Vente déléguée — 100 € à 20 %</p><p className="mt-1 text-sm text-ink-3">Frais plateforme : {formatBps(s.commissionPlatformFeeBps)} de la commission (min. {formatEUR(s.commissionPlatformFeeMinCents)})</p><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><dt>Propriétaire</dt><dd className="font-semibold">{formatEUR(ex2.seller)}</dd></div><div className="flex justify-between"><dt>Indépendant</dt><dd>{formatEUR(ex2.professional)}</dd></div><div className="flex justify-between"><dt>Plateforme</dt><dd>{formatEUR(ex2.platform)}</dd></div></dl></Card>
          <Card className="p-5"><p className="font-semibold">Vente fournisseur — 150 €, commission 15 €</p><p className="mt-1 text-sm text-ink-3">Vente directe sans indépendant : {formatBps(s.supplierDirectFeeBps)}</p><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><dt>Fournisseur</dt><dd className="font-semibold">{formatEUR(ex3.seller)}</dd></div><div className="flex justify-between"><dt>Indépendant</dt><dd>{formatEUR(ex3.professional)}</dd></div><div className="flex justify-between"><dt>Plateforme</dt><dd>{formatEUR(ex3.platform)}</dd></div></dl></Card>
        </div>
        <p className="mt-4 text-sm text-ink-3">Statuts d&apos;une commission : en attente → en cours de validation (paiement reçu) → validée (réception confirmée) → disponible (délai de {s.holdDaysP2P} j entre particuliers, {s.holdDaysProfessional} j pour un vendeur professionnel) → versée. Une annulation, un remboursement ou un litige la bloque ou l&apos;annule.</p>
      </section>
      <div className="mt-10 flex flex-wrap gap-2"><ButtonLink href="/inscription">Créer un compte</ButtonLink><ButtonLink href="/recherche" variant="secondary">Parcourir les annonces</ButtonLink></div>
    </Container>
  );
}
