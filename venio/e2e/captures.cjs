// Captures d'écran de la vitrine, générées depuis un espace de démonstration (données fictives, jamais de faux écran).
// Usage : API + interface lancées localement, puis  node e2e/captures.cjs http://localhost:3100 web/public/captures
const { chromium } = require('playwright');
const [,, BASE = 'http://localhost:3100', OUT = 'web/public/captures'] = process.argv;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}`, type: 'jpeg', quality: 80 });
  await p.goto(`${BASE}/demo`);
  await p.click('button:has-text("Lancer la démonstration")');
  await p.click('button:has-text("Simuler un appel manqué")');
  await p.waitForSelector('text=Ouvrir le lien', { timeout: 30000 });
  const body = await p.locator('p.rounded-2xl').innerText();
  const code = body.match(/\/c\/([A-Za-z0-9]+)/)[1];
  // Le prospect réserve sur son téléphone (même stockage : le lien se suffit à lui-même).
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const c = await m.newPage();
  await c.goto(`${BASE}/c/${code}`); await c.click('text=Un nouveau projet ou un devis'); await c.waitForSelector('text=Quel est votre projet ?');
  await c.evaluate(() => window.scrollTo(0, document.querySelector('section[aria-label="Prise de rendez-vous"]').offsetTop - 12));
  await c.waitForTimeout(400); await shot(c, 'mobile-parcours.jpg');
  await c.click('button:has-text("Salle de bain")'); await c.click('button:has-text("Douche à l\'italienne")');
  await c.click('button:has-text("Rénovation complète")'); await c.click('button:has-text("Continuer")');
  await c.waitForSelector('text=surface approximative'); await c.click('button:has-text("Continuer")');
  await c.click('button:has-text("D\'une maison")'); await c.click('button:has-text("Oui")');
  await c.click('button:has-text("Dans les 3 mois")'); await c.click('button:has-text("5 000 à 15 000 €")');
  await c.waitForSelector('text=Avez-vous des photos'); await c.click('text=Passer cette question');
  await c.waitForSelector('text=Souhaitez-vous ajouter'); await c.click('text=Passer cette question');
  await c.waitForSelector('text=Choisissez votre rendez-vous'); await c.waitForTimeout(600);
  await c.evaluate(() => window.scrollTo(0, document.querySelector('section[aria-label="Prise de rendez-vous"]').offsetTop - 12));
  await c.waitForTimeout(300); await shot(c, 'mobile-creneaux.jpg');
  await c.locator('.grid button:has-text(":")').first().click();
  await c.waitForSelector('text=Vos coordonnées');
  await c.fill('input[autocomplete=given-name]', 'Léa'); await c.fill('input[autocomplete=family-name]', 'Durand');
  await c.fill('input[autocomplete=email]', 'lea.durand@exemple.fr'); await c.fill('input[autocomplete=tel]', '06 39 98 41 27');
  await c.fill('input[autocomplete=street-address]', '12 rue des Lilas'); await c.fill('input[autocomplete=postal-code]', '92100');
  await c.fill('input[autocomplete=address-level2]', 'Boulogne-Billancourt'); await c.check("text=J'accepte que");
  await c.click('button:has-text("Vérifier ma demande")'); await c.click('button:has-text("Confirmer le rendez-vous")');
  await c.waitForSelector('text=Rendez-vous confirmé');
  // Espace entreprise
  const go = async (path, wait) => { await p.goto(`${BASE}${path}`); await p.waitForSelector(wait); await p.waitForTimeout(900); };
  await go('/app/appels', 'text=Rendez-vous récupérés'); await shot(p, 'app-appels.jpg');
  await go('/app', 'text=Prochains rendez-vous'); await shot(p, 'app-tableau.jpg');
  await go('/app/dossiers', 'text=Léa'); await p.click('text=Léa'); await p.waitForSelector('text=Réponses détaillées'); await p.waitForTimeout(700); await shot(p, 'app-dossier.jpg');
  await go('/app/parametres?onglet=appels', 'text=Message envoyé'); await p.evaluate(() => window.scrollTo(0, 440)); await p.waitForTimeout(400); await shot(p, 'app-reglages-sms.jpg');
  await b.close();
  console.log('captures OK');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
