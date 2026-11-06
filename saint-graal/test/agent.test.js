// Tests de bout en bout : classeur de test + CRM de test + calculette réelle du dépôt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { chargerConfig } from '../src/util.js';
import { Agent, MODES_AGENT } from '../src/agent.js';
import { Journal } from '../src/journal.js';
import { lireDossiers, lireHistorique, STATUTS, identifierCollaborateur } from '../src/excel.js';
import { correspondanceCaseReason } from '../src/crm.js';
import { creerFixture } from './fixtures/make-fixture.js';
import { demarrerCrmTest } from './fixtures/crm-test-server.js';

let navigateur, crm, dir;
before(async () => { navigateur = await chromium.launch(); });
after(async () => { await navigateur?.close(); });

async function preparer(surcharges = {}) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saint-graal-'));
  const xlsx = await creerFixture(path.join(dir, 'LID test.xlsx'));
  crm = await demarrerCrmTest();
  const cfg = chargerConfig({
    excel: { chemin: xlsx, dossierSauvegardes: path.join(dir, 'sauvegardes') },
    crm: { url: crm.url, delaiMaxMs: 8000, delaiConnexionMs: 5000, nomUtilisateur: 'Utilisateur CRM Test' },
    calculette: { mode: 'Résiliation', colonneDateReference: 'Termination Date (TEST)' },
    dossierDonnees: path.join(dir, 'data'),
    ...surcharges,
  });
  const ctx = await navigateur.newContext();
  const agent = new Agent(cfg, { contexte: ctx, journal: new Journal(path.join(dir, 'data')) });
  return { cfg, agent, ctx, xlsx };
}
async function nettoyer(ctx) { await ctx.close(); await crm.fermer(); }

test('collaborateurs reconnus sans ambiguïté', () => {
  const c = chargerConfig().collaborateurs;
  assert.equal(identifierCollaborateur('Chloé DUPONT', c), 'Chloé');
  assert.equal(identifierCollaborateur('chloe dupont', c), 'Chloé');
  assert.equal(identifierCollaborateur('Marc-Antoine X', c), 'Marc Antoine');
  assert.equal(identifierCollaborateur('Kaderine Y', c), null);
  assert.equal(identifierCollaborateur('Jean Martin', c), null);
});

test('Case Reason : correspondance exacte uniquement', () => {
  const opts = ['Customer Deceased', 'Moves to new address', 'SSE / B2B - End of business'];
  assert.equal(correspondanceCaseReason('Customer Deceased', opts).valeur, 'Customer Deceased');
  assert.equal(correspondanceCaseReason(' customer  deceased ', opts).valeur, 'Customer Deceased');
  assert.equal(correspondanceCaseReason('Customer Decease', opts).ok, false);
  assert.equal(correspondanceCaseReason('Move to new address', opts).ok, false);
  assert.equal(correspondanceCaseReason('Décès', opts, { 'Décès': 'Customer Deceased' }).valeur, 'Customer Deceased');
});

test('lecture Excel : numéros de contrat conservés tels quels', async () => {
  const { cfg, ctx } = await preparer();
  const l = await lireDossiers(cfg);
  assert.deepEqual(l.ongletsManquants, []);
  assert.equal(l.dossiers[1].contrat, 'C-SFR-00000417');
  assert.equal(l.dossiers[0].nextInvoiceDate, '2026-11-10');
  await nettoyer(ctx);
});

test('règle calculette non confirmée → tout reste EN ATTENTE, rien n\'est écrit', async () => {
  const { agent, ctx } = await preparer({ calculette: { mode: null, colonneDateReference: null } });
  await agent.lancer(MODES_AGENT.SUPERVISE);
  assert.equal(agent.compteurs.poses, 0);
  assert.equal(crm.ecritures.length, 0);
  assert.ok(agent.compteurs.attente >= 5);
  await nettoyer(ctx);
});

test('MODE TEST : aucune écriture CRM ni Excel, résultats attendus présentés', async () => {
  const { agent, ctx, xlsx } = await preparer();
  const avant = fs.readFileSync(xlsx);
  await agent.lancer(MODES_AGENT.TEST);
  assert.equal(crm.ecritures.length, 0);
  assert.ok(avant.equals(fs.readFileSync(xlsx)), 'Excel inchangé');
  const parContrat = Object.fromEntries(agent.resultatsTest.map((r) => [r['Numéro de contrat'], r]));
  // Résiliation 04/11/2026, NID le 10 → LID 09/02/2027 (exemple de la calculette)
  assert.equal(parContrat['C-SFR-00214829']['Nouvelle Last Income Date'], '09/02/2027');
  assert.equal(parContrat['C-SFR-00214829'].Statut, STATUTS.SIMULEE);
  assert.equal(parContrat['C-SFR-00330002'].Statut, STATUTS.ATTENTE); // motif inexistant
  assert.match(parContrat['C-SFR-00330002']['Commentaire / Erreur'], /CASE_REASON_INTROUVABLE/);
  assert.match(parContrat['C-SFR-00999999']['Commentaire / Erreur'], /CONTRAT_INTROUVABLE/);
  assert.match(parContrat['C-SFR-00330004']['Commentaire / Erreur'], /LAST_LID_POPULATION/);
  assert.equal(parContrat['C-SFR-00330003'], undefined); // « Autre Personne » non concerné
  assert.ok(fs.existsSync(agent.dernierRapport));
  await nettoyer(ctx);
});

test('MODE SUPERVISÉ : validation humaine, pose, vérification, suivi Excel, puis anti-doublon', async () => {
  const { agent, ctx, cfg, xlsx } = await preparer();
  const vus = [];
  agent.on('etat', (e) => {
    if (e.validation && !vus.includes(e.validation.contrat)) {
      vus.push(e.validation.contrat);
      // on refuse le 2e contrat, on accepte les autres
      setTimeout(() => agent.valider(e.validation.contrat !== 'C-SFR-00000417'), 50);
    }
  });
  await agent.lancer(MODES_AGENT.SUPERVISE);
  assert.deepEqual(vus, ['C-SFR-00214829', 'C-SFR-00000417', 'C-SFR-00330001']);
  assert.equal(crm.contrats['C-SFR-00214829'].lid, '09/02/2027');
  assert.equal(crm.contrats['C-SFR-00214829'].reason, 'Customer Deceased');
  assert.equal(crm.contrats['C-SFR-00000417'].lid, ''); // refusé → rien d'enregistré
  assert.equal(crm.contrats['C-SFR-00330001'].reason, 'SSE / B2B - End of business');
  assert.equal(agent.compteurs.poses, 2);

  const h = await lireHistorique(cfg);
  const poses = h.filter((x) => x.Statut === STATUTS.POSEE).map((x) => x['Numéro de contrat']);
  assert.deepEqual(poses, ['C-SFR-00214829', 'C-SFR-00330001']);
  assert.equal(h.find((x) => x['Numéro de contrat'] === 'C-SFR-00000417').Statut, STATUTS.ATTENTE);
  assert.equal(h[0]['Utilisateur ayant effectué la pose'], 'Utilisateur CRM Test');

  // onglets d'origine intacts
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Contract Advanced Find View', 'Feuil1', 'Feuil2', 'hiddenSheet',
    'SUIVI SAINT GRAAL', 'TABLEAU DE BORD SAINT GRAAL']);
  assert.equal(wb.getWorksheet('hiddenSheet').state, 'veryHidden');
  assert.equal(wb.getWorksheet('Feuil1').getCell('B1').value, 42);
  const tdb = wb.getWorksheet('TABLEAU DE BORD SAINT GRAAL');
  const lignes = []; tdb.eachRow((r) => lignes.push(r.values.slice(1)));
  assert.deepEqual(lignes.find((l) => l[0] === "Total des LID posées aujourd'hui"), ["Total des LID posées aujourd'hui", 2]);
  assert.deepEqual(lignes.find((l) => l[0] === 'LID posées – Chloé'), ['LID posées – Chloé', 1]);

  // 2e passage : aucune seconde pose
  const n = crm.ecritures.length;
  const agent2 = new Agent(cfg, { contexte: ctx, journal: new Journal(path.join(dir, 'data')) });
  agent2.on('etat', (e) => { if (e.validation) setTimeout(() => agent2.valider(false), 20); });
  await agent2.lancer(MODES_AGENT.SUPERVISE);
  assert.equal(agent2.compteurs.ignores, 2);
  assert.equal(crm.ecritures.length, n);
  await nettoyer(ctx);
});

test('valeur CRM déjà conforme → DÉJÀ CONFORME sans modification', async () => {
  const { agent, ctx } = await preparer();
  crm.contrats['C-SFR-00214829'].lid = '09/02/2027';
  crm.contrats['C-SFR-00214829'].reason = 'Customer Deceased';
  agent.on('etat', (e) => { if (e.validation) setTimeout(() => agent.valider(false), 20); });
  await agent.lancer(MODES_AGENT.SUPERVISE);
  assert.equal(agent.compteurs.conformes, 1);
  assert.ok(!crm.ecritures.some((e) => e.num === 'C-SFR-00214829'));
  await nettoyer(ctx);
});

test('ARRÊTER pendant la validation : rien n\'est enregistré, session close', async () => {
  const { agent, ctx } = await preparer();
  agent.on('etat', (e) => { if (e.validation) setTimeout(() => agent.arreter(), 20); });
  await agent.lancer(MODES_AGENT.SUPERVISE);
  assert.equal(crm.ecritures.length, 0);
  assert.equal(agent.statut, 'arrete');
  assert.equal(agent.compteurs.traites, 1);
  await nettoyer(ctx);
});

test('MODE AUTONOME refusé tant que non autorisé', async () => {
  const { agent, ctx } = await preparer();
  await assert.rejects(() => agent.lancer(MODES_AGENT.AUTONOME), /non autorisé/);
  await nettoyer(ctx);
});
