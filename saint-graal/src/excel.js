// Lecture du fichier Excel source et actualisation du suivi SAINT GRAAL.
// Principes : les onglets d'origine ne sont JAMAIS modifiés ; chaque écriture est précédée d'une
// sauvegarde, faite dans un fichier temporaire, contrôlée (valeurs d'origine identiques) puis
// substituée à l'original. Fichier verrouillé → l'écriture est mise en file et retentée plus tard.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { sansAccents, versIso, isoVersFr, maintenant, resoudre } from './util.js';

export const STATUTS = {
  POSEE: 'POSÉE',
  CONFORME: 'DÉJÀ CONFORME',
  SIMULEE: 'SIMULÉE (TEST)',
  ATTENTE: 'EN ATTENTE',
  ERREUR: 'ERREUR',
  IGNOREE: 'IGNORÉE – DÉJÀ TRAITÉ',
};
/** Statuts qui signifient « ce contrat est traité, ne jamais reposer ». */
export const STATUTS_TRAITES = [STATUTS.POSEE, STATUTS.CONFORME];

export const COLONNES_SOURCE = {
  contrat: 'Contract Number',
  installation: 'Installation',
  nextInvoiceDate: 'Next Invoice Date',
  activatedDate: 'Activated Date',
  lastIncomeDate: 'Last Income Date',
  caseReason: 'Case Reason',
  customerPortfolio: 'Customer Portfolio',
  productLine: 'Product Line',
  lastLidPopulationDate: 'Last LID population date',
  modifiedBy: 'Modified By',
  commentaire: 'Commentaire',
};
const OBLIGATOIRES = ['contrat', 'caseReason', 'modifiedBy'];

export const COLONNES_SUIVI = [
  'Date de traitement', 'Heure', 'Collaborateur associé', 'Numéro de contrat', 'Installation',
  'Ancienne Last Income Date', 'Nouvelle Last Income Date', 'Case Reason', 'Case Category',
  'Utilisateur ayant effectué la pose', 'Statut', 'Commentaire / Erreur', 'Mode', 'Ligne Excel',
];

export class ErreurExcel extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------------------------------------------------------------- lecture

/** Texte exact d'une cellule (préfixes et zéros conservés : jamais de conversion numérique). */
function texte(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
  }
  if (v instanceof Date) return isoVersFr(versIso(v));
  return String(cell.text ?? v).trim();
}
function brute(cell) {
  const v = cell?.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (v.result !== undefined) return v.result;
    if (v.richText || v.text !== undefined) return texte(cell);
  }
  return v;
}

function trouverEntetes(ws) {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const map = {};
    row.eachCell((cell, c) => { const t = texte(cell); if (t) map[c] = t; });
    if (Object.values(map).some((t) => sansAccents(t) === sansAccents(COLONNES_SOURCE.contrat)
      || sansAccents(t).startsWith(sansAccents(COLONNES_SOURCE.contrat) + ' ('))) return { ligne: r, map };
  }
  return null;
}

function colonne(entetes, nom) {
  const cible = sansAccents(nom);
  for (const [c, t] of Object.entries(entetes)) {
    const n = sansAccents(t);
    if (n === cible || n.startsWith(cible + ' (')) return Number(c);
  }
  return null;
}

export function identifierCollaborateur(modifiedBy, collaborateurs) {
  const n = sansAccents(modifiedBy);
  if (!n) return null;
  const trouves = Object.entries(collaborateurs)
    .filter(([, alias]) => alias.some((a) => new RegExp(`(^|[^a-z])${sansAccents(a).replace(/[-\s]/g, '[-\\s]?')}([^a-z]|$)`).test(n)))
    .map(([nom]) => nom);
  return trouves.length === 1 ? trouves[0] : null; // ambigu → non attribué
}

export function verifierAcces(chemin) {
  if (!chemin) throw new ErreurExcel('EXCEL_NON_CONFIGURE', 'Aucun fichier Excel sélectionné.');
  if (!fs.existsSync(chemin)) throw new ErreurExcel('EXCEL_INACCESSIBLE', `Fichier Excel introuvable : ${chemin}`);
  if (estVerrouille(chemin)) {
    throw new ErreurExcel('EXCEL_VERROUILLE', 'Fichier Excel ouvert/verrouillé (fermez-le dans Excel).');
  }
}

/** Excel crée « ~$nom.xlsx » (ou « ~$ » + nom sans ses 2 premiers caractères) quand le fichier est ouvert. */
export function estVerrouille(chemin) {
  const dir = path.dirname(chemin), base = path.basename(chemin);
  if (fs.existsSync(path.join(dir, '~$' + base)) || fs.existsSync(path.join(dir, '~$' + base.slice(2)))) return true;
  try { fs.closeSync(fs.openSync(chemin, 'r+')); return false; } catch (e) {
    return ['EBUSY', 'EPERM', 'EACCES'].includes(e.code);
  }
}

/** Lit les dossiers de l'onglet source. Ne modifie rien. */
export async function lireDossiers(cfg) {
  const chemin = resoudre(cfg.excel.chemin);
  if (!chemin || !fs.existsSync(chemin)) throw new ErreurExcel('EXCEL_INACCESSIBLE', `Fichier Excel introuvable : ${chemin}`);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(chemin); } catch (e) {
    throw new ErreurExcel('EXCEL_INACCESSIBLE', `Lecture Excel impossible : ${e.message}`);
  }
  const onglets = wb.worksheets.map((w) => ({ nom: w.name, etat: w.state, lignes: w.rowCount }));
  const manquants = cfg.excel.ongletsAConserver.filter((n) => !wb.getWorksheet(n));
  const ws = wb.getWorksheet(cfg.excel.ongletSource);
  if (!ws) throw new ErreurExcel('EXCEL_STRUCTURE', `Onglet « ${cfg.excel.ongletSource} » absent.`);
  const ent = trouverEntetes(ws);
  if (!ent) throw new ErreurExcel('EXCEL_STRUCTURE', 'Colonne « Contract Number » introuvable.');

  const cols = {};
  for (const [cle, nom] of Object.entries(COLONNES_SOURCE)) cols[cle] = colonne(ent.map, nom);
  const absentes = OBLIGATOIRES.filter((k) => !cols[k]).map((k) => COLONNES_SOURCE[k]);
  if (absentes.length) throw new ErreurExcel('EXCEL_STRUCTURE', `Colonnes absentes : ${absentes.join(', ')}`);

  const dossiers = [];
  for (let r = ent.ligne + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const val = (k) => (cols[k] ? row.getCell(cols[k]) : null);
    const contrat = texte(val('contrat'));
    if (!contrat) continue;
    const brut = {};
    for (const [c, t] of Object.entries(ent.map)) brut[t] = texte(row.getCell(Number(c)));
    const d = {
      ligne: r,
      contrat,
      installation: texte(val('installation')),
      nextInvoiceDate: versIso(brute(val('nextInvoiceDate'))),
      activatedDate: versIso(brute(val('activatedDate'))),
      lastIncomeDate: versIso(brute(val('lastIncomeDate'))),
      lastIncomeDateTexte: texte(val('lastIncomeDate')),
      caseReason: texte(val('caseReason')),
      customerPortfolio: texte(val('customerPortfolio')),
      productLine: texte(val('productLine')),
      lastLidPopulationDate: versIso(brute(val('lastLidPopulationDate'))),
      lastLidPopulationDateTexte: texte(val('lastLidPopulationDate')),
      modifiedBy: texte(val('modifiedBy')),
      commentaire: texte(val('commentaire')),
      brut,
      brutDates: Object.fromEntries(Object.entries(ent.map).map(([c, t]) => [t, versIso(brute(row.getCell(Number(c))))])),
    };
    d.collaborateur = identifierCollaborateur(d.modifiedBy, cfg.collaborateurs);
    dossiers.push(d);
  }
  return {
    dossiers,
    onglets,
    ongletsManquants: manquants,
    colonnesTrouvees: Object.fromEntries(Object.entries(cols).map(([k, c]) => [COLONNES_SOURCE[k], c ? ent.map[c] : null])),
    ligneEntetes: ent.ligne,
  };
}

/** Historique déjà écrit dans l'onglet SUIVI SAINT GRAAL (tableau d'objets). */
export async function lireHistorique(cfg) {
  const chemin = resoudre(cfg.excel.chemin);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(chemin);
  return historiqueDepuis(wb.getWorksheet(cfg.excel.ongletSuivi));
}
function historiqueDepuis(ws) {
  if (!ws) return [];
  const out = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const o = {};
    COLONNES_SUIVI.forEach((n, i) => { o[n] = texte(row.getCell(i + 1)); });
    if (o['Numéro de contrat']) out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------- écriture

function empreinte(wb, exclus) {
  const out = {};
  for (const ws of wb.worksheets) {
    if (exclus.includes(ws.name)) continue;
    const cells = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const v = cell.value;
        cells.push(`${r}:${c}=${v instanceof Date ? v.toISOString() : JSON.stringify(v)}`);
      });
    });
    out[ws.name] = { etat: ws.state, cellules: cells.join('|') };
  }
  return out;
}

function largeurs(ws, l) { l.forEach((w, i) => { ws.getColumn(i + 1).width = w; }); }
const ROUGE = 'FFE30613', NOIR = 'FF111111', GRIS = 'FFF2F2F2';
function styleEntete(row, fond = NOIR) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fond } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 30;
}

function ecrireSuivi(wb, nom, historique) {
  const ancien = wb.getWorksheet(nom);
  if (ancien) wb.removeWorksheet(ancien.id);
  const ws = wb.addWorksheet(nom, { properties: { tabColor: { argb: ROUGE } }, views: [{ state: 'frozen', ySplit: 1 }] });
  styleEntete(ws.addRow(COLONNES_SUIVI), ROUGE);
  for (const h of historique) {
    const row = ws.addRow(COLONNES_SUIVI.map((n) => h[n] ?? ''));
    row.getCell(4).numFmt = '@'; // numéro de contrat : texte
  }
  largeurs(ws, [14, 10, 18, 20, 16, 16, 16, 30, 22, 26, 22, 50, 12, 10]);
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLONNES_SUIVI.length)}1` };
}

/** Calcule les indicateurs du tableau de bord à partir des seules poses confirmées. */
export function statistiques(historique, collaborateurs, aujourdhui) {
  const poses = historique.filter((h) => h.Statut === STATUTS.POSEE);
  const dernier = new Map();
  for (const h of historique) if (h.Statut !== STATUTS.SIMULEE) dernier.set(h['Numéro de contrat'], h.Statut);
  const jourFr = isoVersFr(aujourdhui);
  const posesJour = poses.filter((h) => h['Date de traitement'] === jourFr);
  const parCollab = (liste) => Object.fromEntries(collaborateurs.map((c) => [c, liste.filter((h) => h['Collaborateur associé'] === c).length]));
  const jours = [...new Set(poses.map((h) => h['Date de traitement']))]
    .sort((a, b) => versIso(b).localeCompare(versIso(a)));
  return {
    totalJour: posesJour.length,
    jourParCollaborateur: parCollab(posesJour),
    enAttente: [...dernier.values()].filter((s) => s === STATUTS.ATTENTE).length,
    erreurs: [...dernier.values()].filter((s) => s === STATUTS.ERREUR).length,
    totalPoses: poses.length,
    parJour: jours.map((j) => ({ jour: j, ...parCollab(poses.filter((h) => h['Date de traitement'] === j)),
      total: poses.filter((h) => h['Date de traitement'] === j).length })),
    parCollaborateur: collaborateurs.map((c) => ({
      collaborateur: c,
      poses: poses.filter((h) => h['Collaborateur associé'] === c).length,
      conformes: historique.filter((h) => h.Statut === STATUTS.CONFORME && h['Collaborateur associé'] === c).length,
    })),
  };
}

function ecrireTableauDeBord(wb, nom, historique, collaborateurs) {
  const ancien = wb.getWorksheet(nom);
  if (ancien) wb.removeWorksheet(ancien.id);
  const ws = wb.addWorksheet(nom, { properties: { tabColor: { argb: NOIR } } });
  const t = maintenant();
  const s = statistiques(historique, collaborateurs, t.date);
  largeurs(ws, [30, 16, 16, 16, 16, 16, 14]);
  const titre = ws.addRow(['SAINT GRAAL – Tableau de bord des LID posées']);
  titre.font = { bold: true, size: 16, color: { argb: ROUGE } };
  ws.addRow([`Mis à jour le ${isoVersFr(t.date)} à ${t.heure} – seules les poses confirmées dans le CRM sont comptées.`]).font = { italic: true, color: { argb: 'FF6B7280' } };
  ws.addRow([]);
  const bloc = (libelle, valeur) => {
    const r = ws.addRow([libelle, valeur]);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    r.getCell(2).font = { bold: true, size: 13 };
  };
  styleEntete(ws.addRow(["Aujourd'hui", '']), ROUGE);
  bloc("Total des LID posées aujourd'hui", s.totalJour);
  for (const c of collaborateurs) bloc(`LID posées – ${c}`, s.jourParCollaborateur[c]);
  bloc('Dossiers en attente', s.enAttente);
  bloc('Erreurs', s.erreurs);
  bloc('Total des LID posées (historique)', s.totalPoses);
  ws.addRow([]);
  styleEntete(ws.addRow(['Historique par journée', ...collaborateurs, 'Total']));
  for (const j of s.parJour) ws.addRow([j.jour, ...collaborateurs.map((c) => j[c]), j.total]);
  if (!s.parJour.length) ws.addRow(['Aucune pose confirmée pour le moment']);
  ws.addRow([]);
  styleEntete(ws.addRow(['Historique par collaborateur', 'LID posées', 'Déjà conformes']));
  for (const c of s.parCollaborateur) ws.addRow([c.collaborateur, c.poses, c.conformes]);
  return s;
}

/**
 * Suivi Excel : ajoute des lignes à SUIVI SAINT GRAAL, régénère le tableau de bord,
 * avec sauvegarde, écriture atomique et contrôle d'intégrité. File d'attente si verrouillé.
 */
export class SuiviExcel {
  constructor(cfg, { journal = () => {}, fichierFile } = {}) {
    this.cfg = cfg;
    this.chemin = resoudre(cfg.excel.chemin);
    this.journal = journal;
    this.fichierFile = fichierFile || resoudre('data/file-ecriture-excel.json');
    this.file = fs.existsSync(this.fichierFile) ? JSON.parse(fs.readFileSync(this.fichierFile, 'utf8')) : [];
    this.sauvegardeSession = false;
  }

  get enAttenteEcriture() { return this.file.length; }

  _persisterFile() {
    fs.mkdirSync(path.dirname(this.fichierFile), { recursive: true });
    fs.writeFileSync(this.fichierFile, JSON.stringify(this.file, null, 1));
  }

  sauvegarder(motif = 'auto') {
    const dir = resoudre(this.cfg.excel.dossierSauvegardes);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(this.chemin, '.xlsx');
    const dest = path.join(dir, `${base}__${maintenant().horodatage}__${motif}.xlsx`);
    fs.copyFileSync(this.chemin, dest);
    // rotation : on garde les 30 dernières sauvegardes « auto »
    const autos = fs.readdirSync(dir).filter((f) => f.startsWith(base + '__') && f.endsWith('__auto.xlsx')).sort();
    for (const f of autos.slice(0, Math.max(0, autos.length - 30))) fs.unlinkSync(path.join(dir, f));
    return dest;
  }

  /** Ajoute une entrée (objet clé = COLONNES_SUIVI) et tente l'écriture. Renvoie true si écrit. */
  async ajouter(entree) {
    this.file.push(entree);
    this._persisterFile();
    return this.vider();
  }

  /** Écrit les entrées en file. Renvoie true si tout est écrit, false si le fichier est verrouillé. */
  async vider() {
    if (!this.file.length) return true;
    if (estVerrouille(this.chemin)) {
      this.journal('excel', `Excel verrouillé : ${this.file.length} ligne(s) de suivi en attente d'écriture (aucune perte).`, 'avertissement');
      return false;
    }
    if (!this.sauvegardeSession) { this.sauvegarder('debut-session'); this.sauvegardeSession = true; }
    else this.sauvegarder('auto');

    const cfgX = this.cfg.excel;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(this.chemin);
    const exclus = [cfgX.ongletSuivi, cfgX.ongletTableauDeBord];
    const avant = empreinte(wb, exclus);
    const historique = [...historiqueDepuis(wb.getWorksheet(cfgX.ongletSuivi)), ...this.file];
    ecrireSuivi(wb, cfgX.ongletSuivi, historique);
    const stats = ecrireTableauDeBord(wb, cfgX.ongletTableauDeBord, historique, Object.keys(this.cfg.collaborateurs));

    const tmp = this.chemin.replace(/\.xlsx$/i, '') + '.saint-graal-tmp.xlsx';
    await wb.xlsx.writeFile(tmp);
    const verif = new ExcelJS.Workbook();
    await verif.xlsx.readFile(tmp);
    const apres = empreinte(verif, exclus);
    const differences = Object.keys(avant).filter((n) => JSON.stringify(avant[n]) !== JSON.stringify(apres[n]));
    if (differences.length) {
      fs.unlinkSync(tmp);
      throw new ErreurExcel('EXCEL_INTEGRITE', `Écriture annulée : les onglets ${differences.join(', ')} auraient été altérés.`);
    }
    try { fs.renameSync(tmp, this.chemin); } catch (e) {
      fs.rmSync(tmp, { force: true });
      if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) {
        this.journal('excel', 'Excel verrouillé au moment de l\'écriture : nouvelle tentative plus tard.', 'avertissement');
        return false;
      }
      throw e;
    }
    const n = this.file.length;
    this.file = [];
    this._persisterFile();
    this.dernieresStats = stats;
    this.journal('excel', `Excel actualisé (${n} ligne(s) de suivi, tableau de bord régénéré).`, 'succes');
    return true;
  }
}
