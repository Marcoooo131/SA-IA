import type { Metadata } from "next";
import { PageHero } from "@/components/site/SiteChrome";
import { PricingTable } from "@/components/site/PricingTable";
import { Alert } from "@/components/ui";
import { getPublicPlans } from "@/lib/server";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Trois offres par entreprise, sans engagement, avec la récupération des appels manqués et des crédits SMS inclus. Prix hors taxes.",
};
export const revalidate = 600;

const FAQ = [
  ["Le prix est-il par utilisateur ?", "Non : par entreprise. Chaque offre inclut un nombre d'utilisateurs ; vous ne payez pas chaque collaborateur."],
  ["Faut-il une carte bancaire pour l'essai ?", "Non. Si vous choisissez une offre pendant l'essai, la carte est enregistrée et le premier prélèvement a lieu à la fin de l'essai."],
  ["Que se passe-t-il si je ne choisis pas d'offre à la fin de l'essai ?", "Votre page cesse d'accepter de nouvelles réservations, vos données restent consultables. Vous pouvez souscrire à tout moment pour la réactiver."],
  ["Puis-je changer d'offre ou résilier ?", "Oui, à tout moment depuis votre espace : montée en gamme immédiate au prorata, résiliation effective à la fin de la période payée."],
  ["Combien coûtent les SMS ?", "Les offres incluent des crédits SMS mensuels. Au-delà, des packs prépayés : jamais de facturation surprise."],
  ["Les prix sont-ils TTC ?", "Non, ils sont indiqués hors taxes. La TVA applicable s'ajoute lors du paiement."],
];

export default async function PricingPage() {
  const data = await getPublicPlans();
  return (
    <>
      <PageHero eyebrow="Tarifs" title="Un prix simple, par entreprise."
        intro="Un rendez-vous de plus par mois rembourse largement l'abonnement d'une entreprise à devis. Sans engagement, avec un essai gratuit." />
      <div className="mx-auto max-w-6xl px-5 pb-20">
        {data ? <PricingTable data={data} /> : <Alert kind="warning">Les tarifs sont momentanément indisponibles. Réessayez dans un instant.</Alert>}
      </div>
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="font-display text-4xl font-semibold text-ink">Questions sur les tarifs</h2>
          <dl className="mt-10 divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-5">
                <dt className="font-semibold text-ink">{q}</dt>
                <dd className="mt-2 text-ink-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
