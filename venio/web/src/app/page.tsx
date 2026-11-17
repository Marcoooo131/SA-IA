import Link from "next/link";
import { Logo } from "@/components/ui";

const steps = [
  { t: "Votre client décrit son besoin", d: "Une question à la fois, avec des choix visuels, des photos et sans compte à créer." },
  { t: "Il réserve un créneau réellement libre", d: "Le rendez-vous adapté (visite, appel, visio) selon ses réponses, synchronisé avec vos horaires." },
  { t: "Vous arrivez préparé", d: "Un dossier complet : besoin, photos, adresse, délai. Rappels automatiques pour éviter les oublis." },
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/connexion" className="rounded-lg px-3 py-2 hover:bg-ink/5">Se connecter</Link>
          <Link href="/inscription" className="rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-ink-soft">Essai gratuit</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:pt-20">
        <p className="mb-4 inline-block rounded-full bg-accent/15 px-3 py-1 text-sm font-medium text-accent-dark">Version pilote</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          Chaque demande arrive complète.<br />Chaque rendez-vous est confirmé.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-soft">
          Venio transforme les visiteurs de votre site en rendez-vous qualifiés : vos clients décrivent leur projet en
          deux minutes, choisissent un créneau, et vous recevez un dossier prêt à traiter.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/inscription" className="rounded-lg bg-ink px-5 py-3 font-medium text-white hover:bg-ink-soft">Créer ma page de réservation</Link>
          <a href="#comment" className="rounded-lg border border-line bg-white px-5 py-3 font-medium hover:border-ink/40">Comment ça marche</a>
        </div>
        <p className="mt-4 text-sm text-ink-soft">14 jours d&apos;essai, sans carte bancaire. Modèles prêts pour la rénovation et le déménagement, adaptables à toute activité.</p>
      </section>

      <section id="comment" className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.t}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-ink font-semibold text-accent">{i + 1}</span>
              <h2 className="mt-4 text-lg font-semibold">{s.t}</h2>
              <p className="mt-2 text-ink-soft">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-ink-soft">© Venio — données hébergées dans l&apos;Union européenne.</footer>
    </main>
  );
}
