// DÉCOUVERTE DU CRM – LECTURE SEULE. N'enregistre jamais rien dans le CRM (aucun clic sur Save).
// Vérifie la connexion, contrôle chaque repère de config/crm-selectors.json sur un contrat ouvert par
// l'utilisateur, liste les libellés, boutons et valeurs des listes Case Reason / Case Category,
// et peut tester la recherche d'un numéro de contrat. Résultat aussi écrit dans decouverte.txt.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { chargerConfig, resoudre, RACINE } from './util.js';
import { Crm } from './crm.js';
import { Calculette } from './calculette.js';

const lignes = [];
const ecrire = (t = '') => { console.log(t); lignes.push(t); };
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const fichier = path.join(RACINE, 'decouverte.txt');
const sauver = () => fs.writeFileSync(fichier, lignes.join('\r\n'));

let cfg;
try { cfg = chargerConfig(); } catch (e) { console.error('\n  ! ' + e.message); process.exit(1); }

ecrire('=== SAINT GRAAL – Découverte du CRM (lecture seule) ===');
ecrire(`Date : ${new Date().toLocaleString('fr-FR')}`);
if (!cfg.crm.url) {
  ecrire('! L\'adresse du CRM est vide : renseignez "url" dans reglages.json (étape 5 du tuto), puis relancez.');
  sauver(); process.exit(1);
}

const { chromium } = await import('playwright');
const opts = { headless: !!cfg.crm.sansFenetre, viewport: null };
if (cfg.crm.canalNavigateur) opts.channel = cfg.crm.canalNavigateur;
const ctx = await chromium.launchPersistentContext(resoudre(cfg.crm.dossierProfil), opts);
const page = ctx.pages()[0] || await ctx.newPage();
const crm = new Crm(ctx, cfg, { journal: () => {} });
crm.page = page;
page.on('dialog', (d) => d.dismiss().catch(() => {}));

// ---- 1. Calculette
ecrire('\n--- 1. Calculette NID / LID');
try {
  const calc = new Calculette(ctx, cfg.calculette.url);
  const r = await calc.calculer({ mode: 'Résiliation', dateReference: '2026-11-04', jourNid: 10 });
  ecrire(r.lidAffichee === '09/02/2027' ? 'OK – calculette pilotée (exemple 04/11 + NID le 10 → 09/02)' : `! Résultat inattendu : ${r.lidAffichee}`);
  await calc.page.close();
} catch (e) { ecrire(`! Calculette : ${e.message}`); }

// ---- 2. Connexion
ecrire('\n--- 2. Connexion au CRM');
await page.goto(cfg.crm.url).catch((e) => ecrire(`! Ouverture impossible : ${e.message.split('\n')[0]}`));
console.log('\n  >> Dans la fenêtre Edge : connectez-vous au CRM comme d\'habitude.');
await rl.question('  >> Quand la page d\'accueil du CRM est affichée, revenez ici et appuyez sur Entrée… ');
const etat = await crm.etatConnexion(5000);
ecrire(etat.connecte ? 'OK – repère « connecté » trouvé' : `! Repère « connecté » (connexion.indicateurConnecte) non trouvé : ${etat.message}`);
ecrire(`Adresse actuelle : ${page.url().split('#')[0].split('?')[0]}`);

// ---- 3. Recherche globale (page d'accueil)
ecrire('\n--- 3. Barre de recherche globale (page d\'accueil)');
const compter = async (spec) => { try { return await crm.loc(spec).count(); } catch { return -1; } };
const verdict = (n) => (n === 1 ? 'OK' : n === 0 ? '! introuvable' : n < 0 ? '! repère invalide' : `! trouvé ${n} fois`);
{
  const rg = cfg.selecteurs.rechercheGlobale;
  let nChamp = await compter(rg.champ);
  if (nChamp === 0 && rg.ouvrir) {
    const nOuvrir = await compter(rg.ouvrir);
    ecrire(`${verdict(nOuvrir)} – rechercheGlobale.ouvrir ${JSON.stringify(rg.ouvrir)}`);
    if (nOuvrir === 1) { await crm.loc(rg.ouvrir).first().click(); await page.waitForTimeout(1500); nChamp = await compter(rg.champ); }
  }
  ecrire(`${verdict(nChamp)} – rechercheGlobale.champ ${JSON.stringify(rg.champ)}`);
}

async function inventaire(titre) {
  ecrire(`\n--- ${titre} : libellés de champs visibles`);
  const champs = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const out = [];
    for (const e of document.querySelectorAll('input, select, textarea, [role=combobox], [role=searchbox]')) {
      if (!vis(e) || e.type === 'hidden') continue;
      const lab = (e.labels && e.labels[0]?.innerText) || e.getAttribute('aria-label') || '';
      const did = e.getAttribute('data-id') || e.closest('[data-id]')?.getAttribute('data-id') || '';
      out.push(`${(lab || '(sans libellé)').trim().replace(/\s+/g, ' ')}  [${e.tagName.toLowerCase()}${e.type ? ':' + e.type : ''}${e.getAttribute('role') ? ' role=' + e.getAttribute('role') : ''}]${did ? '  data-id=' + did : ''}`);
    }
    return out;
  });
  [...new Set(champs)].slice(0, 150).forEach((c) => ecrire('  ' + c));
  ecrire(`\n--- ${titre} : boutons visibles`);
  const boutons = await page.getByRole('button').filter({ visible: true }).evaluateAll((bs) =>
    bs.map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean));
  ecrire('  ' + [...new Set(boutons)].slice(0, 80).join(' | '));
}
await inventaire('Accueil');

// ---- 4. Fiche contrat ouverte par l'utilisateur
console.log('\n  >> Dans Edge, ouvrez UN contrat (n\'importe lequel) et faites défiler jusqu\'à « Termination Information ».');
console.log('  >> Ne modifiez rien. Puis revenez ici et appuyez sur Entrée…');
await rl.question('  ');
ecrire('\n--- 4. Repères de la fiche contrat');
for (const [k, spec] of Object.entries(cfg.selecteurs.contrat)) ecrire(`${verdict(await compter(spec))} – contrat.${k} ${JSON.stringify(spec)}`);
ecrire(`${verdict(await compter(cfg.selecteurs.actions.saveAndClose))} – actions.saveAndClose ${JSON.stringify(cfg.selecteurs.actions.saveAndClose)}`);
try {
  const t = await crm.lireTermination();
  ecrire(`Valeurs lues : Last Income Date « ${t.lastIncomeDateTexte} » (comprise comme ${t.lastIncomeDate || '?'}), Case Category « ${t.caseCategory} », Case Reason « ${t.caseReason} »`);
  if (t.lastIncomeDateTexte && !t.lastIncomeDate) ecrire(`! Format de date non reconnu : vérifier crm.formatDate (actuel : ${cfg.crm.formatDate})`);
} catch (e) { ecrire(`! Lecture de Termination Information : ${e.message}`); }
for (const k of ['caseReason', 'caseCategory']) {
  try {
    const o = await crm.listerOptions(cfg.selecteurs.contrat[k]);
    ecrire(`\nValeurs proposées par ${k} (${o.length}) :`);
    o.forEach((x) => ecrire('  - ' + x));
  } catch (e) { ecrire(`! Liste ${k} : ${e.message}`); }
}
await inventaire('Fiche contrat');

// ---- 5. Test de recherche
ecrire('\n--- 5. Test de recherche par numéro');
const num = (await rl.question('\n  >> Tapez un numéro de contrat pour tester la recherche (ou Entrée pour passer) : ')).trim();
if (num) {
  try {
    await crm.accueil();
    const lu = await crm.ouvrirContrat(num);
    ecrire(`OK – recherche de ${num} : contrat ouvert, numéro affiché « ${lu} »`);
  } catch (e) {
    ecrire(`! Recherche de ${num} : [${e.code || 'ERREUR'}] ${e.message}`);
    const res = await page.locator(cfg.selecteurs.rechercheGlobale.resultat.css || 'a').allInnerTexts().catch(() => []);
    if (res.length) ecrire('  Résultats vus : ' + res.slice(0, 10).map((r) => r.replace(/\s+/g, ' ')).join(' | '));
    await page.screenshot({ path: path.join(RACINE, 'decouverte-recherche.png') }).catch(() => {});
    ecrire('  Capture : decouverte-recherche.png');
  }
}

const nbKo = lignes.filter((l) => l.startsWith('!')).length;
ecrire(`\n=== Fin : ${nbKo === 0 ? 'TOUT EST OK' : `${nbKo} point(s) à régler (lignes commençant par « ! »)`} ===`);
ecrire('Rien n\'a été modifié dans le CRM.');
sauver();
console.log(`\n  Résultat enregistré dans : ${fichier}`);
rl.close();
await ctx.close();
