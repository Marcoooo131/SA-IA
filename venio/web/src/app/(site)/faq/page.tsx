import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/SiteChrome";

export const metadata: Metadata = { title: "Questions fréquentes", description: "Fonctionnement, appels manqués, SMS, données personnelles, abonnement : les réponses aux questions fréquentes sur Venio." };

const FAQ: { group: string; items: [string, string][] }[] = [
  { group: "Fonctionnement", items: [
    ["Mes clients doivent-ils créer un compte ?", "Non. Ils répondent aux questions, choisissent un créneau et laissent leurs coordonnées. Un lien personnel leur permet ensuite de reporter ou d'annuler."],
    ["Puis-je modifier les questions du parcours ?", "Oui : textes, icônes et caractère obligatoire depuis votre espace, avec un brouillon et une publication versionnée. Les demandes en cours restent sur la version qu'elles ont commencée."],
    ["Comment sont calculés les créneaux ?", "À partir des horaires de chaque collaborateur, de vos pauses, absences et jours fériés, du délai minimum et du temps de trajet entre deux rendez-vous. Un créneau réservé n'est plus proposé à personne d'autre."],
  ] },
  { group: "Appels manqués et SMS", items: [
    ["Comment Venio sait-il qu'un appel n'a pas été pris ?", "Votre ligne renvoie les appels sans réponse vers un numéro Venio : si l'appel arrive chez nous, c'est que vous n'avez pas décroché. Vous gardez votre numéro et vous n'installez aucune application."],
    ["La fonction est-elle disponible ?", "Elle est en version pilote : le traitement complet fonctionne et peut être essayé avec une ligne de test ; l'envoi réel de SMS est activé avec chaque entreprise pilote après branchement de sa ligne."],
    ["Un prospect peut-il recevoir plusieurs SMS ?", "Non : un seul SMS pour des appels rapprochés, un plafond par numéro sur 30 jours, jamais la nuit, jamais vers un numéro masqué, exclu ou qui a demandé à ne plus en recevoir."],
    ["Combien coûtent les SMS ?", "Chaque offre inclut des crédits SMS mensuels ; au-delà, des packs prépayés. Un SMS simulé ou qui ne part pas ne consomme aucun crédit."],
  ] },
  { group: "Données et sécurité", items: [
    ["Où sont hébergées les données ?", "Dans l'Union européenne. Les données de chaque entreprise sont isolées au niveau de la base de données elle-même."],
    ["Qui est responsable des données de mes clients ?", "Vous êtes responsable du traitement des données de vos clients ; Venio agit comme sous-traitant, pour votre compte uniquement. Vos clients ne sont jamais contactés par Venio pour autre chose que leur rendez-vous avec vous."],
    ["Les photos envoyées par les clients sont-elles protégées ?", "Elles sont accessibles uniquement à votre entreprise, et les images sont ré-encodées pour supprimer les métadonnées, dont la position GPS."],
  ] },
  { group: "Abonnement", items: [
    ["Y a-t-il un engagement ?", "Non. Vous pouvez changer d'offre ou résilier à tout moment ; la résiliation prend effet à la fin de la période payée."],
    ["Que deviennent mes rendez-vous si mon abonnement s'arrête ?", "Les rendez-vous déjà confirmés sont maintenus, avec leurs rappels. Seules les nouvelles réservations sont suspendues."],
  ] },
];

export default function FaqPage() {
  return (
    <>
      <PageHero eyebrow="FAQ" title="Questions fréquentes" />
      <div className="mx-auto max-w-3xl px-5 pb-24">
        {FAQ.map((g) => (
          <section key={g.group} className="mb-12">
            <h2 className="text-xl font-semibold text-ink">{g.group}</h2>
            <div className="mt-4 divide-y divide-line rounded-frame border border-line bg-surface">
              {g.items.map(([q, a]) => (
                <details key={q} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none font-medium text-ink [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start justify-between gap-4">{q}<span aria-hidden className="text-ink-subtle transition-transform group-open:rotate-45">+</span></span>
                  </summary>
                  <p className="mt-3 text-ink-muted">{a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
        <p className="text-ink-muted">Une autre question ? <Link className="font-medium text-signal-strong underline" href="/demo">Essayez la démonstration</Link> ou <Link className="font-medium text-signal-strong underline" href="/inscription">créez un espace d&apos;essai</Link>.</p>
      </div>
    </>
  );
}
