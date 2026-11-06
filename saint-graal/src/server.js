// Serveur local de l'interface SAINT GRAAL (http://127.0.0.1:4777) – écoute uniquement en local.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chargerConfig, RACINE, resoudre, maintenant } from './util.js';
import { Agent } from './agent.js';
import { lireDossiers, lireHistorique, statistiques } from './excel.js';

const cfg = chargerConfig();
const agent = new Agent(cfg);
const clients = new Set();

const diffuser = (type, data) => {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
};
agent.on('etat', (e) => diffuser('etat', e));
agent.on('journal', (e) => diffuser('journal', e));

function sauverLocal(modif) {
  const f = path.join(RACINE, 'config', 'local.config.json');
  const actuel = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  for (const [k, v] of Object.entries(modif)) actuel[k] = { ...(actuel[k] || {}), ...v };
  fs.writeFileSync(f, JSON.stringify(actuel, null, 2));
}

async function corps(req) {
  let b = '';
  for await (const x of req) b += x;
  return b ? JSON.parse(b) : {};
}

async function apercu() {
  const l = await lireDossiers(cfg);
  const parCollab = {};
  const motifs = {};
  for (const d of l.dossiers) {
    parCollab[d.collaborateur || '(autres)'] = (parCollab[d.collaborateur || '(autres)'] || 0) + 1;
    if (d.collaborateur) motifs[d.caseReason || '(vide)'] = (motifs[d.caseReason || '(vide)'] || 0) + 1;
  }
  return {
    onglets: l.onglets, ongletsManquants: l.ongletsManquants, colonnes: l.colonnesTrouvees,
    colonnesDisponibles: Object.keys(l.dossiers[0]?.brut || {}),
    total: l.dossiers.length, parCollaborateur: parCollab, caseReasons: motifs,
    exemples: l.dossiers.filter((d) => d.collaborateur).slice(0, 5).map((d) => ({ contrat: d.contrat, collaborateur: d.collaborateur, caseReason: d.caseReason, nid: d.nextInvoiceDate })),
    regleCalculette: { mode: cfg.calculette.mode, colonneDateReference: cfg.calculette.colonneDateReference },
  };
}

const routes = {
  'GET /api/etat': async () => ({ ...agent.etat(), journal: agent.journal.entrees.slice(-300) }),
  'POST /api/connexions': async () => agent.verifierConnexions(),
  'POST /api/lancer': async (b) => { agent.verifierLancement(b.mode); agent.lancer(b.mode); return { ok: true }; },
  'POST /api/pause': async () => { agent.pause(); return { ok: true }; },
  'POST /api/reprendre': async () => { agent.reprendre(); return { ok: true }; },
  'POST /api/arreter': async () => { agent.arreter(); return { ok: true }; },
  'POST /api/validation': async (b) => ({ ok: agent.valider(b.decision) }),
  'GET /api/apercu': async () => apercu(),
  'GET /api/tableau': async () => {
    const h = await lireHistorique(cfg).catch(() => []);
    return { ...statistiques([...h, ...(agent.suivi?.file || [])], Object.keys(cfg.collaborateurs), maintenant().date), dernieres: h.slice(-50).reverse() };
  },
  'POST /api/excel': async (b) => {
    if (agent.statut !== 'arrete') throw new Error('Arrêtez Saint Graal avant de changer de fichier.');
    const chemin = String(b.chemin || '').trim().replace(/^"|"$/g, '');
    if (!fs.existsSync(chemin)) throw new Error(`Fichier introuvable : ${chemin}`);
    cfg.excel.chemin = chemin;
    agent.suivi = null;
    sauverLocal({ excel: { chemin } });
    return { ok: true, chemin };
  },
};

const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const json = (code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  try {
    if (u.pathname === '/' || u.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(RACINE, 'public', 'index.html')));
    }
    if (u.pathname === '/api/evenements') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`event: etat\ndata: ${JSON.stringify(agent.etat())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (u.pathname.startsWith('/captures/')) {
      const nom = path.basename(decodeURIComponent(u.pathname));
      const dir = resoudre('captures');
      const trouve = fs.existsSync(dir) && fs.readdirSync(dir).map((j) => path.join(dir, j, nom)).find((f) => fs.existsSync(f));
      if (!trouve) return json(404, { erreur: 'capture introuvable' });
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(fs.readFileSync(trouve));
    }
    const route = routes[`${req.method} ${u.pathname}`];
    if (!route) return json(404, { erreur: 'introuvable' });
    json(200, await route(req.method === 'POST' ? await corps(req) : {}));
  } catch (e) {
    json(400, { erreur: e.message });
  }
});

const port = cfg.serveur.port || 4777;
serveur.listen(port, '127.0.0.1', () => {
  console.log(`\n  SAINT GRAAL prêt : http://127.0.0.1:${port}\n`);
});

let fermeture = false;
async function quitter() {
  if (fermeture) return;
  fermeture = true;
  console.log('Arrêt propre : fin de l\'opération en cours puis écriture du suivi Excel…');
  agent.arreter();
  await agent.fermer();
  process.exit(0);
}
process.on('SIGINT', quitter);
process.on('SIGTERM', quitter);
