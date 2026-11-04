/** Utilitaires monétaires : toujours des centimes entiers. */

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "12,50" | "12.5" | "12" → 1250. Lève une erreur si invalide. */
export function parseEurosToCents(input: string | number): number {
  const s = String(input).trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Montant invalide");
  const [int, dec = ""] = s.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

/** Pourcentage d'un montant en bps, arrondi au centime inférieur (en faveur du payeur). */
export function applyBps(cents: number, bps: number): number {
  return Math.floor((cents * bps) / 10000);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
