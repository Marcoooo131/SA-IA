// Test de bout en bout de l'interface : lancement, bouton « Passer » différé, écran de fin, accueil provisoire.
// Usage : node scripts/ui-test.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5196, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'ÉCHEC ') + msg); if (!cond) process.exitCode = 1; };
for (const vp of [{ width: 1280, height: 720, name: 'desktop' }, { width: 844, height: 390, name: 'mobile-paysage', mobile: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://127.0.0.1:5196/?quality=low');
  await page.waitForSelector('#start.visible', { timeout: 300000 });
  check(true, `[${vp.name}] écran de lancement affiché`);
  const skipHidden = await page.$eval('#btn-skip', (b) => !b.classList.contains('visible'));
  check(skipHidden, `[${vp.name}] bouton « Passer » absent avant le lancement`);
  await page.click('#btn-start');
  await page.waitForTimeout(1500);
  check(await page.$eval('#btn-skip', (b) => !b.classList.contains('visible')), `[${vp.name}] « Passer » invisible au début de la cinématique`);
  await page.waitForSelector('#btn-skip.visible', { timeout: 60000 });
  check(true, `[${vp.name}] « Passer » apparaît après quelques secondes`);
  const canvas = await page.$eval('#view', (c) => ({ w: c.clientWidth, h: c.clientHeight }));
  check(Math.abs(canvas.w / canvas.h - 16 / 9) < 0.02, `[${vp.name}] cadre 16:9 (${canvas.w}×${canvas.h})`);
  await page.screenshot({ path: `shots/ui-${vp.name}-playing.png` });
  await page.click('#btn-skip');
  await page.waitForSelector('#end.visible', { timeout: 10000 });
  check(await page.isVisible('#btn-replay') && await page.isVisible('#btn-enter'), `[${vp.name}] boutons REVOIR / ENTRER affichés`);
  await page.screenshot({ path: `shots/ui-${vp.name}-end.png` });
  await page.click('#btn-enter');
  await page.waitForSelector('#home.visible', { timeout: 10000 });
  await page.click('[data-action="new"]');
  const toast = await page.textContent('#home-toast');
  check(toast.length > 10, `[${vp.name}] écran d'accueil provisoire : « ${toast.slice(0, 40)}… »`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/ui-${vp.name}-home.png` });
  await page.click('[data-action="replay"]');
  await page.waitForTimeout(800);
  check(await page.$eval('#home', (h) => !h.classList.contains('visible')), `[${vp.name}] « Revoir la cinématique » relance la lecture`);
  await ctx.close();
}
check(errors.length === 0, `aucune erreur JavaScript${errors.length ? ' : ' + errors.join(' | ') : ''}`);
await browser.close();
await server.close();
