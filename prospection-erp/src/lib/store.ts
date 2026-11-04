// Stockage local (navigateur) : aucune donnée n'est envoyée à un serveur.
import { useSyncExternalStore } from 'react';
import type { Donnees, Prospect, Interaction, Campagne, Parametres } from './types';
import { PARAMETRES_DEFAUT } from './types';

const CLE = 'prospection-erp:v1';

export const vide = (): Donnees => ({ version: 1, prospects: [], interactions: [], campagnes: [], parametres: { ...PARAMETRES_DEFAUT } });

export function normaliser(brut: unknown): Donnees {
  const d = (brut ?? {}) as Partial<Donnees>;
  return {
    version: 1,
    prospects: Array.isArray(d.prospects) ? d.prospects : [],
    interactions: Array.isArray(d.interactions) ? d.interactions : [],
    campagnes: Array.isArray(d.campagnes) ? d.campagnes : [],
    parametres: { ...PARAMETRES_DEFAUT, ...(d.parametres ?? {}) },
  };
}

function charger(): Donnees {
  try {
    const s = localStorage.getItem(CLE);
    return s ? normaliser(JSON.parse(s)) : vide();
  } catch {
    return vide();
  }
}

let etat: Donnees = typeof localStorage === 'undefined' ? vide() : charger();
const abonnes = new Set<() => void>();

function ecrire(d: Donnees) {
  etat = d;
  try { localStorage.setItem(CLE, JSON.stringify(d)); } catch { /* stockage indisponible : l'état reste en mémoire */ }
  abonnes.forEach((f) => f());
}

export function useDonnees(): Donnees {
  return useSyncExternalStore((f) => { abonnes.add(f); return () => abonnes.delete(f); }, () => etat);
}

export const lire = () => etat;
export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const maintenant = () => new Date().toISOString();

export const actions = {
  remplacer(d: Donnees) { ecrire(normaliser(d)); },
  ajouterProspects(ps: Omit<Prospect, 'id'>[]): { ajoutes: number; doublons: number } {
    const sirens = new Set(etat.prospects.map((p) => p.siren).filter(Boolean));
    const noms = new Set(etat.prospects.map((p) => `${p.nom.toLowerCase()}|${p.codePostal ?? ''}`));
    const nouveaux: Prospect[] = [];
    let doublons = 0;
    for (const p of ps) {
      const k = `${p.nom.toLowerCase()}|${p.codePostal ?? ''}`;
      if ((p.siren && sirens.has(p.siren)) || noms.has(k)) { doublons++; continue; }
      if (p.siren) sirens.add(p.siren);
      noms.add(k);
      nouveaux.push({ ...p, id: uid() });
    }
    ecrire({ ...etat, prospects: [...nouveaux, ...etat.prospects] });
    return { ajoutes: nouveaux.length, doublons };
  },
  majProspect(id: string, patch: Partial<Prospect>) {
    ecrire({ ...etat, prospects: etat.prospects.map((p) => (p.id === id ? { ...p, ...patch, majLe: maintenant() } : p)) });
  },
  supprimerProspect(id: string) {
    ecrire({ ...etat, prospects: etat.prospects.filter((p) => p.id !== id), interactions: etat.interactions.filter((i) => i.prospectId !== id) });
  },
  ajouterInteraction(i: Omit<Interaction, 'id'>) {
    const it: Interaction = { ...i, id: uid() };
    // Le statut du prospect suit automatiquement l'avancement
    const ordre = ['a_qualifier', 'a_contacter', 'contacte', 'repondu', 'rdv', 'essai', 'client'];
    const cible: Record<string, string> = {
      message_envoye: 'contacte', appel: 'contacte', reponse_positive: 'repondu', reponse_negative: 'perdu',
      rdv: 'rdv', essai: 'essai', signature: 'client', resiliation: 'perdu',
    };
    const prospects = etat.prospects.map((p) => {
      if (p.id !== i.prospectId) return p;
      const s = cible[i.type];
      const avance = s === 'perdu' || ordre.indexOf(s) > ordre.indexOf(p.statut);
      const signauxInteret = i.type === 'reponse_positive' && !p.signauxInteret.includes('a_repondu_positivement')
        ? [...p.signauxInteret, 'a_repondu_positivement' as const] : p.signauxInteret;
      return { ...p, statut: avance && p.statut !== 'ne_pas_contacter' ? (s as Prospect['statut']) : p.statut, signauxInteret, majLe: maintenant() };
    });
    ecrire({ ...etat, prospects, interactions: [...etat.interactions, it] });
  },
  supprimerInteraction(id: string) { ecrire({ ...etat, interactions: etat.interactions.filter((i) => i.id !== id) }); },
  enregistrerCampagne(c: Campagne) {
    const existe = etat.campagnes.some((x) => x.id === c.id);
    ecrire({ ...etat, campagnes: existe ? etat.campagnes.map((x) => (x.id === c.id ? c : x)) : [...etat.campagnes, c] });
  },
  supprimerCampagne(id: string) {
    ecrire({
      ...etat,
      campagnes: etat.campagnes.filter((c) => c.id !== id),
      interactions: etat.interactions.map((i) => (i.campagneId === id ? { ...i, campagneId: undefined } : i)),
    });
  },
  majParametres(p: Partial<Parametres>) { ecrire({ ...etat, parametres: { ...etat.parametres, ...p } }); },
  toutEffacer() { ecrire(vide()); },
};
