// Scénario navigateur de bout en bout (Playwright) : inscription, réservation mobile, espace entreprise, report.
// Usage : API + web démarrés, puis  node e2e/smoke.js /tmp/venio-shots
const { chromium, devices } = require('playwright');
const fs = require('fs');
const SP = process.argv[2] || '.';
const BASE = process.env.VENIO_WEB_URL || 'http://localhost:3000';
require('fs').mkdirSync(`${SP}/shots`, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const log = (...a) => console.log(...a);
  // 1. Inscription (ordinateur)
  const pro = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await pro.newPage();
  p.on('pageerror', e => log('PAGEERROR', e.message));
  await p.goto(`${BASE}/`);
  await p.screenshot({ path: `${SP}/shots/01-home.png` });
  await p.click('text=Essai gratuit');
  await p.click('text=Rénovation de l\'habitat');
  await p.fill('input[autocomplete=organization]', 'Rénov Habitat 92');
  await p.fill('input[autocomplete=name]', 'Karim Benali');
  await p.fill('input[type=email]', `karim${Date.now()}@renov-test.fr`);
  await p.fill('input[type=password]', 'motdepasse-solide');
  await p.click('button[type=submit]');
  await p.waitForURL('**/app?bienvenue=1');
  await p.waitForSelector('text=Votre page est en ligne');
  await p.screenshot({ path: `${SP}/shots/02-dashboard-empty.png` });
  // Paramètres : accroche + zone
  await p.click('nav >> text=Paramètres');
  await p.fill('input[maxlength="120"] >> nth=0', 'Salles de bain et cuisines clés en main');
  await p.fill('textarea >> nth=1', 'Devis gratuit\nArtisan RGE');
  await p.fill('input[placeholder="Boulogne, Issy, Paris 15e…"]', 'Hauts-de-Seine (92)');
  await p.click('button:has-text("Enregistrer")');
  await p.waitForSelector('text=Enregistré.');
  const me = await (await p.request.get(`${BASE}/api/auth/me`)).json();
  const slug = me.tenant.slug; log('slug', slug);

  // 2. Client final sur mobile
  const cli = await browser.newContext({ ...devices['iPhone 13'] });
  const c = await cli.newPage();
  c.on('pageerror', e => log('PAGEERROR client', e.message));
  await c.goto(`${BASE}/r/${slug}?utm_source=google`);
  await c.waitForSelector('text=Quel est votre projet ?');
  await c.screenshot({ path: `${SP}/shots/03-public-start.png`, fullPage: false });
  await c.click('button:has-text("Salle de bain")');
  await c.waitForSelector('text=Quels travaux envisagez-vous ?');
  await c.click('button:has-text("Douche à l\'italienne")');
  await c.click('button:has-text("Carrelage")');
  await c.screenshot({ path: `${SP}/shots/04-multi.png` });
  await c.click('button:has-text("Continuer")');
  await c.waitForSelector('text=surface approximative');
  await c.locator('input[type=range]').fill('8');
  await c.screenshot({ path: `${SP}/shots/05-slider.png` });
  await c.click('button:has-text("Continuer")');
  await c.click('button:has-text("D\'une maison")');
  await c.click('button:has-text("Oui")');
  await c.click('button:has-text("Dans les 3 mois")');
  await c.click('text=Passer cette question'); // budget
  await c.waitForSelector('text=Avez-vous des photos');
  // photo
  await c.setInputFiles('input[type=file]', { name: 'sdb.png', mimeType: 'image/png', buffer: fs.readFileSync(`${SP}/shots/01-home.png`) });
  await c.waitForSelector('text=sdb.png');
  await c.screenshot({ path: `${SP}/shots/06-photos.png` });
  await c.click('button:has-text("Continuer")');
  await c.fill('textarea', 'Accès par le garage.');
  await c.click('button:has-text("Continuer")');
  await c.waitForSelector('text=Choisissez votre rendez-vous');
  await c.waitForSelector('button:has-text(":")');
  await c.screenshot({ path: `${SP}/shots/07-slots.png` });
  // test retour arrière puis reprise
  await c.reload();
  await c.waitForSelector('text=Choisissez votre rendez-vous');
  log('reprise après rechargement : OK');
  const slotBtn = c.locator('.grid button:has-text(":")').first();
  await slotBtn.click();
  await c.waitForSelector('text=Vos coordonnées');
  await c.fill('input[autocomplete=given-name]', 'Léa');
  await c.fill('input[autocomplete=family-name]', 'Durand');
  await c.fill('input[autocomplete=email]', 'lea.durand@client-test.fr');
  await c.fill('input[autocomplete=tel]', '06 12 34 56 78');
  await c.fill('input[autocomplete=street-address]', '12 rue des Lilas');
  await c.fill('input[autocomplete=postal-code]', '92100');
  await c.fill('input[autocomplete=address-level2]', 'Boulogne-Billancourt');
  await c.check('text=J\'accepte de recevoir un rappel');
  await c.check('text=J\'accepte que');
  await c.screenshot({ path: `${SP}/shots/08-contact.png`, fullPage: true });
  await c.click('button:has-text("Vérifier ma demande")');
  await c.waitForSelector('text=Vérifiez votre demande');
  await c.screenshot({ path: `${SP}/shots/09-recap.png`, fullPage: true });
  await c.click('button:has-text("Confirmer le rendez-vous")');
  await c.waitForSelector('text=Rendez-vous confirmé');
  await c.screenshot({ path: `${SP}/shots/10-success.png` });
  const manageHref = await c.getAttribute('a:has-text("Reporter ou annuler")', 'href');
  log('manage', manageHref);

  // 3. Espace entreprise
  await p.goto(`${BASE}/app`);
  await p.waitForSelector('text=Léa Durand');
  await p.screenshot({ path: `${SP}/shots/11-dashboard.png`, fullPage: true });
  await p.click('text=Léa Durand');
  await p.waitForSelector('text=Réponses détaillées');
  await p.fill('textarea', 'Rappeler pour confirmer l\'accès au garage.');
  await p.click('button:has-text("Ajouter la note")');
  await p.waitForSelector('text=Karim Benali ·');
  await p.screenshot({ path: `${SP}/shots/12-dossier.png`, fullPage: true });
  await p.click('nav >> text=Agenda');
  await p.waitForSelector('text=Cette semaine');
  await p.click('nav >> text=Parcours');
  await p.waitForSelector('text=Parcours de réservation');
  await p.screenshot({ path: `${SP}/shots/13-parcours.png` });

  // 4. Gestion par le client : déplacer
  await c.goto(manageHref);
  await c.waitForSelector('text=voici votre rendez-vous');
  await c.click('button:has-text("Déplacer")');
  await c.locator('.grid button:has-text(":")').nth(2).click();
  await c.waitForSelector('text=a été déplacé');
  await c.screenshot({ path: `${SP}/shots/14-manage.png` });
  log('E2E OK');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
