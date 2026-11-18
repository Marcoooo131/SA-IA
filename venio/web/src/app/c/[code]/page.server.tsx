import type { Metadata } from "next";
import { OpenRecoveryLink } from "@/components/OpenRecoveryLink";

// Lien court des SMS d'appels manqués : /c/<code> → page de réservation de l'entreprise.
// Résolu dans le navigateur (et non côté serveur) pour que la limite de fréquence s'applique à chaque visiteur.
export const metadata: Metadata = { title: "Prendre rendez-vous", robots: { index: false, follow: false } };

export default async function RecoveryLinkPage({ params }: { params: Promise<{ code: string }> }) {
  return <OpenRecoveryLink code={(await params).code} />;
}
