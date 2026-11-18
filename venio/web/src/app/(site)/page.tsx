import { ArrowRight, BellRing, CalendarCheck, Car, Hammer, KeyRound, MessageSquareText, PhoneMissed, Sparkles, Truck } from "lucide-react";
import Link from "next/link";
import { Capture, Section } from "@/components/site/SiteChrome";
import { Badge, BrowserFrame, PhoneFrame, buttonClass } from "@/components/ui";

const PILLARS = [
  { Icon: PhoneMissed, title: "Ne plus perdre de prospects", text: "Un appel sans réponse devient une demande de rendez-vous : l'appelant reçoit un SMS avec le lien de votre parcours.", tag: "En version pilote" },
  { Icon: CalendarCheck, title: "Simplifier la prise de rendez-vous", text: "Votre client décrit son besoin en deux minutes, une question à la fois, et choisit un créneau réellement libre." },
  { Icon: BellRing, title: "Automatiser le suivi", text: "Confirmation, rappel la veille, lien pour reporter ou annuler : sans que vous ayez à relancer qui que ce soit." },
];

const SECTORS = [
  { Icon: Hammer, label: "Artisans du bâtiment", href: "/secteurs#artisans" },
  { Icon: Car, label: "Garages", href: "/secteurs#garages" },
  { Icon: KeyRound, label: "Immobilier", href: "/secteurs#immobilier" },
  { Icon: Truck, label: "Déménagement", href: "/secteurs#demenagement" },
  { Icon: Sparkles, label: "Indépendants et services", href: "/secteurs#independants" },
];

export default function Home() {
  return (
    <>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:pt-20 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />Prise de rendez-vous qualifiés pour les entreprises de terrain
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.04] text-ink md:text-6xl">
            Chaque appel, chaque visite, une opportunité de rendez-vous.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-muted md:text-xl">
            Vos clients décrivent leur besoin et réservent en ligne, même quand vous ne pouvez pas décrocher.
            Vous arrivez au rendez-vous avec un dossier complet.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/demo" className={buttonClass("primary", "lg")}>Essayer la démo<ArrowRight aria-hidden className="h-4 w-4" /></Link>
            <Link href="/inscription" className={buttonClass("secondary", "lg")}>Essai gratuit 14 jours</Link>
          </div>
          <p className="mt-5 text-sm text-ink-subtle">Sans carte bancaire pour l&apos;essai. Sans engagement ensuite.</p>
        </div>
        <div className="relative md:pb-24 md:pr-24">
          <BrowserFrame url="venio — appels manqués" className="hidden md:block">
            <Capture src="app-appels.jpg" alt="Espace entreprise Venio : appels manqués, SMS envoyés et rendez-vous récupérés (données de démonstration)" width={1280} height={800} />
          </BrowserFrame>
          <div className="md:absolute md:bottom-0 md:right-0">
            <PhoneFrame size="sm" label="Parcours de réservation sur mobile">
              <Capture src="mobile-parcours.jpg" alt="Parcours de réservation Venio sur téléphone : une question à la fois (données de démonstration)" width={390} height={844} />
            </PhoneFrame>
          </div>
        </div>
      </div>

      <Section tone="surface" eyebrow="Trois promesses" title="Moins d'appels perdus, moins de relances, des rendez-vous mieux préparés.">
        <ol className="relative grid gap-10 md:grid-cols-3">
          <span aria-hidden className="absolute left-6 right-[calc(33%-1.5rem)] top-6 hidden h-px bg-line-strong md:block" />
          {PILLARS.map(({ Icon, title, text, tag }, i) => (
            <li key={title} className="relative">
              <span className={`relative grid h-12 w-12 place-items-center rounded-full border-2 bg-surface ${i === 0 ? "border-signal text-signal-strong" : "border-ink text-ink"}`}>
                <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-6 text-xl font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-ink-muted">{text}</p>
              {tag && <p className="mt-3"><Badge tone="accent">{tag}</Badge></p>}
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Récupération des appels manqués" title="Vous êtes sur un chantier, le téléphone sonne. Le prospect, lui, ne rappellera peut-être pas."
        intro="Venio repère l'appel sans réponse, attend quelques instants pour être sûr qu'il n'a pas été pris, puis envoie un SMS court avec le lien de votre parcours. Le prospect décrit son besoin et réserve ; vous voyez le rendez-vous apparaître, rattaché à l'appel.">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
          <ol className="space-y-6">
            {[
              ["Un appel n'est pas pris", "Votre ligne renvoie les appels sans réponse vers Venio : aucune application à installer, vous gardez votre numéro."],
              ["Un SMS part, au bon moment", "Jamais la nuit, jamais deux fois pour des appels rapprochés, jamais vers un numéro masqué ou exclu."],
              ["Le prospect réserve seul", "Il décrit son besoin, ajoute des photos et choisit un créneau libre dans votre agenda."],
              ["Vous mesurez ce qui est récupéré", "Appels manqués, SMS, liens ouverts, rendez-vous obtenus : des chiffres réels, pas des estimations."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{i + 1}</span>
                <div><p className="font-semibold text-ink">{t}</p><p className="mt-1 text-ink-muted">{d}</p></div>
              </li>
            ))}
          </ol>
          <BrowserFrame url="venio — réglages des SMS">
            <Capture src="app-reglages-sms.jpg" alt="Réglages de la récupération des appels manqués : modèle de SMS, nombre de SMS facturés, horaires (données de démonstration)" width={1280} height={800} />
          </BrowserFrame>
        </div>
        <p className="mt-8 text-sm text-ink-subtle">
          Module en version pilote : l&apos;envoi réel de SMS est activé avec chaque entreprise pilote, après branchement de sa ligne.
        </p>
      </Section>

      <Section tone="surface" eyebrow="Des parcours par métier" title="Les bonnes questions, posées avant le rendez-vous."
        intro="Chaque métier part d'un modèle prêt à l'emploi, entièrement modifiable : questions, conditions, prestations proposées selon les réponses.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SECTORS.map(({ Icon, label, href }) => (
            <li key={href}>
              <Link href={href} className="flex h-full flex-col gap-4 rounded-card border border-line bg-paper p-5 transition-colors hover:border-ink/40">
                <Icon aria-hidden className="h-6 w-6 text-ink" strokeWidth={1.5} />
                <span className="font-medium text-ink">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Dans l'espace entreprise" title="Un dossier complet à chaque demande.">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <BrowserFrame url="venio — dossier client">
            <Capture src="app-dossier.jpg" alt="Dossier d'une demande dans Venio : réponses, photos, rendez-vous et historique (données de démonstration)" width={1280} height={800} />
          </BrowserFrame>
          <ul className="space-y-5">
            {[
              [MessageSquareText, "Le besoin, structuré", "Les réponses du client, un résumé, ses photos et son adresse vérifiée."],
              [CalendarCheck, "Le bon rendez-vous", "Visite, appel ou visio selon les réponses ; des créneaux calculés sur vos horaires et vos trajets."],
              [BellRing, "Le suivi sans effort", "Confirmation et rappel automatiques, report et annulation en un clic pour le client."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof CalendarCheck;
              return <li key={t as string} className="flex gap-4"><I aria-hidden className="mt-1 h-5 w-5 shrink-0 text-signal-strong" strokeWidth={1.75} /><div><p className="font-semibold text-ink">{t as string}</p><p className="mt-1 text-ink-muted">{d as string}</p></div></li>;
            })}
          </ul>
        </div>
      </Section>

      <Section tone="ink" eyebrow="Essayer" title="Voyez le parcours complet en deux minutes."
        intro="La démonstration simule un appel manqué, le SMS, la réservation par le prospect et son arrivée dans l'espace entreprise. Données fictives, rien n'est envoyé.">
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className={buttonClass("accent", "lg")}>Lancer la démonstration<ArrowRight aria-hidden className="h-4 w-4" /></Link>
          <Link href="/tarifs" className="inline-flex h-12 items-center rounded-control border border-white/30 px-5 font-medium text-white transition-colors hover:bg-white/10">Voir les tarifs</Link>
        </div>
      </Section>
    </>
  );
}
