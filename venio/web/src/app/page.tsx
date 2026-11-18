import { CalendarCheck, ClipboardList, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { Logo, buttonClass } from "@/components/ui";
import { DEMO } from "@/lib/routes";

// Page d'accueil provisoire (version pilote). La vitrine complète est l'étape 5 de la feuille de route :
// on n'y annonce ici que ce qui est réellement disponible.
const steps = [
  { Icon: MessageSquareText, t: "Votre client décrit son besoin", d: "Une question à la fois, avec des choix visuels, des photos et sans compte à créer." },
  { Icon: CalendarCheck, t: "Il réserve un créneau réellement libre", d: "Le rendez-vous adapté (visite, appel, visio) selon ses réponses, dans vos horaires." },
  { Icon: ClipboardList, t: "Vous arrivez préparé", d: "Un dossier complet : besoin, photos, adresse, délai. Confirmation et rappel envoyés automatiquement." },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/connexion" className={buttonClass("ghost")}>Se connecter</Link>
          <Link href="/inscription" className={buttonClass("primary")}>Essai gratuit</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-24 pt-14 md:pt-24">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />{DEMO ? "Démonstration" : "Version pilote"}
        </p>
        <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.05] text-ink md:text-7xl">
          Chaque visite, une opportunité de rendez-vous.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-muted md:text-xl">
          Venio transforme les visiteurs de votre site en rendez-vous qualifiés : vos clients décrivent leur projet en
          deux minutes, choisissent un créneau, et vous recevez un dossier prêt à traiter.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/inscription" className={buttonClass("primary", "lg")}>Créer ma page de réservation</Link>
          <a href="#comment" className={buttonClass("secondary", "lg")}>Comment ça marche</a>
        </div>
        {DEMO && <p className="mt-5 max-w-2xl text-sm text-ink-muted">Démonstration : créez un espace fictif, ouvrez votre page de réservation dans un autre onglet comme si vous étiez un client, puis retrouvez la demande dans votre espace.</p>}
        <p className="mt-5 text-sm text-ink-subtle">14 jours d&apos;essai, sans carte bancaire. Modèles prêts pour la rénovation et le déménagement, adaptables à toute activité.</p>
      </section>

      <section id="comment" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <h2 className="font-display text-4xl font-semibold text-ink">Du premier contact au rendez-vous, sans relance.</h2>
          <ol className="relative mt-14 grid gap-10 md:grid-cols-3">
            {/* Le fil : relie les trois étapes, du signal au rendez-vous. */}
            <span aria-hidden className="absolute left-5 right-[calc(33%-1.25rem)] top-5 hidden h-px bg-line-strong md:block" />
            {steps.map(({ Icon, t, d }, i) => (
              <li key={t} className="relative">
                <span className={`relative grid h-10 w-10 place-items-center rounded-full border-2 bg-surface ${i === 0 ? "border-signal text-signal-strong" : "border-ink text-ink"}`}>
                  <Icon aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink">{t}</h3>
                <p className="mt-2 text-ink-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-10 text-sm text-ink-subtle">
          <Logo className="text-base" />
          <p>Données hébergées dans l&apos;Union européenne.</p>
        </div>
      </footer>
    </main>
  );
}
