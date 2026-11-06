// Moteur SAINT GRAAL : traite les dossiers Excel un par un.
// EXCEL → CONTRAT → RECHERCHE CRM → CALCULETTE → MODIFICATION → ENREGISTREMENT → CONTRÔLE → EXCEL
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { lireDossiers, lireHistorique, SuiviExcel, STATUTS, STATUTS_TRAITES, verifierAcces, ErreurExcel } from './excel.js';
import { Calculette, MODES } from './calculette.js';
import { Crm, correspondanceCaseReason } from './crm.js';
import { Journal } from './journal.js';
import { maintenant, isoVersFr, resoudre, libelleStrict } from './util.js';

export const MODES_AGENT = { TEST: 'TEST', SUPERVISE: 'SUPERVISÉ', AUTONOME: 'AUTONOME' };

/** Codes d'erreur → dossier EN ATTENTE (vérification humaine) plutôt qu'ERREUR. */
const CODES_ATTENTE = new Set(['CONTRAT_INTROUVABLE', 'CONTRAT_AMBIGU', 'NUMERO_INCORRECT', 'INFOS_INCOMPLETES',
  'REGLE_NON_CONFIRMEE', 'CASE_REASON_INTROUVABLE', 'MAUVAISE_CATEGORIE', 'LID_DIFFERENTE', 'LAST_LID_POPULATION',
  'NID_INCOHERENTE', 'REFUS_UTILISATEUR', 'INTERROMPU', 'CALCUL_IMPOSSIBLE']);
/** Codes qui arrêtent la session (aucun dossier suivant ne pourrait être traité sans risque). */
const CODES_BLOQUANTS = new Set(['CRM_INACCESSIBLE', 'CALCULETTE_INDISPONIBLE', 'EXCEL_INTEGRITE', 'EXCEL_INACCESSIBLE',
  'VERIFICATION_APRES_ENREGISTREMENT', 'CONFIG', 'CHAMP_INTROUVABLE', 'CHAMP_AMBIGU']);

class Arret extends Error { constructor() { super('Arrêt demandé'); this.code = 'INTERROMPU'; } }
class Dossier extends Error { constructor(code, message) { super(message); this.code = code; } }

export class Agent extends EventEmitter {
  constructor(cfg, { contexte = null, journal = null } = {}) {
    super();
    this.cfg = cfg;
    this.contexteFourni = contexte; // contexte navigateur injecté (tests)
    this.journal = journal || new Journal(cfg.dossierDonnees || 'data');
    this.j = this.journal.fn;
    this.journal.on('entree', (e) => this.emit('journal', e));
    this.statut = 'arrete';
    this.mode = MODES_AGENT.TEST;
    this.courant = null;
    this.compteurs = this._zero();
    this.total = 0;
    this.index = 0;
    this.connexions = { excel: 'inconnu', crm: 'inconnu', calculette: 'inconnu' };
    this.validationEnCours = null;
    this.resultatsTest = [];
    this.utilisateurCrm = cfg.crm.nomUtilisateur || os.userInfo().username;
  }

  _zero() { return { traites: 0, poses: 0, conformes: 0, simules: 0, attente: 0, erreurs: 0, ignores: 0 }; }

  etat() {
    return {
      statut: this.statut, mode: this.mode, courant: this.courant, compteurs: this.compteurs,
      total: this.total, index: this.index, connexions: this.connexions,
      validation: this.validationEnCours?.infos || null,
      excelEnAttenteEcriture: this.suivi?.enAttenteEcriture || 0,
      autonomeAutorise: this._autonomeAutorise().ok,
      motifAutonome: this._autonomeAutorise().raison,
      fichierExcel: this.cfg.excel.chemin, utilisateurCrm: this.utilisateurCrm,
    };
  }
  _diffuser() { this.emit('etat', this.etat()); }
  _etape(etape, extra = {}) {
    if (this.courant) Object.assign(this.courant, { etape }, extra);
    this.j(etape, extra.message || etape, 'info', this.courant ? { contrat: this.courant.contrat } : {});
    this._diffuser();
  }

  _autonomeAutorise() {
    if (!this.cfg.modes.autonomeAutorise) return { ok: false, raison: 'Mode autonome non autorisé dans la configuration (à activer après validation des tests).' };
    if (!this.cfg.selecteurs.valide) return { ok: false, raison: 'Repères CRM non validés (config/crm-selectors.json).' };
    return { ok: true };
  }

  // ------------------------------------------------------------ navigateur

  async _contexte() {
    if (this.contexteFourni) return this.contexteFourni;
    if (this.ctx) return this.ctx;
    const { chromium } = await import('playwright');
    const opts = { headless: !!this.cfg.crm.sansFenetre, viewport: null };
    if (this.cfg.crm.canalNavigateur) opts.channel = this.cfg.crm.canalNavigateur;
    this.ctx = await chromium.launchPersistentContext(resoudre(this.cfg.crm.dossierProfil), opts);
    this.ctx.on('close', () => { this.ctx = null; this.crm = null; this.calculette = null; });
    return this.ctx;
  }

  async _outils() {
    const ctx = await this._contexte();
    if (!this.crm) this.crm = new Crm(ctx, this.cfg, { journal: this.j });
    if (!this.calculette) this.calculette = new Calculette(ctx, this.cfg.calculette.url, { journal: this.j });
    if (!this.suivi) this.suivi = new SuiviExcel(this.cfg, { journal: this.j, fichierFile: resoudre(path.join(this.cfg.dossierDonnees || 'data', 'file-ecriture-excel.json')) });
  }

  /** Contrôle des trois connexions (Excel, CRM, calculette). */
  async verifierConnexions() {
    try {
      verifierAcces(resoudre(this.cfg.excel.chemin));
      const l = await lireDossiers(this.cfg);
      this.connexions.excel = `OK – ${l.dossiers.length} ligne(s)`;
    } catch (e) { this.connexions.excel = `KO – ${e.message}`; }
    try {
      await this._outils();
      this.connexions.calculette = (await this.calculette.estDisponible()) ? 'OK' : 'KO – indisponible';
      const c = await this.crm.etatConnexion();
      this.connexions.crm = c.connecte ? 'OK – connecté' : `KO – ${c.message}`;
    } catch (e) {
      this.connexions.crm = this.connexions.crm === 'inconnu' ? `KO – ${e.message.split('\n')[0]}` : this.connexions.crm;
      if (this.connexions.calculette === 'inconnu') this.connexions.calculette = `KO – ${e.message.split('\n')[0]}`;
    }
    this._diffuser();
    return this.connexions;
  }

  // ------------------------------------------------------------ commandes

  /** Contrôles synchrones avant lancement (lève une erreur si le lancement est refusé). */
  verifierLancement(mode) {
    if (this.statut !== 'arrete') throw new Error('Saint Graal est déjà lancé.');
    if (!Object.values(MODES_AGENT).includes(mode)) throw new Error(`Mode inconnu : ${mode}`);
    if (mode === MODES_AGENT.AUTONOME && !this._autonomeAutorise().ok) throw new Error(this._autonomeAutorise().raison);
  }

  async lancer(mode = MODES_AGENT.TEST) {
    this.verifierLancement(mode);
    this.mode = mode;
    this.statut = 'en_cours';
    this.compteurs = this._zero();
    this.resultatsTest = [];
    this._diffuser();
    this.execution = this._boucle().catch((e) => {
      this.j('session', `Session interrompue : ${e.message}`, 'erreur');
    }).finally(async () => {
      if (this.mode === MODES_AGENT.TEST && this.resultatsTest.length) this._rapportTest();
      if (this.suivi?.enAttenteEcriture) await this.suivi.vider().catch(() => {});
      this.statut = 'arrete';
      this.courant = null;
      const k = this.compteurs;
      this.j('session', `Session terminée – ${k.traites} traité(s) : ${k.poses} posée(s), ${k.conformes} déjà conforme(s), ${k.simules} simulé(s), ${k.attente} en attente, ${k.erreurs} erreur(s), ${k.ignores} déjà traité(s).`, 'info');
      this._diffuser();
    });
    return this.execution;
  }

  pause() { if (this.statut === 'en_cours') { this.statut = 'pause'; this.j('session', 'Pause demandée (effective à la prochaine étape sûre).', 'avertissement'); this._diffuser(); } }
  reprendre() { if (this.statut === 'pause') { this.statut = 'en_cours'; this.j('session', 'Reprise.', 'info'); this._diffuser(); this._reveil?.(); } }
  arreter() {
    if (['en_cours', 'pause', 'attente_validation'].includes(this.statut)) {
      this.statut = 'arret_demande';
      this.j('session', "Arrêt demandé : aucune nouvelle opération ; l'action en cours se termine proprement.", 'avertissement');
      this._reveil?.();
      if (this.validationEnCours) this.validationEnCours.resoudre(false);
      this._diffuser();
    }
  }
  /** Décision humaine en MODE SUPERVISÉ. */
  valider(decision) {
    if (!this.validationEnCours) return false;
    this.validationEnCours.resoudre(!!decision);
    return true;
  }

  async _pointDeControle() {
    while (this.statut === 'pause') await new Promise((r) => { this._reveil = r; });
    if (this.statut === 'arret_demande') throw new Arret();
  }

  // ------------------------------------------------------------ boucle

  async _boucle() {
    this.j('Lecture Excel', `Lecture du fichier ${this.cfg.excel.chemin}`);
    verifierAcces(resoudre(this.cfg.excel.chemin));
    const lecture = await lireDossiers(this.cfg);
    if (lecture.ongletsManquants.length) this.j('Lecture Excel', `Onglets attendus absents : ${lecture.ongletsManquants.join(', ')}`, 'avertissement');
    await this._outils();
    await this.suivi.vider().catch((e) => this.j('excel', e.message, 'avertissement'));

    const concernes = lecture.dossiers.filter((d) => d.collaborateur);
    const autres = lecture.dossiers.length - concernes.length;
    this.j('Identification du collaborateur', `${concernes.length} dossier(s) rattaché(s) à ${Object.keys(this.cfg.collaborateurs).join(', ')}` +
      (autres ? ` – ${autres} ligne(s) d'autres personnes ignorée(s)` : ''));
    this.total = concernes.length;

    const c = await this.crm.etatConnexion(this.cfg.crm.delaiConnexionMs || 120000);
    this.connexions.crm = c.connecte ? 'OK – connecté' : `KO – ${c.message}`;
    if (!c.connecte) throw new Dossier('CRM_INACCESSIBLE', c.message);
    if (!(await this.calculette.estDisponible())) { this.connexions.calculette = 'KO'; throw new Dossier('CALCULETTE_INDISPONIBLE', 'Calculette indisponible.'); }
    this.connexions.calculette = 'OK';
    this._diffuser();

    for (this.index = 0; this.index < concernes.length; this.index++) {
      try { await this._pointDeControle(); } catch { break; }
      const bloquant = await this._traiter(concernes[this.index]);
      this.compteurs.traites++;
      this._diffuser();
      if (bloquant) { this.j('session', 'Erreur bloquante : session arrêtée pour éviter tout risque. Reprise possible après correction.', 'erreur'); break; }
    }
  }

  async _historique() {
    let h = [];
    try { h = await lireHistorique(this.cfg); } catch (e) {
      throw new Dossier('EXCEL_INACCESSIBLE', `Historique illisible : ${e.message}`);
    }
    return [...h, ...(this.suivi?.file || [])];
  }

  /** Traite un dossier. Renvoie true si l'erreur rencontrée impose l'arrêt de la session. */
  async _traiter(d) {
    const t0 = maintenant();
    this.courant = { contrat: d.contrat, collaborateur: d.collaborateur, ligne: d.ligne, etape: '', dateCalculee: null,
      caseReason: null, resultat: null, ancienneLid: null };
    const r = { d, ancienneLid: d.lastIncomeDateTexte, nouvelleLid: '', caseReason: d.caseReason, caseCategory: '', commentaire: '' };
    let enregistrementLance = false;
    try {
      this._etape('Identification du collaborateur', { message: `Ligne ${d.ligne} – ${d.contrat} – ${d.collaborateur} (Modified By : ${d.modifiedBy})` });

      // ---- contrôles préalables (aucune action CRM)
      const hist = await this._historique();
      const deja = hist.find((h) => h['Numéro de contrat'] === d.contrat && STATUTS_TRAITES.includes(h.Statut));
      if (deja) {
        this.compteurs.ignores++;
        this._resultat(STATUTS.IGNOREE, `Déjà traité le ${deja['Date de traitement']} (${deja.Statut}).`);
        return false;
      }
      if (d.lastLidPopulationDate && this.cfg.regles.attenteSiLastLidPopulationDateRenseignee) {
        throw new Dossier('LAST_LID_POPULATION', `Last LID population date déjà renseignée (${d.lastLidPopulationDateTexte}) : vérification humaine.`);
      }
      const cc = this.cfg.calculette;
      if (!cc.mode || !MODES.includes(cc.mode) || !cc.colonneDateReference) {
        throw new Dossier('REGLE_NON_CONFIRMEE', 'Mode de calculette / colonne de date de référence non confirmés (config.calculette).');
      }
      const dateRef = d.brutDates[cc.colonneDateReference] ?? null;
      const nidIso = cc.colonneNid === 'Next Invoice Date' ? d.nextInvoiceDate : d.brutDates[cc.colonneNid];
      const manquants = [!dateRef && cc.colonneDateReference, !nidIso && cc.colonneNid, !d.caseReason && 'Case Reason'].filter(Boolean);
      if (manquants.length) throw new Dossier('INFOS_INCOMPLETES', `Informations manquantes dans l'Excel : ${manquants.join(', ')}.`);

      // ---- CRM : recherche et lecture
      await this._pointDeControle();
      this._etape('Copie du numéro de contrat', { message: `Numéro copié : ${d.contrat}` });
      this._etape('Recherche CRM');
      await this.crm.ouvrirContrat(d.contrat);
      this._etape('Ouverture du contrat', { message: `Contrat ${d.contrat} ouvert` });
      const avant = await this.crm.lireTermination();
      r.ancienneLid = avant.lastIncomeDateTexte || d.lastIncomeDateTexte;
      r.caseCategory = avant.caseCategory;
      this.courant.ancienneLid = r.ancienneLid;
      this.j('Ouverture du contrat', `Termination Information – Last Income Date : « ${avant.lastIncomeDateTexte || 'vide'} », Case Category : « ${avant.caseCategory || 'vide'} », Case Reason : « ${avant.caseReason || 'vide'} »`, 'info', { contrat: d.contrat });
      if (avant.nextInvoiceDate && avant.nextInvoiceDate !== nidIso) {
        throw new Dossier('NID_INCOHERENTE', `Next Invoice Date CRM (${isoVersFr(avant.nextInvoiceDate)}) ≠ Excel (${isoVersFr(nidIso)}).`);
      }

      // ---- calculette existante
      await this._pointDeControle();
      this._etape('Ouverture calculette');
      const jourNid = Number(nidIso.slice(8, 10));
      this._etape('Calcul NiD', { message: `Calculette : mode ${cc.mode}, date ${isoVersFr(dateRef)}, NID le ${jourNid}` });
      const calc = await this.calculette.calculer({ mode: cc.mode, dateReference: dateRef, jourNid });
      r.nouvelleLid = calc.lidAffichee;
      this.courant.dateCalculee = calc.lidAffichee;
      this.j('Calcul NiD', `LID calculée : ${calc.lidAffichee}`, 'succes', { contrat: d.contrat });
      await this.crm.page.bringToFront().catch(() => {});

      // ---- Case Reason : analyse de la liste CRM puis correspondance exacte
      const options = await this.crm.listerOptions(this.cfg.selecteurs.contrat.caseReason);
      this.j('Sélection Case Reason', `Liste CRM (${options.length}) : ${options.join(' | ')}`, 'info', { contrat: d.contrat });
      const corr = correspondanceCaseReason(d.caseReason, options, this.cfg.regles.correspondancesCaseReason);
      if (!corr.ok) throw new Dossier('CASE_REASON_INTROUVABLE', corr.raison);
      this.courant.caseReason = corr.valeur;

      // ---- Case Category : jamais modifiée sans règle validée
      const catAttendue = this.cfg.regles.caseCategoryParCaseReason[d.caseReason] || null;
      let catACocher = null;
      if (catAttendue && avant.caseCategory && libelleStrict(avant.caseCategory) !== libelleStrict(catAttendue)) {
        if (!this.cfg.regles.modifierCaseCategoryExistante) throw new Dossier('MAUVAISE_CATEGORIE', `Case Category « ${avant.caseCategory} » ≠ attendue « ${catAttendue} ».`);
        catACocher = catAttendue;
      } else if (catAttendue && !avant.caseCategory) catACocher = catAttendue;

      // ---- doublon / conformité
      const lidOk = avant.lastIncomeDate === calc.lid;
      const reasonOk = libelleStrict(avant.caseReason) === libelleStrict(corr.valeur);
      if (lidOk && reasonOk && !catACocher) {
        await this.crm.accueil();
        return this._clore(r, STATUTS.CONFORME, 'Valeurs CRM déjà conformes : aucune modification.', t0);
      }
      if (avant.lastIncomeDate && !lidOk && !this.cfg.regles.ecraserLidExistanteDifferente) {
        throw new Dossier('LID_DIFFERENTE', `Last Income Date déjà renseignée (${avant.lastIncomeDateTexte}) et différente du calcul (${calc.lidAffichee}).`);
      }

      if (this.mode === MODES_AGENT.TEST) {
        await this.crm.accueil();
        this.resultatsTest.push({ ...this._ligne(r, STATUTS.SIMULEE, 'Aucune modification (mode test).', t0), detailCalcul: calc.detail });
        this.compteurs.simules++;
        this._resultat(STATUTS.SIMULEE, `Attendu : LID ${calc.lidAffichee}, Case Reason « ${corr.valeur} »${catACocher ? `, Case Category « ${catACocher} »` : ''}.`);
        return false;
      }

      // ---- modification du contrat
      await this._pointDeControle();
      if (!lidOk) {
        this._etape('Sélection Last Income Date', { message: `Last Income Date ← ${calc.lidAffichee}` });
        await this.crm.saisirDate(this.cfg.selecteurs.contrat.lastIncomeDate, calc.lid);
      }
      if (catACocher) {
        const cats = await this.crm.listerOptions(this.cfg.selecteurs.contrat.caseCategory);
        const cc2 = correspondanceCaseReason(catACocher, cats);
        if (!cc2.ok) throw new Dossier('MAUVAISE_CATEGORIE', `Case Category « ${catACocher} » absente du CRM.`);
        await this.crm.choisirOption(this.cfg.selecteurs.contrat.caseCategory, cc2.valeur);
        r.caseCategory = cc2.valeur;
        // la liste des Case Reason peut dépendre de la catégorie : nouvelle analyse
        const opts2 = await this.crm.listerOptions(this.cfg.selecteurs.contrat.caseReason);
        const corr2 = correspondanceCaseReason(d.caseReason, opts2, this.cfg.regles.correspondancesCaseReason);
        if (!corr2.ok) throw new Dossier('CASE_REASON_INTROUVABLE', corr2.raison);
      }
      if (!reasonOk || catACocher) {
        this._etape('Sélection Case Reason', { message: `Case Reason ← « ${corr.valeur} »` });
        await this.crm.choisirOption(this.cfg.selecteurs.contrat.caseReason, corr.valeur);
      }

      // ---- contrôle avant enregistrement
      const numero = await this.crm.lireChamp(this.cfg.selecteurs.contrat.numero);
      const pre = await this.crm.lireTermination();
      const ecarts = [numero !== d.contrat && 'numéro de contrat', pre.lastIncomeDate !== calc.lid && 'Last Income Date',
        libelleStrict(pre.caseReason) !== libelleStrict(corr.valeur) && 'Case Reason'].filter(Boolean);
      if (ecarts.length) throw new Dossier('SELECTION_INCORRECTE', `Contrôle avant enregistrement en échec : ${ecarts.join(', ')}.`);
      const capAvant = await this._capture(d.contrat, 'avant-enregistrement');

      if (this.mode === MODES_AGENT.SUPERVISE) {
        this.statut = 'attente_validation';
        const ok = await new Promise((resoudre) => {
          this.validationEnCours = { resoudre, infos: { contrat: d.contrat, collaborateur: d.collaborateur,
            ancienneLid: r.ancienneLid, nouvelleLid: calc.lidAffichee, caseReason: corr.valeur, caseCategory: pre.caseCategory,
            capture: capAvant ? path.basename(capAvant) : null, detailCalcul: calc.detail } };
          this._diffuser();
        });
        this.validationEnCours = null;
        if (this.statut === 'attente_validation') this.statut = 'en_cours';
        this._diffuser();
        if (this.statut === 'arret_demande') throw new Arret();
        if (!ok) throw new Dossier('REFUS_UTILISATEUR', 'Pose refusée lors de la validation humaine : contrat non enregistré.');
      }
      await this._pointDeControle(); // dernier point où un arrêt abandonne sans rien écrire

      // ---- enregistrement : à partir d'ici l'action est menée à son terme même si ARRÊTER est demandé
      enregistrementLance = true;
      this._etape('Enregistrement', { message: 'Save & Close' });
      await this.crm.enregistrerEtFermer();
      this.j('Enregistrement', 'Fiche fermée sans erreur : enregistrement confirmé par le CRM.', 'succes', { contrat: d.contrat });

      this._etape('Vérification', { message: 'Réouverture du contrat pour contrôler les valeurs enregistrées' });
      await this.crm.ouvrirContrat(d.contrat);
      const apres = await this.crm.lireTermination();
      await this._capture(d.contrat, 'apres-enregistrement');
      await this.crm.accueil();
      if (apres.lastIncomeDate !== calc.lid || libelleStrict(apres.caseReason) !== libelleStrict(corr.valeur)) {
        throw new Dossier('VERIFICATION_APRES_ENREGISTREMENT',
          `Valeurs relues différentes : LID « ${apres.lastIncomeDateTexte} », Case Reason « ${apres.caseReason} ».`);
      }
      r.caseCategory = apres.caseCategory;
      return this._clore(r, STATUTS.POSEE, '', t0);
    } catch (e) {
      const code = e.code || 'ERREUR';
      const statut = CODES_ATTENTE.has(code) ? STATUTS.ATTENTE : STATUTS.ERREUR;
      if (statut === STATUTS.ATTENTE) this.compteurs.attente++; else this.compteurs.erreurs++;
      await this._capture(d.contrat, `erreur-${code}`);
      if (!enregistrementLance && this.crm) await this.crm.accueil().catch(() => {});
      const msg = `[${code}] ${e.message.split('\n')[0]}`;
      r.commentaire = msg;
      if (this.mode !== MODES_AGENT.TEST) await this._ecrireSuivi(this._ligne(r, statut, msg, t0));
      else this.resultatsTest.push(this._ligne(r, statut, msg, t0));
      this._resultat(statut, msg, statut === STATUTS.ERREUR ? 'erreur' : 'avertissement');
      return CODES_BLOQUANTS.has(code) || (enregistrementLance && code !== 'INTERROMPU');
    }
  }

  _ligne(r, statut, commentaire, t0) {
    return {
      'Date de traitement': isoVersFr(t0.date), Heure: t0.heure, 'Collaborateur associé': r.d.collaborateur,
      'Numéro de contrat': r.d.contrat, Installation: r.d.installation, 'Ancienne Last Income Date': r.ancienneLid || '',
      'Nouvelle Last Income Date': r.nouvelleLid || '', 'Case Reason': this.courant?.caseReason || r.caseReason,
      'Case Category': r.caseCategory || '', 'Utilisateur ayant effectué la pose': this.utilisateurCrm, Statut: statut,
      'Commentaire / Erreur': commentaire || r.commentaire || '', Mode: this.mode, 'Ligne Excel': String(r.d.ligne),
    };
  }

  async _clore(r, statut, commentaire, t0) {
    if (statut === STATUTS.POSEE) this.compteurs.poses++;
    if (statut === STATUTS.CONFORME) this.compteurs.conformes++;
    if (this.mode === MODES_AGENT.TEST) { this.resultatsTest.push(this._ligne(r, statut, commentaire, t0)); this._resultat(statut, commentaire, 'succes'); return false; }
    this._resultat(statut, commentaire || 'Pose confirmée et vérifiée dans le CRM.', 'succes');
    await this._ecrireSuivi(this._ligne(r, statut, commentaire, t0));
    return false;
  }

  async _ecrireSuivi(ligne) {
    this._etape('Actualisation Excel');
    try { await this.suivi.ajouter(ligne); } catch (e) {
      if (e instanceof ErreurExcel && e.code === 'EXCEL_INTEGRITE') throw e;
      this.j('Actualisation Excel', `Écriture différée : ${e.message}`, 'avertissement');
    }
  }

  _resultat(statut, message, niveau = 'info') {
    if (this.courant) this.courant.resultat = `${statut}${message ? ' – ' + message : ''}`;
    this.j('Résultat', `${this.courant?.contrat || ''} : ${statut}${message ? ' – ' + message : ''}`, niveau, { contrat: this.courant?.contrat, statut });
    this._diffuser();
  }

  async _capture(contrat, etape) {
    try {
      const t = maintenant();
      const dir = resoudre(path.join('captures', t.date));
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${t.horodatage}_${contrat}_${etape}.png`);
      await this.crm?.capture(f);
      return f;
    } catch { return null; }
  }

  _rapportTest() {
    const t = maintenant();
    const dir = resoudre(this.cfg.dossierDonnees || 'data');
    fs.mkdirSync(dir, { recursive: true });
    const cols = Object.keys(this.resultatsTest[0]).filter((k) => k !== 'detailCalcul');
    const csv = [cols.join(';'), ...this.resultatsTest.map((l) => cols.map((c) => `"${String(l[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');
    const f = path.join(dir, `rapport-test-${t.horodatage}.csv`);
    fs.writeFileSync(f, '﻿' + csv);
    this.dernierRapport = f;
    this.j('session', `Rapport du mode test : ${f}`, 'succes');
  }

  async fermer() {
    if (this.execution) await this.execution.catch(() => {});
    if (this.ctx) await this.ctx.close().catch(() => {});
  }
}
