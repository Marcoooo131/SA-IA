// Capture d'images clés de la cinématique (vérification visuelle sans écran).
// Usage : npm run build && node scripts/capture.mjs [t1 t2 ...]   → images dans shots/
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const times = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = times.length ? times : [3.5, 6, 8.6, 10.4, 11.5, 15, 19.5, 22.5, 27, 31, 34, 36.5, 40, 44, 48, 52, 57, 61.8, 62.6, 65.8, 68.9, 72.4, 73.9, 76, 77.4, 80.5, 86, 90, 93, 95.8, 98.2, 101, 105.5, 107.8, 112, 115, 117];
mkdirSync('shots', { recursive: true });

const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const t of list) {
  await page.goto(`http://127.0.0.1:5199/?still=${t}&quality=${process.env.Q || 'high'}${process.env.EXTRA || ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.screenshot({ path: `shots/t${String(t).padStart(6, '0')}.png`, timeout: 180000 });
  console.log('capturé', t);
}
await browser.close();
await server.close();
