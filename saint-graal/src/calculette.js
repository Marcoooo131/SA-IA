// Pilotage de la calculette NID / LID EXISTANTE, comme un utilisateur : choix de l'onglet,
// saisie des champs, lecture du résultat affiché. Aucune règle de calcul n'est codée ici.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { versIso, RACINE } from './util.js';

export class ErreurCalculette extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const MODES = ['Installation', 'Résiliation'];

export function urlCalculette(url) {
  if (!url) throw new ErreurCalculette('CALCULETTE_INDISPONIBLE', 'URL de la calculette non configurée.');
  if (/^https?:|^file:/.test(url)) return url;
  const p = path.isAbsolute(url) ? url : path.resolve(RACINE, url);
  if (!fs.existsSync(p)) throw new ErreurCalculette('CALCULETTE_INDISPONIBLE', `Calculette introuvable : ${p}`);
  return pathToFileURL(p).href;
}

export class Calculette {
  constructor(context, url, { journal = () => {}, delaiMs = 15000 } = {}) {
    this.context = context;
    this.url = url;
    this.journal = journal;
    this.delaiMs = delaiMs;
    this.page = null;
  }

  async ouvrir() {
    const url = urlCalculette(this.url);
    if (!this.page || this.page.isClosed()) this.page = await this.context.newPage();
    try {
      await this.page.goto(url, { timeout: this.delaiMs });
      await this.page.getByRole('button', { name: 'Installation', exact: true }).waitFor({ timeout: this.delaiMs });
    } catch (e) {
      throw new ErreurCalculette('CALCULETTE_INDISPONIBLE', `Calculette indisponible : ${e.message.split('\n')[0]}`);
    }
    return this.page;
  }

  async estDisponible() {
    try { await this.ouvrir(); return true; } catch { return false; }
  }

  /**
   * @param {{mode: 'Installation'|'Résiliation', dateReference: string (ISO), jourNid: number}} p
   * @returns {{lid: string (ISO), lidAffichee: string, detail: string[][]}}
   */
  async calculer({ mode, dateReference, jourNid }) {
    if (!MODES.includes(mode)) throw new ErreurCalculette('CALCUL_IMPOSSIBLE', `Mode de calculette inconnu : ${mode}`);
    if (!dateReference) throw new ErreurCalculette('CALCUL_IMPOSSIBLE', 'Date de référence manquante.');
    if (!(jourNid >= 1 && jourNid <= 31)) throw new ErreurCalculette('CALCUL_IMPOSSIBLE', `Jour de NID invalide : ${jourNid}`);
    const page = await this.ouvrir(); // page rechargée : aucun reliquat du dossier précédent

    await page.getByRole('button', { name: mode, exact: true }).click();
    const libelleDate = mode === 'Installation' ? "Date d'installation" : 'Date de résiliation';
    const champDate = page.getByLabel(libelleDate, { exact: true });
    await champDate.fill(dateReference); // <input type="date"> : valeur AAAA-MM-JJ
    await page.getByLabel('Jour de la NID', { exact: true }).fill(String(jourNid));

    const resultat = page.locator('#result');
    const erreur = resultat.locator('.err');
    if (await erreur.count()) throw new ErreurCalculette('CALCUL_IMPOSSIBLE', (await erreur.innerText()).trim());
    const valeur = resultat.locator('.v');
    try { await valeur.waitFor({ timeout: 5000 }); } catch {
      throw new ErreurCalculette('CALCUL_IMPOSSIBLE', `La calculette n'affiche aucun résultat : « ${(await resultat.innerText()).trim()} »`);
    }
    // Contrôle : les champs affichés correspondent bien à ce qui a été saisi
    if ((await champDate.inputValue()) !== dateReference) {
      throw new ErreurCalculette('CALCUL_IMPOSSIBLE', 'La date saisie dans la calculette ne correspond pas.');
    }
    const lidAffichee = (await valeur.innerText()).trim();
    const lid = versIso(lidAffichee);
    if (!lid) throw new ErreurCalculette('CALCUL_IMPOSSIBLE', `Résultat non exploitable : « ${lidAffichee} »`);
    const detail = await page.locator('#detail tbody tr').evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
    return { lid, lidAffichee, detail };
  }

  async capture(fichier) {
    if (this.page && !this.page.isClosed()) await this.page.screenshot({ path: fichier, fullPage: true });
  }
}
