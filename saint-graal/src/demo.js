// Démonstration SANS RISQUE : CRM de test local + classeur Excel fictif. Le vrai CRM n'est jamais ouvert.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerFixture } from '../test/fixtures/make-fixture.js';
import { demarrerCrmTest } from '../test/fixtures/crm-test-server.js';

const dir = path.join(os.tmpdir(), 'saint-graal-demo');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const xlsx = await creerFixture(path.join(dir, 'LID DEMO (fictif).xlsx'));
const crm = await demarrerCrmTest(0);
const sansFenetre = process.argv.includes('--sans-fenetre');
fs.writeFileSync(path.join(dir, 'demo.json'), JSON.stringify({
  excel: { chemin: xlsx, dossierSauvegardes: path.join(dir, 'sauvegardes') },
  crm: { url: crm.url, nomUtilisateur: 'Démo', dossierProfil: path.join(dir, 'profil'), sansFenetre,
    ...(process.platform === 'win32' ? {} : { canalNavigateur: null }) },
  calculette: { mode: 'Résiliation', colonneDateReference: 'Termination Date (TEST)' },
  dossierDonnees: path.join(dir, 'data'),
  serveur: { port: 4790 },
}));
process.env.SAINT_GRAAL_CONFIG = path.join(dir, 'demo.json');
process.env.SAINT_GRAAL_DONNEES = dir;
process.env.SAINT_GRAAL_DEMO = '1';
console.log('\n  DÉMONSTRATION : CRM de test et Excel FICTIFS – le vrai CRM n\'est pas utilisé.');
console.log(`  Excel de démonstration : ${xlsx}`);
await import('./server.js');
