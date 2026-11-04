// Recherche d'entreprises via les données publiques (section C.1) :
// API « Recherche d'entreprises » de l'État (https://recherche-entreprises.api.gouv.fr), gratuite et sans clé.
import type { Prospect } from './types';
import { METIERS, TAILLES, metierDepuisNaf, creeDepuisMoinsDe, type FiltreCreation } from './referentiel';
import type { Metier, Taille } from './types';

export const API_URL = 'https://recherche-entreprises.api.gouv.fr/search';
export const PAR_PAGE = 25;

export interface CriteresRecherche {
  metiers: Metier[];
  tailles: Taille[];
  departement?: string;
  codePostal?: string;
  motCle?: string;
  creation?: FiltreCreation;
}

export function construireUrl(c: CriteresRecherche, page = 1): string {
  const u = new URLSearchParams();
  if (c.motCle?.trim()) u.set('q', c.motCle.trim());
  const naf = METIERS.filter((m) => c.metiers.includes(m.id)).flatMap((m) => m.naf);
  if (naf.length) u.set('activite_principale', naf.join(','));
  const tranches = TAILLES.filter((t) => c.tailles.includes(t.id)).flatMap((t) => t.tranches);
  if (tranches.length) u.set('tranche_effectif_salarie', tranches.join(','));
  if (c.departement?.trim()) u.set('departement', c.departement.trim());
  if (c.codePostal?.trim()) u.set('code_postal', c.codePostal.trim());
  u.set('etat_administratif', 'A');
  u.set('page', String(page));
  u.set('per_page', String(PAR_PAGE));
  return `${API_URL}?${u.toString()}`;
}

/** Sous-ensemble utile de la réponse de l'API (les champs absents restent inconnus). */
export interface ResultatApi {
  siren: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  activite_principale?: string;
  libelle_activite_principale?: string;
  tranche_effectif_salarie?: string | null;
  date_creation?: string | null;
  etat_administratif?: string;
  nombre_etablissements_ouverts?: number;
  complements?: { est_entrepreneur_individuel?: boolean };
  siege?: { code_postal?: string; libelle_commune?: string; departement?: string; tranche_effectif_salarie?: string | null };
  dirigeants?: { type_dirigeant?: string; nom?: string; prenoms?: string; qualite?: string; denomination?: string }[];
}

const premierPrenom = (p?: string) => p?.trim().split(/\s+/)[0];
const capitaliser = (s?: string) =>
  s ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : undefined;

/** Convertit un résultat de l'API en prospect ; seules les données réellement fournies sont reprises. */
export function versProspect(r: ResultatApi, nowIso: string): Omit<Prospect, 'id'> {
  const pp = r.dirigeants?.find((d) => d.type_dirigeant === 'personne physique' && d.nom);
  const ei = r.complements?.est_entrepreneur_individuel;
  const tranche = r.tranche_effectif_salarie ?? r.siege?.tranche_effectif_salarie ?? undefined;
  const sources: Prospect['sources'] = { identite: 'api_entreprises' };
  if (pp) sources.dirigeant = 'api_entreprises';
  return {
    siren: r.siren,
    nom: r.nom_raison_sociale || r.nom_complet || r.siren,
    naf: r.activite_principale,
    nafLibelle: r.libelle_activite_principale,
    metier: metierDepuisNaf(r.activite_principale),
    trancheEffectif: tranche || undefined,
    dateCreation: r.date_creation || undefined,
    active: r.etat_administratif ? r.etat_administratif === 'A' : undefined,
    codePostal: r.siege?.code_postal,
    commune: r.siege?.libelle_commune,
    departement: r.siege?.departement ?? r.siege?.code_postal?.slice(0, 2),
    entrepreneurIndividuel: ei,
    dirigeant: pp
      ? { prenom: capitaliser(premierPrenom(pp.prenoms)), nom: capitaliser(pp.nom), qualite: pp.qualite ?? (ei ? 'Entrepreneur individuel' : undefined) }
      : undefined,
    logicielActuel: 'inconnu',
    activiteVerifiee: false,
    signauxActivite: (r.nombre_etablissements_ouverts ?? 0) > 1 ? ['nouvel_etablissement'] : [],
    signauxInteret: [],
    sources,
    statut: 'a_qualifier',
    creeLe: nowIso,
    majLe: nowIso,
  };
}

export interface PageResultats { resultats: ResultatApi[]; total: number; pages: number }

export async function rechercherPage(c: CriteresRecherche, page: number, f: typeof fetch = fetch): Promise<PageResultats> {
  const res = await f(construireUrl(c, page), { headers: { Accept: 'application/json' } });
  if (res.status === 429) throw new Error('Trop de requêtes vers l\'API publique : patientez quelques secondes.');
  if (!res.ok) throw new Error(`L'API Recherche d'entreprises a répondu ${res.status}.`);
  const j = (await res.json()) as { results?: ResultatApi[]; total_results?: number; total_pages?: number };
  return { resultats: j.results ?? [], total: j.total_results ?? 0, pages: j.total_pages ?? 0 };
}

/**
 * Recherche sur plusieurs pages. L'API ne filtre pas par date de création : le filtre « créée depuis
 * moins de… » est appliqué ici, sur les pages parcourues (dans la limite de `maxPages`).
 */
export async function rechercher(
  c: CriteresRecherche, maxPages: number, now: Date, f: typeof fetch = fetch, onProgres?: (page: number, pages: number) => void,
): Promise<{ resultats: ResultatApi[]; total: number; pagesLues: number; pagesTotal: number }> {
  const out: ResultatApi[] = [];
  let pagesTotal = 1;
  let total = 0;
  let page = 1;
  for (; page <= Math.min(maxPages, pagesTotal || 1); page++) {
    const r = await rechercherPage(c, page, f);
    pagesTotal = r.pages;
    total = r.total;
    onProgres?.(page, Math.min(maxPages, pagesTotal));
    out.push(...r.resultats.filter((x) => !c.creation || creeDepuisMoinsDe(x.date_creation ?? undefined, c.creation, now)));
    if (page < Math.min(maxPages, pagesTotal)) await new Promise((ok) => setTimeout(ok, 180)); // ≤ 7 requêtes / s
  }
  return { resultats: out, total, pagesLues: page - 1, pagesTotal };
}
