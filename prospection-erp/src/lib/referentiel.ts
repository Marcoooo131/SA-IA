// Référentiels : métiers ciblés ↔ codes NAF, tranches d'effectif INSEE ↔ tailles de la cible.
import type { Canal, Metier, Statut, Taille, SignalActivite, SignalInteret, LogicielActuel } from './types';

export interface MetierDef { id: Metier; libelle: string; pluriel: string; naf: string[] }

/** Métiers cœur de cible (section A) et codes NAF rév. 2 correspondants. */
export const METIERS: MetierDef[] = [
  { id: 'electricien', libelle: 'électricien', pluriel: 'Électriciens', naf: ['43.21A', '43.21B'] },
  { id: 'plombier', libelle: 'plombier', pluriel: 'Plombiers', naf: ['43.22A'] },
  { id: 'chauffagiste', libelle: 'chauffagiste', pluriel: 'Chauffagistes', naf: ['43.22B'] },
  { id: 'peintre', libelle: 'peintre', pluriel: 'Peintres', naf: ['43.34Z'] },
  { id: 'menuisier', libelle: 'menuisier', pluriel: 'Menuisiers', naf: ['43.32A', '43.32B', '16.23Z'] },
  { id: 'couvreur', libelle: 'couvreur', pluriel: 'Couvreurs / charpentiers', naf: ['43.91B', '43.91A'] },
  { id: 'macon', libelle: 'maçon', pluriel: 'Maçons', naf: ['43.99C', '41.20A'] },
  { id: 'carreleur', libelle: 'carreleur', pluriel: 'Carreleurs', naf: ['43.33Z'] },
  { id: 'plaquiste', libelle: 'plaquiste', pluriel: 'Plaquistes', naf: ['43.31Z'] },
  { id: 'renovation', libelle: 'entreprise de rénovation', pluriel: 'Rénovation / isolation', naf: ['43.39Z', '43.29A'] },
  { id: 'multiservices', libelle: 'entreprise multiservices', pluriel: 'Multiservices', naf: ['81.10Z', '43.99D'] },
];

export const METIERS_CIBLES = METIERS.map((m) => m.id);

export function metierDef(id: Metier): MetierDef | undefined {
  return METIERS.find((m) => m.id === id);
}

export function libelleMetier(id: Metier): string {
  if (id === 'autre_btp') return 'professionnel du bâtiment';
  if (id === 'hors_btp') return 'hors bâtiment';
  if (id === 'inconnu') return 'métier inconnu';
  return metierDef(id)?.libelle ?? id;
}

/** Déduit le métier d'un code NAF (« 43.21A », « 4321A » ou « 43.21a »). */
export function metierDepuisNaf(naf?: string): Metier {
  if (!naf) return 'inconnu';
  const n = naf.trim().toUpperCase().replace(/^(\d{2})\.?(\d{2})([A-Z])$/, '$1.$2$3');
  const m = METIERS.find((d) => d.naf.includes(n));
  if (m) return m.id;
  if (/^4[123]\./.test(n)) return 'autre_btp';
  return /^\d{2}\.\d{2}[A-Z]$/.test(n) ? 'hors_btp' : 'inconnu';
}

/** Tranches d'effectif salarié INSEE. */
export const TRANCHES: Record<string, string> = {
  NN: 'Non employeur', '00': '0 salarié', '01': '1 à 2 salariés', '02': '3 à 5 salariés', '03': '6 à 9 salariés',
  '11': '10 à 19 salariés', '12': '20 à 49 salariés', '21': '50 à 99 salariés', '22': '100 à 199 salariés',
  '31': '200 à 249 salariés', '32': '250 à 499 salariés', '41': '500 à 999 salariés', '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés', '52': '5 000 à 9 999 salariés', '53': '10 000 salariés et plus',
};

export const TAILLES: { id: Taille; libelle: string; tranches: string[] }[] = [
  { id: 'independant', libelle: 'Artisan indépendant / micro-entreprise', tranches: ['NN', '00'] },
  { id: '2-5', libelle: '2 à 5 salariés', tranches: ['01', '02'] },
  { id: '6-10', libelle: '6 à 10 salariés', tranches: ['03'] },
  { id: '11-20', libelle: '11 à 20 salariés', tranches: ['11'] },
];

export function libelleTaille(t: Taille): string {
  if (t === 'plus_de_20') return 'Plus de 20 salariés (hors cible)';
  if (t === 'inconnue') return 'Taille inconnue';
  return TAILLES.find((x) => x.id === t)!.libelle;
}

/**
 * Taille de la cible : l'effectif saisi à la main prime ; sinon la tranche INSEE.
 * Les tranches INSEE ne coïncident pas exactement avec la cible (1-2, 3-5, 6-9, 10-19) :
 * l'approximation est assumée et signalée dans le scoring.
 */
export function tailleProspect(p: { effectifSaisi?: number; trancheEffectif?: string; entrepreneurIndividuel?: boolean }): Taille {
  if (typeof p.effectifSaisi === 'number' && p.effectifSaisi >= 0) {
    const e = p.effectifSaisi;
    if (e <= 1) return 'independant';
    if (e <= 5) return '2-5';
    if (e <= 10) return '6-10';
    if (e <= 20) return '11-20';
    return 'plus_de_20';
  }
  const t = p.trancheEffectif;
  if (!t) return p.entrepreneurIndividuel ? 'independant' : 'inconnue';
  const found = TAILLES.find((x) => x.tranches.includes(t));
  if (found) return found.id;
  return TRANCHES[t] ? 'plus_de_20' : 'inconnue';
}

export const CANAUX: Record<Canal, string> = {
  linkedin: 'LinkedIn', email: 'E-mail', telephone: 'Téléphone', formulaire_web: 'Formulaire du site',
  courrier: 'Courrier', salon: 'Salon / événement', recommandation: 'Recommandation', autre: 'Autre',
};

export const STATUTS: Record<Statut, string> = {
  a_qualifier: 'À qualifier', a_contacter: 'À contacter', contacte: 'Contacté', repondu: 'A répondu',
  rdv: 'Rendez-vous / démo', essai: 'Essai', client: 'Client', perdu: 'Perdu', ne_pas_contacter: 'Ne pas contacter',
};

export const LOGICIELS: Record<LogicielActuel, string> = {
  aucun: 'Aucun logiciel', papier_excel: 'Papier / Excel / Word', concurrent: 'Logiciel concurrent', inconnu: 'Inconnu',
};

export const SIGNAUX_ACTIVITE: Record<SignalActivite, string> = {
  recrutement: 'Recrute (offre d\'emploi publiée)',
  croissance_effectif: 'Effectif en hausse',
  nouvel_etablissement: 'Nouvel établissement ouvert',
  chantiers_publies: 'Publie ses chantiers / réalisations',
  avis_clients_recents: 'Avis clients récents',
  site_web_actif: 'Site web à jour',
};

export const SIGNAUX_INTERET: Record<SignalInteret, string> = {
  demande_info: 'A demandé des informations',
  a_repondu_positivement: 'A répondu positivement',
  interaction_linkedin: 'A interagi sur LinkedIn (vue, like, acceptation)',
  visite_site: 'A visité notre site',
  recommande: 'Recommandé par un client',
};

/** Ancienneté en jours à la date `now` ; undefined si la date de création est inconnue. */
export function ageJours(dateCreation: string | undefined, now: Date): number | undefined {
  if (!dateCreation) return undefined;
  const d = new Date(dateCreation + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return undefined;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - d.getTime()) / 86_400_000);
}

/** Filtres « entreprises récemment créées » (section E). */
export const FILTRES_CREATION = [
  { id: '30j', libelle: 'Moins de 30 jours', jours: 30 },
  { id: '3m', libelle: 'Moins de 3 mois', jours: 91 },
  { id: '6m', libelle: 'Moins de 6 mois', jours: 182 },
  { id: '12m', libelle: 'Moins de 12 mois', jours: 365 },
] as const;
export type FiltreCreation = (typeof FILTRES_CREATION)[number]['id'];

export function creeDepuisMoinsDe(dateCreation: string | undefined, filtre: FiltreCreation, now: Date): boolean {
  const age = ageJours(dateCreation, now);
  const f = FILTRES_CREATION.find((x) => x.id === filtre)!;
  return age !== undefined && age >= 0 && age < f.jours;
}

export function trancheAge(dateCreation: string | undefined, now: Date): string {
  const age = ageJours(dateCreation, now);
  if (age === undefined) return 'Date de création inconnue';
  if (age < 91) return 'Créée depuis moins de 3 mois';
  if (age < 365) return 'Créée depuis 3 à 12 mois';
  if (age < 3 * 365) return 'Créée depuis 1 à 3 ans';
  return 'Créée depuis plus de 3 ans';
}

export function estDirigeantDecideur(qualite?: string): boolean {
  if (!qualite) return false;
  return /g[ée]rant|pr[ée]sident|directeur g[ée]n[ée]ral|fondateur|dirigeant|entrepreneur|artisan|chef d'entreprise|associ[ée]/i.test(qualite);
}
