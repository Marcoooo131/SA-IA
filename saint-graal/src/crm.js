// Pilotage du CRM dans le navigateur, avec le compte de l'utilisateur (session ouverte par lui :
// aucune authentification n'est contournée). Tous les repères d'interface viennent de
// config/crm-selectors.json pour s'adapter au CRM réel sans toucher au code.
import { formaterDate, lireDateCrm, libelleStrict, attendre } from './util.js';

export class ErreurCrm extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class Crm {
  constructor(context, cfg, { journal = () => {} } = {}) {
    this.context = context;
    this.cfg = cfg;
    this.sel = cfg.selecteurs;
    this.journal = journal;
    this.delai = cfg.crm.delaiMaxMs || 30000;
    this.page = null;
  }

  loc(spec, racine = this.page) {
    if (!spec) throw new ErreurCrm('CONFIG', 'Repère CRM non configuré.');
    let l;
    if (spec.label) l = racine.getByLabel(spec.label, { exact: true });
    else if (spec.role) l = racine.getByRole(spec.role, spec.name ? { name: spec.name, exact: true } : {});
    else if (spec.text) l = racine.getByText(spec.text, { exact: true });
    else if (spec.css) l = racine.locator(spec.css);
    else throw new ErreurCrm('CONFIG', `Repère CRM invalide : ${JSON.stringify(spec)}`);
    return l.filter({ visible: true });
  }

  async _page() {
    if (!this.page || this.page.isClosed()) {
      this.page = this.context.pages().find((p) => p.url().startsWith(this.cfg.crm.url || '#')) || await this.context.newPage();
      this.page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
    }
    return this.page;
  }

  /** État de connexion : on ouvre le CRM et on attend un élément visible seulement une fois connecté. */
  async etatConnexion(delaiMs = 15000) {
    if (!this.cfg.crm.url) return { connecte: false, message: 'URL du CRM non configurée' };
    const page = await this._page();
    try {
      if (!page.url().startsWith(this.cfg.crm.url)) await page.goto(this.cfg.crm.url, { timeout: this.delai });
      await this.loc(this.sel.connexion.indicateurConnecte).first().waitFor({ timeout: delaiMs });
      return { connecte: true, message: 'Connecté' };
    } catch (e) {
      const url = page.url();
      if (/login|signin|oauth|adfs|sso/i.test(url)) return { connecte: false, message: 'Connexion requise : connectez-vous dans la fenêtre du navigateur' };
      return { connecte: false, message: `CRM inaccessible : ${e.message.split('\n')[0]}` };
    }
  }

  async accueil() {
    const page = await this._page();
    await page.goto(this.cfg.crm.url, { timeout: this.delai });
    await this._abandonnerModifs();
  }

  async _abandonnerModifs() {
    const b = this.loc(this.sel.actions.dialogueAbandon);
    if (await b.count()) { await b.first().click(); this.journal('crm', 'Modifications non enregistrées abandonnées (aucune donnée écrite).'); }
  }

  /** Recherche globale par numéro de contrat, ouverture et vérification stricte du numéro. */
  async ouvrirContrat(numero) {
    const page = await this._page();
    if (!page.url().startsWith(this.cfg.crm.url)) await this.accueil();
    const rg = this.sel.rechercheGlobale;
    const champ = this.loc(rg.champ);
    if (!(await champ.count()) && rg.ouvrir) {
      const b = this.loc(rg.ouvrir);
      if (await b.count()) await b.first().click();
    }
    try { await champ.first().waitFor({ timeout: this.delai }); } catch {
      throw new ErreurCrm('CRM_INACCESSIBLE', 'Barre de recherche globale introuvable.');
    }
    await champ.first().fill('');
    await champ.first().fill(numero); // numéro complet, préfixe et zéros compris
    if ((await champ.first().inputValue()) !== numero) throw new ErreurCrm('NUMERO_INCORRECT', 'Le numéro saisi dans la recherche ne correspond pas.');
    this.journal('crm', `Recherche CRM : « ${numero} »`);
    await champ.first().press('Enter');

    const exact = new RegExp(`(^|[^A-Za-z0-9-])${echapper(numero)}([^A-Za-z0-9-]|$)`);
    const resultats = this.loc(rg.resultat);
    const fin = Date.now() + this.delai;
    let correspondants = [];
    let textes = [];
    while (Date.now() < fin) {
      textes = await resultats.allInnerTexts();
      correspondants = textes.map((t, i) => [t, i]).filter(([t]) => exact.test(t));
      if (correspondants.length) break;
      if (await this.loc({ text: 'No results' }).or(this.loc({ text: 'Aucun résultat' })).count()) break;
      await attendre(400);
    }
    // laisse le temps aux résultats tardifs d'arriver, pour détecter les doublons
    await attendre(800);
    textes = await resultats.allInnerTexts();
    correspondants = textes.map((t, i) => [t, i]).filter(([t]) => exact.test(t));
    if (!correspondants.length) throw new ErreurCrm('CONTRAT_INTROUVABLE', `Contrat ${numero} introuvable dans le CRM.`);
    if (correspondants.length > 1) throw new ErreurCrm('CONTRAT_AMBIGU', `${correspondants.length} résultats pour ${numero} : identification non certaine.`);
    await resultats.nth(correspondants[0][1]).click();

    const champNumero = this.loc(this.sel.contrat.numero);
    try { await champNumero.first().waitFor({ timeout: this.delai }); } catch {
      throw new ErreurCrm('CONTRAT_INTROUVABLE', 'Fiche contrat non ouverte (champ Contract Number absent).');
    }
    const affiche = await this.lireChamp(this.sel.contrat.numero);
    if (affiche !== numero) throw new ErreurCrm('NUMERO_INCORRECT', `Numéro affiché « ${affiche} » ≠ Excel « ${numero} ».`);
    this.journal('crm', `Contrat ouvert et vérifié : ${affiche}`);
    return affiche;
  }

  async _afficherSection() {
    const s = this.sel.contrat.sectionTermination;
    if (!s) return;
    const l = this.loc(s);
    if (await l.count()) await l.first().scrollIntoViewIfNeeded();
    else throw new ErreurCrm('CHAMP_INTROUVABLE', `Rubrique « ${s.text || s.label || s.css} » introuvable sur le contrat.`);
  }

  async _element(spec) {
    const l = this.loc(spec);
    const n = await l.count();
    if (!n) throw new ErreurCrm('CHAMP_INTROUVABLE', `Champ « ${spec.label || spec.name || spec.css} » introuvable.`);
    if (n > 1) throw new ErreurCrm('CHAMP_AMBIGU', `Champ « ${spec.label || spec.name || spec.css} » trouvé ${n} fois.`);
    return l.first();
  }

  async lireChamp(spec) {
    const el = await this._element(spec);
    const tag = await el.evaluate((e) => e.tagName);
    if (tag === 'SELECT') {
      const t = await el.evaluate((e) => (e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : ''));
      return /^-+\s*$|^-{1,3}\s*select/i.test(t.trim()) ? '' : t.trim();
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') return (await el.inputValue()).trim();
    return ((await el.getAttribute('value')) ?? (await el.innerText())).trim();
  }

  /** Lit les valeurs utiles de la rubrique Termination Information. */
  async lireTermination() {
    await this._afficherSection();
    const c = this.sel.contrat;
    const lidTexte = await this.lireChamp(c.lastIncomeDate);
    return {
      lastIncomeDateTexte: lidTexte,
      lastIncomeDate: lireDateCrm(lidTexte, this.cfg.crm.formatDate),
      caseCategory: await this.lireChamp(c.caseCategory),
      caseReason: await this.lireChamp(c.caseReason),
      nextInvoiceDate: c.nextInvoiceDate ? lireDateCrm(await this.lireChamp(c.nextInvoiceDate).catch(() => ''), this.cfg.crm.formatDate) : null,
    };
  }

  /** Liste des valeurs proposées par une liste déroulante (analysée AVANT toute sélection). */
  async listerOptions(spec) {
    const el = await this._element(spec);
    if ((await el.evaluate((e) => e.tagName)) === 'SELECT') {
      return (await el.locator('option').allInnerTexts()).map((t) => t.trim()).filter((t) => t && !/^-+$/.test(t));
    }
    await el.click();
    const opts = this.page.getByRole('option').filter({ visible: true });
    await opts.first().waitFor({ timeout: 5000 }).catch(() => {});
    const textes = (await opts.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return textes;
  }

  async choisirOption(spec, libelle) {
    const el = await this._element(spec);
    if ((await el.evaluate((e) => e.tagName)) === 'SELECT') {
      await el.selectOption({ label: libelle });
    } else {
      await el.click();
      await this.page.getByRole('option', { name: libelle, exact: true }).filter({ visible: true }).click();
    }
    const lu = await this.lireChamp(spec);
    if (lu !== libelle) throw new ErreurCrm('SELECTION_INCORRECTE', `Valeur affichée « ${lu} » au lieu de « ${libelle} ».`);
  }

  async saisirDate(spec, iso) {
    const el = await this._element(spec);
    const texte = formaterDate(iso, this.cfg.crm.formatDate);
    await el.fill('');
    await el.fill(texte);
    await el.press('Tab');
    const lu = lireDateCrm(await this.lireChamp(spec), this.cfg.crm.formatDate);
    if (lu !== iso) throw new ErreurCrm('DATE_REFUSEE', `Le CRM affiche « ${await this.lireChamp(spec)} » au lieu de « ${texte} ».`);
  }

  /** Save & Close puis attente de la fermeture de la fiche sans message d'erreur. */
  async enregistrerEtFermer() {
    const bouton = await this._element(this.sel.actions.saveAndClose);
    await bouton.click();
    const numero = this.loc(this.sel.contrat.numero);
    const erreur = this.loc(this.sel.actions.notificationErreur);
    const fin = Date.now() + this.delai;
    while (Date.now() < fin) {
      if (await erreur.count()) {
        const msg = (await erreur.first().innerText()).trim();
        throw new ErreurCrm('ENREGISTREMENT_IMPOSSIBLE', `Le CRM refuse l'enregistrement : ${msg}`);
      }
      if (!(await numero.count())) return true;
      await attendre(300);
    }
    throw new ErreurCrm('ENREGISTREMENT_IMPOSSIBLE', "Pas de confirmation d'enregistrement (fiche toujours ouverte).");
  }

  async capture(fichier) {
    if (this.page && !this.page.isClosed()) await this.page.screenshot({ path: fichier, fullPage: true }).catch(() => {});
  }
}

/** Retrouve le Case Reason CRM correspondant EXACTEMENT au libellé Excel (ou via table validée). */
export function correspondanceCaseReason(libelleExcel, optionsCrm, tableValidee = {}) {
  const cible = tableValidee[libelleExcel] ?? libelleExcel;
  const trouves = optionsCrm.filter((o) => libelleStrict(o) === libelleStrict(cible));
  if (trouves.length === 1) return { ok: true, valeur: trouves[0], viaTable: cible !== libelleExcel };
  if (trouves.length > 1) return { ok: false, raison: `Plusieurs motifs CRM identiques à « ${cible} »` };
  return { ok: false, raison: `Motif « ${libelleExcel} » absent de la liste CRM` };
}
