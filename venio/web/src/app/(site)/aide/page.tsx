import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site/SiteChrome";
import { Alert } from "@/components/ui";

export const metadata: Metadata = {
  title: "Aide",
  description: "Démarrer en 10 minutes, partager votre lien de réservation, renvoyer vos appels sans réponse : le guide pas à pas.",
};

const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="mt-4 space-y-3">
    {items.map((t, i) => (
      <li key={i} className="flex gap-3">
        <span className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{i + 1}</span>
        <span className="pt-0.5 text-ink">{t}</span>
      </li>
    ))}
  </ol>
);

const Code = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.95em] text-ink">{children}</code>;

export default function HelpPage() {
  return (
    <>
      <PageHero eyebrow="Aide" title="Bien démarrer avec Venio." intro="Trois étapes, une dizaine de minutes, puis votre page de réservation travaille pour vous." />

      <Section eyebrow="1" title="Préparer votre espace (5 minutes)">
        <Steps items={[
          <>Dans <strong>Paramètres → Page publique</strong> : votre accroche, vos coordonnées, votre zone d&apos;intervention (codes postaux) et vos couleurs.</>,
          <>Dans <strong>Paramètres → Horaires</strong> : vos jours et heures de rendez-vous. Ajoutez vos congés et chantiers bloquants dans <strong>Absences</strong>.</>,
          <>Dans <strong>Paramètres → Prestations</strong> : durée de la visite technique, temps de trajet entre deux rendez-vous, délai minimum avant un rendez-vous.</>,
          <>Dans <strong>Parcours</strong> : relisez les questions posées à vos clients ; modifiez les textes si besoin, puis <strong>Publier</strong>.</>,
          <>Testez votre page vous-même avec le lien <strong>Ma page de réservation</strong>, en bas du menu.</>,
        ]} />
      </Section>

      <Section tone="surface" eyebrow="2" title="Partager votre lien de réservation">
        <p className="max-w-2xl text-ink-muted">Le lien est affiché sur votre tableau de bord (bouton « Copier mon lien de réservation »). Plus il est visible, plus vos clients réservent seuls.</p>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ["Fiche Google de votre entreprise", "Ajoutez-le comme lien « Prendre rendez-vous » ou « Site web »."],
            ["Signature de vos emails et devis", "« Prenez rendez-vous en ligne : » suivi du lien."],
            ["Message de votre répondeur", "« Décrivez votre projet et réservez sur … » (le lien court est plus facile à dicter)."],
            ["Réseaux sociaux, site, panneau de chantier", "Le lien, ou un QR code qui pointe vers lui."],
          ].map(([t, d]) => <li key={t} className="rounded-card border border-line bg-paper p-4"><p className="font-semibold text-ink">{t}</p><p className="mt-1 text-sm text-ink-muted">{d}</p></li>)}
        </ul>
      </Section>

      <Section eyebrow="3" title="Récupérer vos appels manqués (pilote)">
        <Alert kind="info" title="Fonction en version pilote">Le numéro vers lequel renvoyer vos appels vous est communiqué à l&apos;activation de votre pilote. Avant cela, vous pouvez essayer le fonctionnement avec la ligne de test, dans <strong>Appels manqués</strong> (aucun SMS n&apos;est envoyé).</Alert>
        <h3 className="mt-8 text-lg font-semibold text-ink">Sur un téléphone mobile</h3>
        <p className="mt-2 max-w-2xl text-ink-muted">Le « renvoi d&apos;appel sur non-réponse » se programme avec un code tapé comme un numéro de téléphone. Ces codes sont communs aux opérateurs mobiles (Orange, SFR, Bouygues Telecom, Free Mobile et la plupart des opérateurs virtuels).</p>
        <Steps items={[
          <>Activer : composez <Code>**61*NUMÉRO#</Code> puis appel (remplacez NUMÉRO par le numéro reçu à l&apos;activation, sans espaces).</>,
          <>Choisir le délai avant renvoi (ici 20 secondes, de 5 à 30) : <Code>**61*NUMÉRO**20#</Code>.</>,
          <>Vérifier : <Code>*#61#</Code> affiche le renvoi en place.</>,
          <>Désactiver à tout moment : <Code>##61#</Code>.</>,
        ]} />
        <p className="mt-4 text-sm text-ink-muted">Vous pouvez aussi passer par les réglages de votre téléphone (Téléphone → Renvoi d&apos;appel, parfois appelé « Transfert d&apos;appel » → « Si pas de réponse ») ou par l&apos;espace client de votre opérateur.</p>
        <h3 className="mt-8 text-lg font-semibold text-ink">Sur une ligne fixe ou une box</h3>
        <p className="mt-2 max-w-2xl text-ink-muted">Le renvoi sur non-réponse se règle dans l&apos;espace client de votre opérateur (rubrique téléphonie de la box) ou dans votre standard téléphonique. Nous le faisons avec vous lors de l&apos;activation du pilote.</p>
        <h3 className="mt-8 text-lg font-semibold text-ink">Ce que reçoit votre client</h3>
        <p className="mt-2 max-w-2xl text-ink-muted">Un seul SMS, à votre nom, en journée : il peut décrire son projet et réserver, signaler qu&apos;il a déjà un rendez-vous, ou demander à être rappelé. Les demandes de rappel apparaissent dans <strong>Appels manqués</strong> et vous sont envoyées par email.</p>
      </Section>

      <Section tone="surface" eyebrow="Besoin d'aide ?" title="Une question, un blocage ?">
        <p className="max-w-2xl text-ink-muted">Pendant le pilote, vous avez un contact direct avec l&apos;équipe Venio. Consultez aussi les <Link href="/faq" className="font-medium text-signal-strong underline underline-offset-2">questions fréquentes</Link>.</p>
      </Section>
    </>
  );
}
