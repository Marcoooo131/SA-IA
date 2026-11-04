/**
 * Parcours de bout en bout (application lancée + données de démonstration, PAYMENT_PROVIDER=demo) :
 * inscription → annonce avec photo → achat avec code promo → paiement bac à sable → expédition
 * → réception → paramètres admin → versement → export DAC7.
 * Usage : npm run dev (dans un autre terminal), puis npm run test:e2e
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const photo = path.join(mkdtempSync(path.join(tmpdir(), 'm3x-')), 'photo.png');
writeFileSync(photo, png(300, 300));
const assert = (c, m) => { if (!c) throw new Error('Échec : ' + m); };
const B = process.env.E2E_URL ?? 'http://localhost:3000';
const log = (...a) => console.log(...a);
async function login(b, email, pw = 'demo-m3x-2026') {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  p.on('pageerror', e => log('PAGEERROR', e.message));
  await p.goto(B + '/connexion'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw);
  await Promise.all([p.waitForURL(u => !u.toString().includes('/connexion'), { timeout: 30000 }), p.click('form button[type=submit]')]);
  return p;
}
(async () => {
  const b = await chromium.launch();
  // 1. inscription particulier
  const ctx = await b.newContext(); const p = await ctx.newPage();
  const email = `e2e${Date.now()}@test.local`;
  await p.goto(B + '/inscription');
  await p.fill('input[name=displayName]', 'Emma T.'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'motdepasse123');
  await p.fill('input[name=city]', 'Rennes'); await p.check('input[name=acceptTerms]');
  await Promise.all([p.waitForURL(/\/espace/, { timeout: 30000 }), p.click('form button[type=submit]')]);
  log('1 inscription ->', p.url().replace(B, ''));
  // 2. création d'annonce avec photo
  await p.goto(B + '/espace/annonces/nouvelle');
  await p.setInputFiles('input[name=photos]', photo);
  await p.fill('input[name=title]', 'Appareil photo Fujifilm X-T30');
  await p.fill('textarea[name=description]', 'Boîtier en très bon état, 8000 déclenchements, batterie et chargeur.');
  await p.selectOption('select[name=categoryId]', { label: 'Électronique & informatique' });
  await p.fill('input[name=price]', '590'); await p.fill('input[name=shipping]', '7,50');
  await Promise.all([p.waitForURL(/ok=publie/, { timeout: 30000 }), p.click('form button[type=submit] >> text=Publier')]);
  const pid = new URL(p.url()).searchParams.get('id');
  log('2 annonce créée', pid);
  // 3. achat par Lucas + paiement bac à sable
  const l = await login(b, 'lucas@demo.m3x');
  await l.goto(B + '/produit/' + pid);
  await Promise.all([l.waitForURL(/\/commande/, { timeout: 30000 }), l.click('button:has-text("Acheter")')]);
  await l.fill('input[name=shippingLine1]', '12 rue de la Roquette'); await l.fill('input[name=shippingPostal]', '75011'); await l.fill('input[name=shippingCity]', 'Paris');
  await l.fill('input[name=promoCode]', 'BIENVENUE10');
  await l.check('input[name=acceptTerms]');
  await Promise.all([l.waitForURL(/paiement\/demo/, { timeout: 30000 }), l.click('button:has-text("Payer")')]);
  log('3 page paiement', l.url().replace(B, ''), await l.locator('h1').innerText());
  await Promise.all([l.waitForURL(/paiement\/retour/, { timeout: 30000 }), l.click('button:has-text("Simuler un paiement accepté")')]);
  log('   retour :', await l.locator('h1').innerText());
  const orderLink = await l.locator('a[href^="/commandes/"]').first().getAttribute('href');
  // 4. le vendeur expédie
  await p.goto(B + orderLink);
  await p.fill('input[name=trackingNumber]', '6A123'); await p.click('button:has-text("Confirmer l\'expédition")');
  await p.waitForSelector('h1:has-text("Expédiée")', { timeout: 20000 });
  log('4 expédiée');
  // 5. l'acheteur confirme la réception
  l.on('dialog', d => d.accept());
  await l.goto(B + orderLink);
  await l.click('button:has-text("Confirmer la réception")');
  await l.waitForSelector('text=Laisser un avis', { timeout: 20000 });
  const st = await l.locator('h1').innerText(); assert(st === 'Terminée', 'statut final'); log('5 réception confirmée, statut :', st);
  await p.goto(B + orderLink);
  const part = (await p.locator('text=Revenu vendeur').first().locator('..').innerText()); assert(part.includes('559,80'), 'part vendeur 559,80 €'); log('   part vendeur :', (await p.locator('text=Revenu vendeur').first().locator('..').innerText()).replace(/\n/g, ' '));
  // 6. admin : paramètres + finances
  const a = await login(b, 'admin@demo.m3x');
  await a.goto(B + '/admin/parametres'); await a.fill('input[name=p2pFee]', '6'); await a.click('button:has-text("Enregistrer les paramètres")');
  await a.waitForSelector('text=Paramètres enregistrés', { timeout: 20000 }); log('6 paramètres enregistrés');
  await a.fill('input[name=p2pFee]', '5'); await a.click('button:has-text("Enregistrer les paramètres")'); await a.waitForTimeout(1500);
  a.on('dialog', d => d.accept());
  await a.goto(B + '/admin/finances');
  const verser = a.locator('button:has-text("Verser")');
  log('   versements possibles :', await verser.count());
  if (await verser.count()) { await verser.first().click(); await a.waitForTimeout(3000); log('   après versement :', await a.locator('text=Versements').count()); }
  const r = await a.request.get(B + '/api/export/dac7'); log('   export DAC7', r.status(), (await r.text()).split('\n').length, 'lignes');
  assert(r.status() === 200, 'export DAC7');
  log('✔ parcours complet réussi');
  await b.close();
})().catch(e => { console.error('ERREUR', e.message); process.exit(1); });
