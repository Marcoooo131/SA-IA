import type { Metadata } from "next";
import Link from "next/link";
import { Capture, PageHero } from "@/components/site/SiteChrome";
import { Badge, BrowserFrame, PhoneFrame, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = {
  title: "Fonctionnalités",
  description: "Récupération des appels manqués, parcours de réservation par métier, créneaux réels, rappels automatiques, dossier client et statistiques.",
};

type Feature = {
  id: string; title: string; what: string; benefit: string; example: string; tag?: string;
  capture: { src: string; alt: string; mobile?: boolean };
};

const FEATURES: Feature[] = [
  {
    id: "appels-manques", tag: "En version pilote", title: "Récupération des appels manqués",
    what: "Les appels sans réponse sont renvoyés vers Venio. Après un court délai de validation, un SMS d'un seul segment invite l'appelant à décrire son besoin et à réserver. Douze règles évitent les envois inutiles : numéro masqué, fixe ou étranger, appels rapprochés, horaires de nuit, numéro exclu ou en opposition, prospect déjà rappelé.",
    benefit: "Un appel manqué n'est plus un prospect perdu : il devient une demande, que vous retrouvez rattachée à l'appel.",
    example: "Un artisan sur un chantier ne décroche pas à 10 h 42. À 10 h 44, l'appelant reçoit le SMS ; à 10 h 50, il a réservé une visite technique pour jeudi.",
    capture: { src: "app-appels.jpg", alt: "Historique des appels manqués avec SMS, liens ouverts et rendez-vous récupérés (données de démonstration)" },
  },
  {
    id: "parcours", title: "Parcours de réservation par métier",
    what: "Une question à la fois, des choix visuels, des photos, des conditions : la suite du parcours et la prestation proposée dépendent des réponses. Le client peut revenir en arrière, s'interrompre et reprendre plus tard.",
    benefit: "Vous recevez des demandes complètes, et les rendez-vous inutiles sont orientés vers un simple appel.",
    example: "Pour un garage, « véhicule non roulant » oriente vers un appel conseil plutôt qu'un rendez-vous atelier.",
    capture: { src: "mobile-parcours.jpg", alt: "Parcours de réservation sur mobile (données de démonstration)", mobile: true },
  },
  {
    id: "creneaux", title: "Créneaux réellement libres",
    what: "Les créneaux tiennent compte des horaires de chaque collaborateur, des pauses, des jours fériés, des absences, du délai minimum et du temps de trajet entre deux rendez-vous. Deux clients ne peuvent jamais réserver le même créneau.",
    benefit: "Plus d'allers-retours pour trouver une date, plus de double réservation.",
    example: "Une visite de 1 h suivie de 30 min de trajet bloque 1 h 30 dans l'agenda du technicien.",
    capture: { src: "mobile-creneaux.jpg", alt: "Choix d'un créneau sur mobile (données de démonstration)", mobile: true },
  },
  {
    id: "dossier", title: "Dossier client complet",
    what: "Chaque demande arrive avec les réponses, un résumé, les photos sans métadonnées de localisation, l'adresse et les coordonnées. Notes internes, statuts, historique des envois.",
    benefit: "Vous arrivez préparé, et toute l'équipe a la même information.",
    example: "Avant une visite de salle de bain, vous connaissez la surface, les travaux envisagés, le délai et vous avez vu les photos.",
    capture: { src: "app-dossier.jpg", alt: "Dossier d'une demande (données de démonstration)" },
  },
  {
    id: "rappels", title: "Confirmations et rappels automatiques",
    what: "Email de confirmation avec fichier agenda, rappel la veille, lien personnel pour reporter ou annuler dans le délai que vous fixez. Rappels par SMS avec l'accord du client.",
    benefit: "Moins d'oublis et d'absences, sans relance manuelle.",
    example: "Le client reporte lui-même son rendez-vous de mardi à jeudi : l'agenda et vos notifications sont mis à jour.",
    capture: { src: "app-tableau.jpg", alt: "Tableau de bord de l'espace entreprise (données de démonstration)" },
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Fonctionnalités" title="Du premier contact au rendez-vous confirmé."
        intro="Chaque fonctionnalité répond à une perte concrète : un appel sans réponse, un formulaire incomplet, un aller-retour pour trouver une date, un rendez-vous oublié.">
        <nav aria-label="Sur cette page" className="flex flex-wrap gap-2 text-sm">
          {FEATURES.map((f) => <a key={f.id} href={`#${f.id}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-ink-muted hover:text-ink">{f.title}</a>)}
        </nav>
      </PageHero>
      {FEATURES.map((f, i) => (
        <section key={f.id} id={f.id} className={cx("scroll-mt-20", i % 2 === 0 && "border-y border-line bg-surface")}>
          <div className={cx("mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2", i % 2 === 1 && "lg:[&>*:first-child]:order-2")}>
            <div>
              {f.tag && <p className="mb-3"><Badge tone="accent">{f.tag}</Badge></p>}
              <h2 className="font-display text-4xl font-semibold text-ink">{f.title}</h2>
              <p className="mt-5 text-ink-muted">{f.what}</p>
              <p className="mt-5 border-l-2 border-signal pl-4 font-medium text-ink">{f.benefit}</p>
              <p className="mt-5 text-sm text-ink-muted"><span className="font-semibold text-ink">Exemple : </span>{f.example}</p>
            </div>
            {f.capture.mobile
              ? <PhoneFrame label={f.capture.alt} className="w-[280px]"><Capture src={f.capture.src} alt={f.capture.alt} width={390} height={844} /></PhoneFrame>
              : <BrowserFrame url={`venio — ${f.title.toLowerCase()}`}><Capture src={f.capture.src} alt={f.capture.alt} width={1280} height={800} /></BrowserFrame>}
          </div>
        </section>
      ))}
      <div className="mx-auto max-w-6xl px-5 py-20 text-center">
        <h2 className="font-display text-4xl font-semibold text-ink">Le plus simple, c&apos;est d&apos;essayer.</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/demo" className={buttonClass("primary", "lg")}>Lancer la démonstration</Link>
          <Link href="/inscription" className={buttonClass("secondary", "lg")}>Essai gratuit 14 jours</Link>
        </div>
      </div>
    </>
  );
}
