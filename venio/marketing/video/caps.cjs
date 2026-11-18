// Captures du vrai produit (espace de démonstration, données fictives) pour la vidéo.
const { chromium } = require('playwright');
const BASE = 'http://localhost:3100', OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/demo`);
  await p.click('button:has-text("Lancer la démonstration")');
  await p.waitForSelector('text=Simuler un appel manqué');
  const api = ctx.request;
  const nums = ['06 39 98 41 27', '06 39 98 12 58', '06 39 98 77 03', '06 39 98 25 90'];
  for (const n of nums) {
    const r = await api.post(`${BASE}/api/missed-calls/simulate`, { data: { from_number: n } });
    if (!r.ok()) throw new Error('simulate ' + r.status() + (await r.text()));
    await sleep(300);
  }
  const calls = await (await api.get(`${BASE}/api/missed-calls/calls`)).json();
  const byNum = {};
  for (const c of calls) byNum[c.number_masked.slice(-5)] = c;
  const code = (c) => c.sms_body.match(/\/c\/([A-Za-z0-9]+)/)[1];
  const lea = calls.find((c) => c.number_masked.endsWith('27'));
  require('fs').writeFileSync(`${OUT}/sms.txt`, lea.sms_body);
  const slug = (await (await api.get(`${BASE}/api/auth/me`)).json()).tenant.slug;

  // Deux autres prospects réservent par l'API publique (même chemin que le parcours).
  const pub = (await b.newContext()).request;
  const bookViaApi = async (c, who, nth) => {
    const cd = code(c);
    await pub.get(`${BASE}/api/public/links/${cd}`);
    const s = await (await pub.post(`${BASE}/api/public/${slug}/sessions`, { data: { source: { mc: cd } } })).json();
    const h = { 'X-Resume-Token': s.resume_token }, base = `${BASE}/api/public/${slug}/sessions/${s.session_id}`;
    for (const [step, value] of who.answers) {
      const r = await pub.put(`${base}/answers`, { data: { step, value }, headers: h });
      if (!r.ok()) throw new Error(step + ' ' + (await r.text()));
    }
    const today = new Date().toISOString().slice(0, 10);
    const slots = await (await pub.get(`${base}/slots?from=${today}&days=14`, { headers: h })).json();
    const all = slots.days.flatMap((d) => d.slots);
    await pub.post(`${base}/hold`, { data: { start: all[nth].start }, headers: h });
    const r = await pub.post(`${base}/confirm`, { headers: h, data: { ...who.contact, accept_privacy: true } });
    if (!r.ok()) throw new Error('confirm ' + (await r.text()));
  };
  const autre = (txt) => [['projet', 'autre'], ['autre_description', txt], ['logement', 'maison'], ['anciennete', true], ['delai', 'moins_3_mois'], ['budget', null], ['photos', null], ['precisions', null]];
  await bookViaApi(calls.find((c) => c.number_masked.endsWith('58')), { answers: autre('Rénovation d\'un séjour de 30 m²'),
    contact: { first_name: 'Thomas', last_name: 'Martin', email: 'thomas.martin@exemple.fr', phone: '06 39 98 12 58', address: { line: '4 avenue Foch', postal_code: '92210', city: 'Saint-Cloud' } } }, 9);
  await bookViaApi(calls.find((c) => c.number_masked.endsWith('03')), { answers: autre('Isolation des combles'),
    contact: { first_name: 'Camille', last_name: 'Bernard', email: 'camille.bernard@exemple.fr', phone: '06 39 98 77 03', address: { line: '27 rue de Sèvres', postal_code: '92100', city: 'Boulogne-Billancourt' } } }, 20);

  // Le prospect principal réserve sur son téléphone : chaque étape est capturée.
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  const c = await m.newPage();
  let i = 0;
  const ms = async (name) => { await sleep(450); await c.screenshot({ path: `${OUT}/m${String(++i).padStart(2, '0')}-${name}.png` }); };
  const top = async () => { await c.evaluate(() => { const s = document.querySelector('section[aria-label="Prise de rendez-vous"]'); window.scrollTo(0, s ? s.offsetTop - 12 : 0); }); };
  const taps = [];
  const tap = async (sel) => { const l = typeof sel === 'string' ? c.locator(sel).first() : sel; const bb = await l.boundingBox(); taps.push({ shot: i, x: bb.x, y: bb.y, w: bb.width, h: bb.height }); await l.click(); };
  await c.goto(`${BASE}/c/${code(lea)}`); await c.waitForSelector('text=Quel est votre projet ?');
  await ms('accueil');
  await top(); await ms('q-projet');
  await tap('button:has-text("Salle de bain")'); await ms('salle-de-bain');
  await tap('button:has-text("Douche à l\'italienne")'); await ms('douche');
  await tap('button:has-text("Rénovation complète")'); await ms('renovation');
  await tap('button:has-text("Continuer")'); await c.waitForSelector('text=surface approximative'); await top(); await ms('surface');
  await tap('button:has-text("Continuer")'); await top(); await ms('logement');
  await tap('button:has-text("D\'une maison")'); await top(); await ms('anciennete');
  await tap('button:has-text("Oui")'); await top(); await ms('delai');
  await tap('button:has-text("Dans les 3 mois")'); await top(); await ms('budget');
  await tap('button:has-text("5 000 à 15 000 €")'); await c.waitForSelector('text=Avez-vous des photos'); await top(); await ms('photos');
  await tap('text=Passer cette question'); await c.waitForSelector('text=Souhaitez-vous ajouter'); await tap('text=Passer cette question');
  await c.waitForSelector('text=Choisissez votre rendez-vous'); await sleep(700); await top(); await ms('creneaux');
  const slot = c.locator('.grid button:has-text(":")').nth(2);
  await slot.scrollIntoViewIfNeeded(); await ms('creneaux-vu'); await tap(slot); await c.waitForSelector('text=Vos coordonnées'); await top(); await ms('coordonnees-vide');
  await c.fill('input[autocomplete=given-name]', 'Léa'); await c.fill('input[autocomplete=family-name]', 'Durand');
  await c.fill('input[autocomplete=email]', 'lea.durand@exemple.fr'); await c.fill('input[autocomplete=tel]', '06 39 98 41 27');
  await c.fill('input[autocomplete=street-address]', '12 rue des Lilas'); await c.fill('input[autocomplete=postal-code]', '92100');
  await c.fill('input[autocomplete=address-level2]', 'Boulogne-Billancourt'); await top(); await ms('coordonnees');
  await c.check("text=J'accepte que");
  await tap('button:has-text("Vérifier ma demande")'); await sleep(500); await top(); await ms('recap');
  await tap('button:has-text("Confirmer le rendez-vous")'); await c.waitForSelector('text=Rendez-vous confirmé'); await c.evaluate(() => window.scrollTo(0, 0)); await ms('confirme');
  await top(); await ms('confirme-section');

  require('fs').writeFileSync(`${OUT}/taps.json`, JSON.stringify(taps, null, 1));
  // Espace entreprise (le 4e appel reste sans réservation : lien ouvert seulement).
  await pub.get(`${BASE}/api/public/links/${code(calls.find((c) => c.number_masked.endsWith('90')))}`);
  const { execSync } = require('child_process');
  await sleep(1500);
  const go = async (path, wait, name, scroll = 0) => {
    await p.goto(`${BASE}${path}`); await p.waitForSelector(wait); await sleep(1200);
    if (scroll) { await p.evaluate((y) => window.scrollTo(0, y), scroll); await sleep(300); }
    await p.screenshot({ path: `${OUT}/d-${name}.png` });
  };
  await p.goto(`${BASE}/app`); await p.waitForSelector('text=Prochains rendez-vous');
  const hide = p.locator('button[aria-label="Masquer l\'assistant"]'); if (await hide.count()) { await hide.click(); await sleep(800); }
  await go('/app', 'text=Prochains rendez-vous', 'tableau');
  await go('/app', 'text=Conversion sur 30 jours', 'tableau-bas', 420);
  await go('/app/appels', 'text=Rendez-vous récupérés', 'appels');
  await go('/app/dossiers', 'text=Léa', 'demandes');
  await p.click('text=Léa'); await p.waitForSelector('text=Réponses détaillées'); await sleep(900); await p.screenshot({ path: `${OUT}/d-dossier.png` });
  await go('/app/agenda', 'text=Agenda', 'agenda');
  await go('/app/envois', 'text=Envois', 'envois');
  await go('/app/parametres?onglet=appels', 'text=Message envoyé', 'reglages-sms', 380);
  const sectors = [['garage', 'Garage Exemple'], ['immobilier', 'Agence Exemple'], ['demenagement', 'Déménagement Exemple'], ['generique', 'Institut Exemple'], ['renovation', 'Atelier Exemple']];
  for (const [v, name] of sectors) {
    const sc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'fr-FR' });
    const r = await sc.request.post(`${BASE}/api/auth/signup`, { data: { email: `${v}-${Date.now()}@exemple-film.fr`, password: 'motdepasse-solide', full_name: 'Camille Exemple', company_name: name, vertical: v } });
    if (!r.ok()) throw new Error('signup ' + (await r.text()));
    const sl = (await (await sc.request.get(`${BASE}/api/auth/me`)).json()).tenant.slug;
    const pg = await sc.newPage(); await pg.goto(`${BASE}/r/${sl}`); await sleep(1500);
    await pg.screenshot({ path: `${OUT}/s-${v}-top.png` });
    await pg.evaluate(() => { const s = document.querySelector('section[aria-label="Prise de rendez-vous"]'); window.scrollTo(0, s ? s.offsetTop - 12 : 0); }); await sleep(300);
    await pg.screenshot({ path: `${OUT}/s-${v}.png` }); await sc.close();
  }
  await b.close();
  console.log('OK', i, 'mobile');
})().catch((e) => { console.error('FAIL', e.stack); process.exit(1); });
