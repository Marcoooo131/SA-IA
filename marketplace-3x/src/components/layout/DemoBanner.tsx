import { paymentProviderInfo } from "@/server/payments/info";

/** Bandeau permanent tant que le bac à sable de paiement est actif. */
export function DemoBanner() {
  const info = paymentProviderInfo();
  if (!info.sandbox) return null;
  return (
    <div className="bg-ink px-4 py-1.5 text-center text-xs text-white/85">
      <strong className="text-white">Environnement de démonstration</strong> — {info.label}. Données fictives, aucun paiement réel.
    </div>
  );
}
