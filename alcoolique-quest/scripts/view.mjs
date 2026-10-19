// Capture de la visionneuse : node scripts/view.mjs "model=eagle&yaw=0" sortie.png
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const [query, out] = process.argv.slice(2);
const server = await createServer({ server: { port: 5198, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const q of query.split('|')) {
  await page.goto(`http://127.0.0.1:5198/viewer.html?${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const name = out.replace('.png', `-${query.split('|').indexOf(q)}.png`);
  await page.screenshot({ path: name });
  console.log(name);
}
await browser.close();
await server.close();
