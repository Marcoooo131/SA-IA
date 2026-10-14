/**
 * Génère les icônes de l'application et les écrans de lancement iOS dans public/.
 * Utilise Chromium (Playwright) pour convertir le SVG en PNG : `npm run icons`.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { iconSvg, BRAND } from './icon.mjs';

const out = new URL('../public/', import.meta.url).pathname;
mkdirSync(`${out}icons`, { recursive: true });
mkdirSync(`${out}splash`, { recursive: true });
writeFileSync(`${out}favicon.svg`, iconSvg({ rounded: true }));

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `${out}${file}`, omitBackground: true });
}

await render(iconSvg({ rounded: true }), 192, 'icons/icon-192.png');
await render(iconSvg({ rounded: true }), 512, 'icons/icon-512.png');
// Icône masquable : fond plein et logo dans la zone de sécurité (80 % du centre).
await render(iconSvg({ scale: 0.72 }), 512, 'icons/icon-maskable-512.png');
// iOS arrondit lui-même les coins : fond plein, sans transparence.
await render(iconSvg({ scale: 0.86 }), 180, 'icons/apple-touch-icon.png');

const splash = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2], [440, 956, 3], [402, 874, 3]];
for (const [w, h, r] of splash) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:${BRAND};color:#fff;font:600 22px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
    <div style="width:96px;height:96px;border-radius:22px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.18)">${iconSvg({ scale: 1 }).replace('<svg ', '<svg width="96" height="96" ')}</div>
    <span>English Coach</span></body></html>`);
  // Capture à la densité réelle de l'écran
  const shot = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: r })).newPage();
  await shot.setContent(await page.content());
  await shot.screenshot({ path: `${out}splash/splash-${w * r}x${h * r}.png` });
  await shot.close();
}

await browser.close();
console.log('Icônes et écrans de lancement générés dans public/.');
