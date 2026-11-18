import { Car, Hammer, KeyRound, Sparkles, Truck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/SiteChrome";
import { buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = {
  title: "Secteurs d'activité",
  description: "Des parcours de réservation prêts à l'emploi pour les artisans, garages, agences immobilières, déménageurs, indépendants et entreprises de services.",
};

// Les questions et prestations ci-dessous sont celles des modèles métier réellement livrés
// (backend : venio/flows/templates.py). Aucun secteur n'est présenté sans modèle existant.
type Sector = { id: string; Icon: LucideIcon; name: string; who: string; questions: string[]; appointments: string; case: string };

const SECTORS: Sector[] = [
  {
    id: "artisans", Icon: Hammer, name: "Artisans du bâtiment et de la rénovation",
    who: "Salle de bain, cuisine, menuiseries, isolation, rénovation.",
    questions: ["Quel est votre projet ?", "Quels travaux envisagez-vous ?", "Quelle est la surface approximative concernée ?", "Il s'agit d'une maison, d'un appartement, d'un local ?", "Le bâtiment a-t-il plus de 2 ans ?", "Quand souhaitez-vous réaliser les travaux ?", "Avez-vous des photos ?"],
    appointments: "Visite technique et devis sur place ; appel découverte si le client « se renseigne ».",
    case: "Les visites techniques ne sont fixées qu'avec des projets décrits, photos à l'appui, dans votre zone d'intervention.",
  },
  {
    id: "garages", Icon: Car, name: "Garages et ateliers automobiles",
    who: "Entretien, diagnostic de panne, pneus, freins, climatisation, carrosserie.",
    questions: ["De quoi votre véhicule a-t-il besoin ?", "Décrivez ce que vous constatez (en cas de panne)", "Le véhicule peut-il rouler jusqu'au garage ?", "Quel est votre véhicule ?", "Kilométrage approximatif", "Pour quand ?"],
    appointments: "Rendez-vous atelier ; diagnostic en cas de panne ; appel conseil si le véhicule ne roule pas.",
    case: "L'atelier sait avant l'arrivée du véhicule s'il faut prévoir un diagnostic, et les véhicules immobilisés sont traités par téléphone.",
  },
  {
    id: "immobilier", Icon: KeyRound, name: "Agences immobilières",
    who: "Vente, mise en location, recherche d'un bien.",
    questions: ["Quel est votre projet ? (vendre, louer, acheter…)", "De quel type de bien s'agit-il ?", "Quelle est sa surface ?", "Combien de pièces ?", "Décrivez le bien recherché (achat, location)", "Dans quel délai ?"],
    appointments: "Estimation sur place pour une vente ou une mise en location ; rendez-vous en agence pour un achat ; appel si le projet est lointain.",
    case: "Les demandes d'estimation arrivent avec le type de bien et sa surface : le conseiller prépare ses références avant la visite.",
  },
  {
    id: "demenagement", Icon: Truck, name: "Déménagement et services à domicile",
    who: "Déménageurs, et plus largement les services qui interviennent chez le client.",
    questions: ["Vous déménagez votre logement ou des locaux ?", "Quel est le logement de départ ?", "Surface, étage, ascenseur", "Où déménagez-vous ?", "À quelle date ? Est-elle flexible ?", "Services complémentaires (emballage, garde-meuble, piano…)"],
    appointments: "Visite d'estimation du volume ; estimation en visio pour les petits logements.",
    case: "Les petits volumes sont estimés en visio, les grands en visite : chaque déplacement compte.",
  },
  {
    id: "independants", Icon: Sparkles, name: "Indépendants et entreprises de services",
    who: "Consultants, cabinets, prestataires : toute activité qui commence par un premier rendez-vous.",
    questions: ["Quel est l'objet de votre demande ?", "Décrivez votre besoin en quelques mots", "Dans quel délai ?", "Documents utiles (facultatif)"],
    appointments: "Premier rendez-vous ; appel pour le suivi d'une demande en cours.",
    case: "Un parcours simple, que vous adaptez à votre métier : questions, conditions et prestations sont modifiables.",
  },
];

export default function SectorsPage() {
  return (
    <>
      <PageHero eyebrow="Secteurs" title="Un parcours qui parle votre métier."
        intro="Chaque entreprise part d'un modèle prêt à l'emploi. Vous changez les questions, les conditions et les prestations proposées sans rien coder.">
        <nav aria-label="Secteurs" className="flex flex-wrap gap-2 text-sm">
          {SECTORS.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-ink-muted hover:text-ink">{s.name}</a>)}
        </nav>
      </PageHero>
      {SECTORS.map(({ id, Icon, name, who, questions, appointments, case: example }, i) => (
        <section key={id} id={id} className={cx("scroll-mt-20", i % 2 === 0 && "border-y border-line bg-surface")}>
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <Icon aria-hidden className="h-8 w-8 text-signal-strong" strokeWidth={1.5} />
              <h2 className="mt-4 font-display text-3xl font-semibold text-ink md:text-4xl">{name}</h2>
              <p className="mt-3 text-ink-muted">{who}</p>
              <p className="mt-6 font-semibold text-ink">Rendez-vous proposés</p>
              <p className="mt-1 text-ink-muted">{appointments}</p>
              <p className="mt-6 border-l-2 border-signal pl-4 text-ink">{example}</p>
            </div>
            <div className="rounded-frame border border-line bg-paper p-6">
              <p className="text-sm font-semibold text-ink">Exemple de parcours (modèle livré)</p>
              <ol className="mt-4 space-y-3">
                {questions.map((q, n) => (
                  <li key={q} className="flex gap-3">
                    <span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong text-xs text-ink-muted">{n + 1}</span>
                    <span className="text-ink">{q}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs text-ink-subtle">Puis : choix du créneau, coordonnées, confirmation.</p>
            </div>
          </div>
        </section>
      ))}
      <div className="mx-auto max-w-6xl px-5 py-20 text-center">
        <h2 className="font-display text-4xl font-semibold text-ink">Votre métier n&apos;est pas dans la liste ?</h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-muted">Le modèle générique s&apos;adapte à toute activité qui commence par un premier rendez-vous.</p>
        <Link href="/inscription" className={cx(buttonClass("primary", "lg"), "mt-8")}>Créer ma page de réservation</Link>
      </div>
    </>
  );
}
