// Import (fichier Sirene, export d'annuaire…) et export CSV.
import type { Prospect } from './types';
import { metierDepuisNaf } from './referentiel';

export function parseCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ';' : premiere.includes('\t') && !premiere.includes(',') ? '\t' : ',';
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let guill = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (guill) {
      if (ch === '"' && t[i + 1] === '"') { champ += '"'; i++; } else if (ch === '"') guill = false; else champ += ch;
    } else if (ch === '"') guill = true;
    else if (ch === sep) { ligne.push(champ); champ = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      ligne.push(champ); champ = '';
      if (ligne.some((c) => c.trim())) lignes.push(ligne);
      ligne = [];
    } else champ += ch;
  }
  ligne.push(champ);
  if (ligne.some((c) => c.trim())) lignes.push(ligne);
  return lignes;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

const COLONNES: Record<string, string[]> = {
  siren: ['siren'],
  nom: ['nom', 'denomination', 'raisonsociale', 'nomcomplet', 'entreprise', 'denominationunitelegale', 'nomraisonsociale'],
  naf: ['activiteprincipale', 'naf', 'codenaf', 'ape', 'codeape', 'activiteprincipaleunitelegale', 'activiteprincipaleetablissement'],
  dateCreation: ['datecreation', 'datecreationunitelegale', 'datecreationetablissement', 'creation'],
  codePostal: ['codepostal', 'cp', 'codepostaletablissement'],
  commune: ['commune', 'ville', 'libellecommune', 'libellecommuneetablissement'],
  tranche: ['trancheeffectifsalarie', 'trancheeffectif', 'trancheeffectifsunitelegale', 'trancheeffectifsetablissement'],
  effectif: ['effectif', 'salaries', 'nbsalaries'],
  telephone: ['telephone', 'tel'],
  email: ['email', 'mail', 'courriel'],
  siteWeb: ['siteweb', 'site', 'web', 'url'],
  prenom: ['prenomdirigeant', 'prenom', 'prenom1unitelegale'],
  nomDirigeant: ['nomdirigeant', 'dirigeant', 'nomunitelegale'],
  qualite: ['qualite', 'fonction', 'role'],
  linkedin: ['linkedin', 'linkedinurl', 'profillinkedin'],
};

/** Normalise une date « AAAA-MM-JJ », « JJ/MM/AAAA » ou « AAAAMMJJ ». */
export function normaliserDate(s?: string): string | undefined {
  const v = s?.trim();
  if (!v) return undefined;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

export function importerCsv(texte: string, nowIso: string): { prospects: Omit<Prospect, 'id'>[]; colonnesReconnues: string[]; ignorees: number } {
  const [entete, ...lignes] = parseCsv(texte);
  if (!entete) return { prospects: [], colonnesReconnues: [], ignorees: 0 };
  const idx: Record<string, number> = {};
  const h = entete.map(norm);
  for (const [cle, alias] of Object.entries(COLONNES)) {
    const i = h.findIndex((x) => alias.includes(x));
    if (i >= 0) idx[cle] = i;
  }
  const get = (l: string[], k: string) => (idx[k] !== undefined ? l[idx[k]]?.trim() || undefined : undefined);
  let ignorees = 0;
  const prospects: Omit<Prospect, 'id'>[] = [];
  for (const l of lignes) {
    const nom = get(l, 'nom') ?? [get(l, 'prenom'), get(l, 'nomDirigeant')].filter(Boolean).join(' ');
    if (!nom) { ignorees++; continue; }
    const naf = get(l, 'naf');
    const eff = get(l, 'effectif');
    const email = get(l, 'email');
    const prenom = get(l, 'prenom');
    const nomD = get(l, 'nomDirigeant');
    const lk = get(l, 'linkedin');
    prospects.push({
      siren: get(l, 'siren')?.replace(/\s/g, ''),
      nom,
      naf,
      metier: metierDepuisNaf(naf),
      dateCreation: normaliserDate(get(l, 'dateCreation')),
      codePostal: get(l, 'codePostal'),
      commune: get(l, 'commune'),
      departement: get(l, 'codePostal')?.slice(0, 2),
      trancheEffectif: get(l, 'tranche'),
      effectifSaisi: eff && !Number.isNaN(Number(eff)) ? Number(eff) : undefined,
      telephone: get(l, 'telephone'),
      email,
      emailNominatif: email ? !/^(contact|info|accueil|bonjour|hello|devis|secretariat|admin|compta)@/i.test(email) : undefined,
      siteWeb: get(l, 'siteWeb'),
      dirigeant: prenom || nomD ? { prenom, nom: nomD, qualite: get(l, 'qualite'), linkedinUrl: lk } : undefined,
      logicielActuel: 'inconnu',
      activiteVerifiee: false,
      signauxActivite: [],
      signauxInteret: [],
      sources: { identite: 'import_csv' },
      statut: 'a_qualifier',
      creeLe: nowIso,
      majLe: nowIso,
    });
  }
  return { prospects, colonnesReconnues: Object.keys(idx), ignorees };
}

export function versCsv(entete: string[], lignes: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [entete, ...lignes].map((l) => l.map(esc).join(';')).join('\r\n');
}
