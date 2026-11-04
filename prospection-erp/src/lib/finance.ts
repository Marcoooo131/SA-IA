// Calculateur de rentabilité commerciale (section F).
// Distinction stricte : chiffre d'affaires (ce qui est facturé) ≠ marge brute (après coûts de service)
// ≠ résultat (après coûts d'acquisition et coûts fixes de prospection).

export const SCENARIOS_CLIENTS = [10, 25, 50, 100, 250, 500] as const;

export interface Hypotheses {
  prixMensuelHT: number;
  margeBrutePct: number;
  churnMensuelPct: number;
  /** Durée de rétention imposée (mois) ; 0 = déduite de l'attrition. */
  dureeRetentionMois: number;
  /** Coût d'acquisition par client (CAC) en € HT. */
  cac: number;
  /** Coûts fixes de prospection par mois (outils, abonnements…). */
  coutsFixesMensuels: number;
  /** Durée d'analyse en mois. */
  horizonMois: number;
  /** Taux de conversion global prospect contacté → client (%) ; 0 = non renseigné. */
  tauxConversionPct: number;
}

/** Durée de vie moyenne d'un client en mois (1 / attrition), ou la rétention imposée. */
export function dureeVieMois(h: Pick<Hypotheses, 'dureeRetentionMois' | 'churnMensuelPct'>): number {
  if (h.dureeRetentionMois > 0) return h.dureeRetentionMois;
  if (h.churnMensuelPct > 0) return 100 / h.churnMensuelPct;
  return Infinity;
}

export const margeMensuelleParClient = (h: Pick<Hypotheses, 'prixMensuelHT' | 'margeBrutePct'>) => (h.prixMensuelHT * h.margeBrutePct) / 100;

/** Délai de récupération du CAC, en mois de marge brute. */
export function delaiRecuperationMois(cac: number, h: Pick<Hypotheses, 'prixMensuelHT' | 'margeBrutePct'>): number {
  const m = margeMensuelleParClient(h);
  if (cac <= 0) return 0;
  return m > 0 ? cac / m : Infinity;
}

/** Part des clients encore abonnés après m mois. */
export function survie(m: number, h: Pick<Hypotheses, 'dureeRetentionMois' | 'churnMensuelPct'>): number {
  if (h.dureeRetentionMois > 0) return m < h.dureeRetentionMois ? 1 : 0;
  return Math.pow(1 - Math.min(100, Math.max(0, h.churnMensuelPct)) / 100, m);
}

export interface Scenario {
  clients: number;
  mrr: number;
  arr: number;
  /** Prospects à contacter pour obtenir ces clients (si un taux de conversion est connu). */
  contactsNecessaires?: number;
  coutAcquisition: number;
  coutsFixes: number;
  chiffreAffaires: number;
  margeBrute: number;
  /** Résultat contributif = marge brute − acquisition − coûts fixes de prospection (avant autres charges de l'entreprise). */
  resultat: number;
  clientsRestants: number;
  mrrFin: number;
  /** Valeur vie client en CA et en marge (sur la durée de vie, sans limite d'horizon). */
  ltvCA: number;
  ltvMarge: number;
  ratioLtvCac: number;
  delaiRecuperation: number;
  /** Premier mois où le cumul de marge couvre l'acquisition et les coûts fixes ; undefined si jamais dans l'horizon. */
  moisEquilibre?: number;
}

/**
 * Cohorte de N clients acquis au mois 0, facturés en début de mois, qui résilient selon l'attrition.
 */
export function simuler(clients: number, h: Hypotheses): Scenario {
  const H = Math.max(1, Math.round(h.horizonMois));
  const marge = h.margeBrutePct / 100;
  const coutAcquisition = clients * h.cac;
  let ca = 0;
  let moisEquilibre: number | undefined;
  for (let m = 0; m < H; m++) {
    ca += clients * survie(m, h) * h.prixMensuelHT;
    if (moisEquilibre === undefined && ca * marge >= coutAcquisition + h.coutsFixesMensuels * (m + 1)) moisEquilibre = m + 1;
  }
  const vie = dureeVieMois(h);
  const ltvCA = Number.isFinite(vie) ? h.prixMensuelHT * vie : Infinity;
  const ltvMarge = ltvCA * marge;
  const coutsFixes = h.coutsFixesMensuels * H;
  const clientsRestants = clients * survie(H, h);
  return {
    clients,
    mrr: clients * h.prixMensuelHT,
    arr: clients * h.prixMensuelHT * 12,
    contactsNecessaires: h.tauxConversionPct > 0 ? Math.ceil(clients / (h.tauxConversionPct / 100)) : undefined,
    coutAcquisition,
    coutsFixes,
    chiffreAffaires: ca,
    margeBrute: ca * marge,
    resultat: ca * marge - coutAcquisition - coutsFixes,
    clientsRestants,
    mrrFin: clientsRestants * h.prixMensuelHT,
    ltvCA,
    ltvMarge,
    ratioLtvCac: h.cac > 0 ? ltvMarge / h.cac : Infinity,
    delaiRecuperation: delaiRecuperationMois(h.cac, h),
    moisEquilibre,
  };
}

export const simulerScenarios = (h: Hypotheses) => SCENARIOS_CLIENTS.map((n) => simuler(n, h));

/** CAC maximal pour récupérer l'acquisition en `moisCible` mois de marge. */
export const cacMaximal = (moisCible: number, h: Pick<Hypotheses, 'prixMensuelHT' | 'margeBrutePct'>) => moisCible * margeMensuelleParClient(h);

export const eur = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: dec, minimumFractionDigits: dec }) : '∞';
export const pct = (v: number, dec = 1) => (Number.isFinite(v) ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: dec })} %` : '—');
export const mois = (v: number) => (Number.isFinite(v) ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois` : 'jamais');
