import type { Metadata } from "next";
import { PageHero } from "@/components/site/SiteChrome";
import { PricingTable } from "@/components/site/PricingTable";
import { Alert } from "@/components/ui";
import { getPublicPlans } from "@/lib/server";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Une seule offre, par entreprise, sans engagement : prise de rendez-vous qualifiés, récupération des appels manqués et SMS inclus. Prix hors taxes.",
};
export const revalidate = 600;

const FAQ = [
  ["Le prix est-il par utilisateur ?", "Non : par entreprise. Aujourd'hui, l'espace est accessible à une personne ; l'accès pour vos collaborateurs n'est pas encore disponible."],
  ["Faut-il une carte bancaire pour l'essai ?", "Non. Si vous vous abonnez pendant l'essai, la carte est enregistrée et le premier prélèvement a lieu à la fin de l'essai."],
  ["Que se passe-t-il si je ne m'abonne pas à la fin de l'essai ?", "Votre page cesse d'accepter de nouvelles réservations, vos données restent consultables. Vous pouvez souscrire à tout moment pour la réactiver."],
  ["Puis-je passer à l'annuel ou résilier ?", "Oui, à tout moment depuis votre espace. La résiliation prend effet à la fin de la période déjà payée, sans frais."],
  ["Combien coûtent les SMS ?", "100 SMS sont inclus chaque mois. Au-delà, des packs prépayés (100 SMS pour 10 € HT, 500 pour 40 € HT) : jamais de facturation surprise."],
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
