const { chromium } = require('playwright');
const [,, mode = 'h', times = '1', out = 'prev'] = process.argv;
(async () => {
  const V = mode === 'v';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: V ? 1080 : 1920, height: V ? 1920 : 1080 }, deviceScaleFactor: 0.5 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:4500/stage.html' + (V ? '#v' : ''));
  await p.evaluate(() => window.ready());
  for (const t of times.split(',')) { await p.evaluate((t) => window.render(+t), t); await p.screenshot({ path: `${out}-${t}.png` }); }
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
