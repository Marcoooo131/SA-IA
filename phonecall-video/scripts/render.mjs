#!/usr/bin/env node
// Deterministic render with Playwright: each frame n is drawn at t = n / fps by the page (pure
// function of t), so frames can be rendered in parallel and in any order. PNG frames are piped in
// order to FFmpeg (no temporary files). The soundtrack is rendered by the same page (Web Audio,
// OfflineAudioContext) from the same timeline.
//
// Usage:
//   node scripts/render.mjs                 full render → out/video_noaudio.mp4 + out/soundtrack.wav
//   node scripts/render.mjs --stills 1,5.2  PNG stills → out/stills/ (add --safe for the safe zone)
//   node scripts/render.mjs --fps 15        quick draft
//   node scripts/render.mjs --audio-only    soundtrack only → out/soundtrack.wav
//   options: --workers 3

import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1] ?? true;
};
const flag = (name) => args.includes(`--${name}`);

const { VIDEO } = await import(join(ROOT, "src/config.js"));
const fps = Number(opt("fps", VIDEO.fps));
const workers = Number(opt("workers", 3));

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const require = createRequire(import.meta.url);
    for (const p of [process.env.PLAYWRIGHT_MODULE, "/opt/node-tools/node_modules/playwright"].filter(Boolean)) {
      try {
        return require(p);
      } catch { /* next */ }
    }
    throw new Error("Playwright introuvable : npm install playwright (ou PLAYWRIGHT_MODULE=chemin)");
  }
}

// --------------------------------------------------------------- static server (ES modules need http)
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(ROOT, path || "index.html");
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: VIDEO.width, height: VIDEO.height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.videoReady === true, null, { timeout: 60_000 });
  return page;
}

const decode = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

// --------------------------------------------------------------- main
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/index.html${flag("safe") ? "?safe" : ""}`;
const launch = () => chromium.launch({ args: ["--disable-gpu-vsync", "--font-render-hinting=none"] });

try {
  if (flag("audio-only")) {
    const browser = await launch();
    const page = await openPage(browser, url);
    writeFileSync(join(OUT, "soundtrack.wav"), Buffer.from(await page.evaluate(() => window.renderAudio()), "base64"));
    console.log("Bande-son : out/soundtrack.wav");
    await browser.close();
  } else if (opt("stills", null)) {
    const browser = await launch();
    const page = await openPage(browser, url);
    mkdirSync(join(OUT, "stills"), { recursive: true });
    for (const t of String(opt("stills")).split(",").map(Number)) {
      const file = join(OUT, "stills", `t${t.toFixed(2).padStart(5, "0")}${flag("safe") ? "_safe" : ""}.png`);
      writeFileSync(file, decode(await page.evaluate((tt) => window.renderAt(tt), t)));
      console.log(file);
    }
    await browser.close();
  } else {
    const total = Math.round(VIDEO.duration * fps);
    console.log(`Rendu : ${total} images à ${fps} i/s (${VIDEO.width}×${VIDEO.height}), ${workers} navigateurs`);
    // 1. soundtrack
    const browsers = await Promise.all(Array.from({ length: workers }, launch));
    const pages = await Promise.all(browsers.map((b) => openPage(b, url)));
    const wav = await pages[0].evaluate(() => window.renderAudio());
    writeFileSync(join(OUT, "soundtrack.wav"), Buffer.from(wav, "base64"));
    console.log("Bande-son : out/soundtrack.wav");
    // 2. frames → FFmpeg (in order)
    const videoOut = join(OUT, fps === VIDEO.fps ? "video_noaudio.mp4" : `draft_${fps}fps.mp4`);
    const ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-c:v", "png", "-framerate", String(fps), "-i", "-",
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-level:v", "4.2",
      "-g", String(fps * 2), "-r", String(fps),
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-movflags", "+faststart", videoOut,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const ffDone = new Promise((ok, ko) => ff.on("close", (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg ${code}`)))));
    const ready = new Map();
    let next = 0;
    let written = 0;
    const t0 = Date.now();
    const write = async () => {
      while (ready.has(written)) {
        const buf = ready.get(written);
        ready.delete(written);
        if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
        written++;
        if (written % fps === 0 || written === total) {
          const el = (Date.now() - t0) / 1000;
          process.stdout.write(`\r  ${written}/${total} images — ${el.toFixed(0)} s, reste ~${((el / written) * (total - written)).toFixed(0)} s   `);
        }
      }
    };
    let writing = Promise.resolve();
    await Promise.all(pages.map(async (page) => {
      while (next < total) {
        const n = next++;
        while (ready.size > 24) await new Promise((ok) => setTimeout(ok, 5)); // back-pressure
        const png = await page.evaluate((t) => window.renderAt(t), n / fps);
        ready.set(n, decode(png));
        writing = writing.then(write);
      }
    }));
    await writing;
    ff.stdin.end();
    await ffDone;
    console.log(`\nVidéo (sans son) : ${videoOut}`);
    await Promise.all(browsers.map((b) => b.close()));
  }
} finally {
  server.close();
}
