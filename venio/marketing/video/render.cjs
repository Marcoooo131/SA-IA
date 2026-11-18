// Rendu image par image de stage.html → segment vidéo (ffmpeg via stdin).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const [,, mode, dsf, fps, a, b, out] = process.argv;
(async () => {
  const V = mode === 'v';
  const br = await chromium.launch({ args: ['--disable-gpu-vsync', '--font-render-hinting=none'] });
  const p = await br.newPage({ viewport: { width: V ? 1080 : 1920, height: V ? 1920 : 1080 }, deviceScaleFactor: 1 });
  await p.goto('http://localhost:4500/stage.html' + (V ? '#v' : ''));
  await p.evaluate(() => window.ready());
  if (out.endsWith('events')) { fs.writeFileSync(out + '.json', JSON.stringify(await p.evaluate(() => window.EVENTS))); await br.close(); return; }
  const cdp = await p.context().newCDPSession(p);
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', fps, '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', fps, out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const f0 = Math.round(+a * fps), f1 = Math.round(+b * fps);
  for (let f = f0; f < f1; f++) {
    await p.evaluate((t) => window.render(t), f / fps);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: V ? 1080 : 1920, height: V ? 1920 : 1080, scale: +dsf } });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await br.close();
})().catch((e) => { console.error(e); process.exit(1); });
