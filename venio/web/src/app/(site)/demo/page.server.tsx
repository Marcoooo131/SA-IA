import type { Metadata } from "next";
import { PageHero } from "@/components/site/SiteChrome";
import { InteractiveDemo } from "@/components/site/InteractiveDemo";

export const metadata: Metadata = {
  title: "Démonstration interactive",
  description: "Simulez un appel manqué, recevez le SMS, réservez comme un prospect et voyez la demande arriver dans l'espace entreprise. Données fictives, aucun envoi.",
};

export default function DemoPage() {
  return (
    <>
      <PageHero eyebrow="Démonstration" title="De l'appel manqué au rendez-vous, en deux minutes."
        intro="Le vrai produit, sur une entreprise fictive créée pour vous. Aucun SMS ni email n'est envoyé ; tout est effacé automatiquement." />
      <div className="mx-auto max-w-6xl px-5 pb-24"><InteractiveDemo /></div>
    </>
  );
}
