// Image of the video at time t (seconds), Canvas 2D. Pure function of t: no timer, no Math.random.
//
// Pipeline of one frame:
//   1. background (main canvas): black, red glows, light lines, particles — with parallax
//   2. content layer (offscreen): the scene (interface, texts) in layout coordinates
//   3. composite of the layer with the camera (zoom / travelling) + motion blur when it moves fast
//   4. post: flashes, discreet bloom, vignette, film grain

import { CONVERSATION, COLORS as C, CUES, FONT, GENERATED_FIELDS, NOTE, SAFE, SCENES, TEXT, VIDEO } from "./config.js";
import { clamp, ease, lerp, rng, sceneAt, seg, wave, window01 } from "./timeline.js";

const W = VIDEO.width;
const H = VIDEO.height;
const CX = Math.round((SAFE.left + SAFE.right) / 2); // horizontal centre of the safe zone
const CW = SAFE.right - SAFE.left; // usable width

// ------------------------------------------------------------------ drawing helpers

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function font(weight, size, family = FONT.ui) {
  return `${weight} ${size}px ${family}`;
}

/** « APRÈS CHAQUE *APPEL* » → [{t: "APRÈS", red: false}, ...] (one entry per word). */
function richWords(text) {
  const words = [];
  const re = /\*([^*]+)\*|([^*]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const red = m[1] !== undefined;
    for (const w of (m[1] ?? m[2]).split(/(\s+|\n)/)) {
      if (w === "\n") words.push({ t: "\n" });
      else if (w.trim()) words.push({ t: w, red });
    }
  }
  return words;
}

/** Lays words out on lines that fit maxWidth (explicit \n respected), shrinking the size if needed. */
function layoutWords(c, words, size, maxWidth, weight, family, spacing) {
  c.save();
  try {
    return layoutWordsInner(c, words, size, maxWidth, weight, family, spacing);
  } finally {
    c.restore();
  }
}

function layoutWordsInner(c, words, size, maxWidth, weight, family, spacing) {
  for (let s = size; s > 20; s -= 2) {
    c.font = font(weight, s, family);
    c.letterSpacing = `${spacing * s}px`;
    const space = c.measureText(" ").width;
    const lines = [[]];
    let width = 0;
    let ok = true;
    for (const w of words) {
      if (w.t === "\n") {
        lines.push([]);
        width = 0;
        continue;
      }
      const ww = c.measureText(w.t).width;
      const line = lines[lines.length - 1];
      if (line.length && width + space + ww > maxWidth) {
        lines.push([]);
        width = 0;
      }
      const cur = lines[lines.length - 1];
      if (ww > maxWidth) ok = false;
      cur.push({ ...w, w: ww });
      width += (cur.length > 1 ? space : 0) + ww;
    }
    if (ok) return { size: s, lines: lines.filter((l) => l.length), space };
  }
  return { size: 20, lines: [words.filter((w) => w.t !== "\n").map((w) => ({ ...w, w: 0 }))], space: 4 };
}

/**
 * Headline: words rise from behind a mask one after another, with a light RGB split during the
 * entrance; exit upwards. t0 = entrance, t1 = exit.
 */
function headline(c, text, t, t0, t1, opts = {}) {
  const { y = 330, size = 104, maxWidth = CW, weight = 900, family = FONT.display, align = "center", x = CX } = opts;
  if (t < t0 || t > t1 + 0.01) return;
  const L = layoutWords(c, richWords(text), size, maxWidth, weight, family, -0.025);
  const lh = L.size * 1.02;
  const out = ease.inCubic(seg(t, t1 - 0.2, t1));
  c.save();
  c.textBaseline = "alphabetic";
  let wi = 0;
  L.lines.forEach((line, li) => {
    const lineW = line.reduce((a, w) => a + w.w, 0) + L.space * (line.length - 1);
    let wx = align === "center" ? x - lineW / 2 : x;
    const by = y + li * lh;
    c.save();
    c.beginPath();
    c.rect(0, by - L.size * 0.95 - out * L.size, W, L.size * 1.25); // mask: words rise into it
    c.clip();
    for (const w of line) {
      const p = ease.outExpo(seg(t, t0 + wi * 0.05, t0 + wi * 0.05 + 0.5));
      const dy = (1 - p) * L.size * 0.9 - out * L.size * 1.1;
      const split = (1 - p) * 10 + out * 6;
      c.font = font(weight, L.size, family);
      c.letterSpacing = `${-0.025 * L.size}px`;
      if (split > 0.3) {
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.45 * (1 - p * 0.6);
        c.fillStyle = "#ff1830";
        c.fillText(w.t, wx - split, by + dy);
        c.fillStyle = "#18d0ff";
        c.fillText(w.t, wx + split, by + dy);
        c.globalCompositeOperation = "source-over";
      }
      c.globalAlpha = p * (1 - out);
      c.fillStyle = w.red ? C.red : C.white;
      c.fillText(w.t, wx, by + dy);
      wx += w.w + L.space;
      wi++;
    }
    c.restore();
  });
  c.restore();
}

/** Simple text with optional reveal (0..1 = share of characters shown). */
function text(c, str, x, y, { size = 32, weight = 500, color = C.white, align = "left", alpha = 1, reveal = 1, family = FONT.ui, spacing = 0 } = {}) {
  if (alpha <= 0 || reveal <= 0) return 0;
  const shown = reveal >= 1 ? str : str.slice(0, Math.floor(str.length * reveal));
  c.save();
  c.globalAlpha *= alpha;
  c.font = font(weight, size, family);
  c.letterSpacing = `${spacing}px`;
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(shown, x, y);
  const w = c.measureText(shown).width;
  c.restore();
  return w;
}

function wrap(c, str, maxWidth, size, weight = 500) {
  c.font = font(weight, size);
  c.letterSpacing = "0px";
  const lines = [];
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Dark glass panel with fine border, top highlight and shadow. */
function panel(c, x, y, w, h, { r = 28, alpha = 1, glow = 0, border = C.panelLine } = {}) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  c.shadowColor = glow > 0 ? `rgba(227,6,19,${0.55 * glow})` : "rgba(0,0,0,0.6)";
  c.shadowBlur = glow > 0 ? 60 * glow : 50;
  c.shadowOffsetY = glow > 0 ? 0 : 18;
  rr(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#1B1C21");
  g.addColorStop(1, "#111115");
  c.fillStyle = g;
  c.fill();
  c.shadowColor = "transparent";
  c.lineWidth = 2;
  c.strokeStyle = border;
  c.stroke();
  const hl = c.createLinearGradient(x, y, x + w, y);
  hl.addColorStop(0, "rgba(255,255,255,0)");
  hl.addColorStop(0.5, "rgba(255,255,255,0.18)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = hl;
  c.fillRect(x + r, y + 1, w - 2 * r, 2);
  c.restore();
}

function cursor(c, x, y, press = 0, alpha = 1) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y);
  const s = 1.6 * (1 - press * 0.15);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, 34);
  c.lineTo(9, 26);
  c.lineTo(15, 40);
  c.lineTo(21, 37);
  c.lineTo(15, 24);
  c.lineTo(26, 24);
  c.closePath();
  c.shadowColor = "rgba(0,0,0,0.6)";
  c.shadowBlur = 12;
  c.fillStyle = C.white;
  c.fill();
  c.shadowColor = "transparent";
  c.lineWidth = 2;
  c.strokeStyle = "#111";
  c.stroke();
  c.restore();
}

function ripple(c, x, y, t, t0, { color = C.red, rMax = 260, dur = 0.7 } = {}) {
  const k = seg(t, t0, t0 + dur);
  if (k <= 0 || k >= 1) return;
  c.save();
  for (let i = 0; i < 2; i++) {
    const kk = clamp(k * 1.15 - i * 0.18);
    if (kk <= 0) continue;
    c.globalAlpha = (1 - kk) * 0.8;
    c.lineWidth = 6 * (1 - kk) + 1;
    c.strokeStyle = i ? C.white : color;
    c.beginPath();
    c.arc(x, y, 30 + ease.outCubic(kk) * rMax, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/** Speech-like waveform made of bars, scrolling with time. amp 0..1. */
function waveBars(c, x, y, w, h, t, amp, { color = C.red, seed = 0, gap = 9, bar = 5 } = {}) {
  const n = Math.floor(w / gap);
  c.save();
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const env = Math.sin(Math.PI * u) ** 0.6;
    const v = Math.abs(wave(t * 7 - i * 0.37, seed + i * 0.13)) * 0.8 + 0.2 * Math.abs(Math.sin(i * 1.7 + t * 11 + seed));
    const bh = Math.max(3, h * amp * env * v);
    rr(c, x + i * gap, y - bh / 2, bar, bh, bar / 2);
    c.fill();
  }
  c.restore();
}

/** Smooth glowing line waveform. amp in px. */
function waveLine(c, x0, x1, y, t, amp, { color = C.red, width = 4, glow = 18, seed = 0 } = {}) {
  c.save();
  c.lineWidth = width;
  c.strokeStyle = color;
  c.shadowColor = color;
  c.shadowBlur = glow;
  c.beginPath();
  const n = 140;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const env = Math.sin(Math.PI * u) ** 1.5;
    const yy = y + amp * env * (Math.sin(u * 22 - t * 9 + seed) * 0.6 + Math.sin(u * 51 + t * 13 + seed) * 0.4);
    if (i === 0) c.moveTo(lerp(x0, x1, u), yy);
    else c.lineTo(lerp(x0, x1, u), yy);
  }
  c.stroke();
  c.restore();
}

function pill(c, label, x, y, { size = 26, color = C.red, fg = C.white, padX = 22, h = 50, dot = false, alpha = 1, t = 0 } = {}) {
  if (alpha <= 0) return 0;
  c.save();
  c.globalAlpha *= alpha;
  c.font = font(700, size);
  c.letterSpacing = "2px";
  const tw = c.measureText(label).width + (dot ? 26 : 0);
  const w = tw + padX * 2;
  rr(c, x, y, w, h, h / 2);
  c.fillStyle = color;
  c.fill();
  let tx = x + padX;
  if (dot) {
    c.globalAlpha *= 0.55 + 0.45 * Math.abs(Math.sin(t * 5));
    c.fillStyle = fg;
    c.beginPath();
    c.arc(tx + 8, y + h / 2, 8, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = alpha;
    tx += 26;
  }
  c.fillStyle = fg;
  c.textBaseline = "middle";
  c.fillText(label, tx, y + h / 2 + 1);
  c.restore();
  return w;
}

// ------------------------------------------------------------------ background

function makeParticles() {
  const r = rng(7);
  return Array.from({ length: 170 }, () => ({
    x: r() * W,
    y: r() * H,
    z: 0.2 + r() * 0.8, // depth: near particles move more (parallax)
    s: 0.6 + r() * 2.2,
    vx: (r() - 0.5) * 14,
    vy: -6 - r() * 22,
    red: r() < 0.22,
    ph: r() * 10,
  }));
}

function background(c, t, cam, P, mood) {
  c.fillStyle = C.black;
  c.fillRect(0, 0, W, H);
  // Red cinematic glows (parallax: they move a fraction of the camera)
  const glows = [
    { x: 160, y: 380, r: 720, a: 0.2 },
    { x: 980, y: 1500, r: 820, a: 0.16 },
  ];
  for (const g of glows) {
    const gx = g.x - cam.x * 0.15 + Math.sin(t * 0.4 + g.x) * 40;
    const gy = g.y - cam.y * 0.15 + Math.cos(t * 0.33 + g.y) * 30;
    const grad = c.createRadialGradient(gx, gy, 0, gx, gy, g.r);
    const a = g.a * mood.glow;
    grad.addColorStop(0, `rgba(227,6,19,${a})`);
    grad.addColorStop(1, "rgba(227,6,19,0)");
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
  }
  // Fine perspective grid (very discreet)
  c.save();
  c.globalAlpha = 0.07 * mood.grid;
  c.strokeStyle = C.greyLight;
  c.lineWidth = 1;
  const off = (t * 40 - cam.y * 0.3) % 120;
  for (let y = -120 + off; y < H; y += 120) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  for (let x = ((-cam.x * 0.3) % 120) - 120; x < W; x += 120) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, H);
    c.stroke();
  }
  c.restore();
  // Light streaks (diagonal)
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const k = ((t * 0.18 + i * 0.23) % 1.3) - 0.15;
    const x = lerp(-400, W + 400, k) - cam.x * 0.4;
    const grad = c.createLinearGradient(x - 220, 0, x + 220, 0);
    const red = i % 2 === 0;
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, red ? `rgba(227,6,19,${0.1 * mood.streaks})` : `rgba(255,255,255,${0.045 * mood.streaks})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    c.save();
    c.translate(x, H / 2);
    c.rotate(-0.42);
    c.fillStyle = grad;
    c.fillRect(-220, -H, 440, 2 * H);
    c.restore();
  }
  // Particles
  for (const p of P) {
    const x = (((p.x + p.vx * t - cam.x * p.z * 0.6) % W) + W) % W;
    const y = (((p.y + p.vy * t * (0.5 + p.z) - cam.y * p.z * 0.6) % H) + H) % H;
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + p.ph);
    c.globalAlpha = (0.15 + 0.55 * p.z) * tw * mood.particles;
    c.fillStyle = p.red ? C.red : C.white;
    c.beginPath();
    c.arc(x, y, p.s * (0.6 + p.z), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------------ scenes

/** Scene 1 — the problem: an empty CRM form, text typed then erased, time running. */
function sceneProblem(c, t) {
  if (t < CUES.crmSlam) {
    // black, a faint call indicator
    const a = window01(t, 0.05, CUES.crmSlam, 0.08, 0.05);
    c.save();
    c.globalAlpha = a;
    c.strokeStyle = C.red;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(CX, 960, 40 + 60 * seg(t, 0.05, 0.4), 0, Math.PI * 2);
    c.stroke();
    c.restore();
    return;
  }
  const k = ease.outExpo(seg(t, CUES.crmSlam, CUES.crmSlam + 0.35));
  const shake = (1 - seg(t, CUES.crmSlam, CUES.crmSlam + 0.4)) * 14;
  c.save();
  c.translate(CX + Math.sin(t * 90) * shake, 990 + Math.cos(t * 77) * shake);
  c.scale(lerp(1.14, 1, k), lerp(1.14, 1, k));
  c.translate(-CX, -990);
  const x = SAFE.left + 20;
  const w = CW - 40;
  const y = 560;
  const h = 830;
  panel(c, x, y, w, h, { alpha: k });
  // header
  c.globalAlpha = k;
  rr(c, x, y, w, 76, [28, 28, 0, 0]);
  c.fillStyle = "#1F2026";
  c.fill();
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i === 0 ? C.red : C.metalLight;
    c.beginPath();
    c.arc(x + 36 + i * 30, y + 38, 9, 0, Math.PI * 2);
    c.fill();
  }
  text(c, "CRM — Compte rendu d'appel", x + 140, y + 48, { size: 28, weight: 600, color: C.greyLight });
  // fields
  const fields = ["Motif", "Situation", "Réponse apportée", "Actions à suivre", "Commentaire"];
  const drafts = ["Le client appelle pour…", "Suite à l'appel, le cl…", "Il faut encore préci…"];
  fields.forEach((f, i) => {
    const fy = y + 116 + i * 136;
    text(c, f.toUpperCase(), x + 40, fy, { size: 22, weight: 700, color: C.grey, spacing: 2 });
    rr(c, x + 36, fy + 16, w - 72, 74, 14);
    c.fillStyle = "#0E0E12";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = i === 0 ? "rgba(227,6,19,0.65)" : C.panelLine;
    c.stroke();
  });
  // typed then erased text in the first field, caret blinking
  let typed = "";
  CUES.typingBursts.forEach(([a, b], i) => {
    const [da, db] = CUES.deleteBursts[i];
    const full = drafts[i];
    if (t >= a && t < da) typed = full.slice(0, Math.floor(full.length * seg(t, a, b)));
    else if (t >= da && t < db) typed = full.slice(0, Math.floor(full.length * (1 - seg(t, da, db))));
  });
  const tw = text(c, typed, x + 60, y + 116 + 63, { size: 32, weight: 500, color: C.white });
  if (Math.floor(t * 3.2) % 2 === 0) {
    c.fillStyle = C.white;
    c.fillRect(x + 62 + tw, y + 116 + 36, 3, 36);
  }
  // time counter
  const secs = Math.floor(lerp(0, 252, ease.inCubic(seg(t, 0.5, 4.0))));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const by = y + h - 70;
  text(c, "Saisie manuelle", x + 40, by + 12, { size: 28, weight: 500, color: C.grey });
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 6.3));
  c.globalAlpha = k * pulse;
  c.fillStyle = C.red;
  c.beginPath();
  c.arc(x + w - 210, by + 2, 10, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = k;
  text(c, `${mm}:${ss}`, x + w - 40, by + 14, { size: 40, weight: 800, color: C.white, align: "right", family: FONT.display });
  c.restore();
  headline(c, TEXT.s1a, t, CUES.s1aIn, CUES.s1bIn - 0.02, { y: 360, size: 104 });
  headline(c, TEXT.s1b, t, CUES.s1bIn, 3.98, { y: 360, size: 116 });
}

const START_BTN = { x: CX, y: 1000, r: 150 };

function startButton(c, t, { listening, appear, press }) {
  const s = ease.outBack(appear) * (1 - press * 0.08);
  if (s <= 0) return;
  const move = ease.inOutCubic(seg(t, 5.25, 5.75)); // goes up once the capture is running
  const by = lerp(START_BTN.y, 760, move);
  const r = START_BTN.r * lerp(1, 0.72, move);
  c.save();
  c.translate(START_BTN.x, by);
  c.scale(s, s);
  // halo
  const halo = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.1);
  halo.addColorStop(0, `rgba(227,6,19,${0.35 + 0.15 * Math.sin(t * 4)})`);
  halo.addColorStop(1, "rgba(227,6,19,0)");
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, r * 2.1, 0, Math.PI * 2);
  c.fill();
  // body
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#FF2A36");
  g.addColorStop(1, C.redDeep);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.stroke();
  if (listening) {
    // live rings
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.9 + i / 3) % 1;
      c.globalAlpha = (1 - k) * 0.6;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, r + 10 + k * 90, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    // microphone glyph
    c.fillStyle = C.white;
    rr(c, -r * 0.14, -r * 0.42, r * 0.28, r * 0.5, r * 0.14);
    c.fill();
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.arc(0, -r * 0.08, r * 0.24, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
    c.fillRect(-r * 0.03, r * 0.16, r * 0.06, r * 0.18);
  } else {
    c.fillStyle = C.white;
    c.beginPath(); // play triangle
    c.moveTo(-r * 0.2, -r * 0.32);
    c.lineTo(r * 0.34, 0);
    c.lineTo(-r * 0.2, r * 0.32);
    c.closePath();
    c.fill();
  }
  c.restore();
  text(c, listening ? "ÉCOUTE EN COURS" : TEXT.start, START_BTN.x, by + r * s + 78,
       { size: 44, weight: 800, align: "center", spacing: 4, alpha: clamp(appear * 2), family: FONT.display });
}

/** Scene 2 — the solution: the advisor clicks « Démarrer », listening starts. */
function sceneSolution(c, t) {
  if (t < CUES.redPulse) return; // hard cut: silence and black
  // red impulse
  const pk = seg(t, CUES.redPulse, CUES.redPulse + 0.9);
  if (pk < 1) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(CX, 1000, 0, CX, 1000, 200 + 1100 * ease.outCubic(pk));
    g.addColorStop(0, `rgba(227,6,19,${0.55 * (1 - pk)})`);
    g.addColorStop(0.7, `rgba(227,6,19,${0.18 * (1 - pk)})`);
    g.addColorStop(1, "rgba(227,6,19,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();
    ripple(c, CX, 1000, t, CUES.redPulse, { rMax: 700, dur: 0.9 });
  }
  const appear = seg(t, CUES.startAppear, CUES.startAppear + 0.45);
  const press = window01(t, CUES.startClick - 0.04, CUES.startClick + 0.14, 0.04, 0.1);
  const listening = t >= CUES.startClick + 0.06;
  // waveform appears under the button once listening
  const wk = ease.outCubic(seg(t, CUES.waveOn, CUES.waveOn + 0.6));
  if (wk > 0) {
    waveBars(c, SAFE.left + 30, 1080, CW - 60, 240, t, wk * (0.55 + 0.45 * Math.abs(wave(t * 1.3, 2))),
             { color: C.red, seed: 3 });
    waveLine(c, SAFE.left + 30, SAFE.right - 30, 1080, t, 50 * wk, { color: C.white, width: 3, glow: 14, seed: 1 });
  }
  startButton(c, t, { listening, appear, press });
  ripple(c, START_BTN.x, START_BTN.y, t, CUES.startClick, { rMax: 320 });
  // cursor comes to the button and clicks
  const ck = ease.inOutCubic(seg(t, 4.45, 4.98));
  const cOut = seg(t, 5.3, 5.6);
  cursor(c, lerp(820, START_BTN.x + 20, ck), lerp(1500, START_BTN.y + 10, ck), press, appear * (1 - cOut));
  // the advisor stays in control
  const bk = ease.outCubic(seg(t, 5.55, 5.95));
  if (bk > 0) {
    c.save();
    c.globalAlpha = bk;
    c.font = font(700, 26);
    c.letterSpacing = "2px";
    const label = "CAPTURE LANCÉE PAR LE CONSEILLER";
    const w = c.measureText(label).width + 80;
    c.restore();
    pill(c, label, CX - w / 2, 1290 + (1 - bk) * 30, { color: "rgba(255,255,255,0.08)", dot: true, alpha: bk, t, size: 26 });
  }
  headline(c, TEXT.s2, t, CUES.s2TextIn, 6.98, { y: 360, size: 112 });
}

/** Scene 3/4 shared: the two audio tracks. */
function tracks(c, t, x, y, w, amp) {
  panel(c, x, y, w, 270);
  const speaking = (who) => CONVERSATION.some((l) => l.speaker === who && t >= l.start - 0.05 && t <= l.end + 0.1);
  const rows = [
    { who: "remote", label: "INTERLOCUTEUR · son du PC", y: y + 82, color: C.white },
    { who: "advisor", label: "CONSEILLER · micro", y: y + 190, color: C.red },
  ];
  for (const r of rows) {
    const live = speaking(r.who);
    text(c, r.label, x + 36, r.y - 36, { size: 22, weight: 700, color: live ? C.white : C.grey, spacing: 2 });
    const a = amp * (live ? 1 : 0.12);
    waveBars(c, x + 36, r.y + 14, w - 72, 70, t, a, { color: r.color, seed: r.who === "remote" ? 5 : 9, gap: 8, bar: 4 });
  }
}

/** Partial (grey) then final (white) transcript lines, word by word. */
function transcript(c, t, x, y, w, { fade = 1, finalizeAll = false } = {}) {
  let cy = y;
  const out = [];
  for (const line of CONVERSATION) {
    if (t < line.start) break;
    const words = line.text.split(" ");
    const k = finalizeAll ? 1 : seg(t, line.start, line.end);
    const shown = words.slice(0, Math.max(1, Math.ceil(words.length * k))).join(" ");
    const final = finalizeAll || t > line.end + 0.12;
    const lineIn = ease.outCubic(seg(t, line.start, line.start + 0.3));
    c.save();
    c.globalAlpha *= fade * lineIn;
    const who = line.speaker === "remote" ? "Interlocuteur" : "Conseiller";
    text(c, who.toUpperCase(), x, cy, { size: 24, weight: 800, color: line.speaker === "remote" ? C.white : C.red, spacing: 2 });
    const lines = wrap(c, shown, w, 36, 600);
    lines.forEach((l, i) => {
      text(c, l, x, cy + 50 + i * 47, { size: 36, weight: final ? 600 : 500, color: final ? C.white : C.grey });
    });
    out.push({ x, y: cy, h: 50 + lines.length * 47 });
    c.restore();
    cy += 64 + lines.length * 47;
  }
  return out;
}

/** Scene 3 — listening and live transcription. */
function sceneTranscription(c, t) {
  const x = SAFE.left + 10;
  const w = CW - 20;
  const amp = 0.9;
  pill(c, "EN DIRECT", CX - 105, 216, { dot: true, t, alpha: seg(t, 7.05, 7.3), size: 24, h: 44 });
  headline(c, TEXT.s3, t, 7.1, 13.12, { y: 326, size: 78 });
  tracks(c, t, x, 470, w, amp);
  panel(c, x, 770, w, 640);
  text(c, "TRANSCRIPTION", x + 36, 830, { size: 22, weight: 800, color: C.grey, spacing: 3 });
  transcript(c, t, x + 36, 880, w - 72);
  // live indicator
  const dots = ".".repeat(1 + (Math.floor(t * 3) % 3));
  text(c, `Transcription en cours${dots}`, x + 36, 1375, { size: 26, weight: 500, color: C.red });
  text(c, TEXT.fictive, x + w - 36, 1375, { size: 22, weight: 500, color: C.grey, align: "right" });
}

/** Scene 4 — « Fin », the waves stop, the transcription becomes a structured note. */
function sceneGeneration(c, t) {
  const x = SAFE.left + 10;
  const w = CW - 20;
  headline(c, TEXT.s3, t, 7.1, 13.12, { y: 326, size: 78 }); // same call as scene 3: continuous exit
  pill(c, "EN DIRECT", CX - 105, 216, { dot: true, t, alpha: 1 - seg(t, 13.0, 13.25), size: 24, h: 44 });
  headline(c, TEXT.s4, t, 13.15, 17.85, { y: 320, size: 92 });
  const [tf0, tf1] = CUES.transform;
  const collapse = ease.inOutCubic(seg(t, tf0, tf1));
  // tracks: amplitude falls to a flat line, then the panel folds away
  const amp = 0.9 * (1 - ease.outCubic(seg(t, CUES.waveOff[0], CUES.waveOff[1])));
  c.save();
  c.globalAlpha = 1 - ease.outCubic(seg(t, tf0, tf0 + 0.35));
  c.translate(0, collapse * 90); // folds down, away from the title
  tracks(c, t, x, 470, w, amp);
  // « FIN » button with click
  const press = window01(t, CUES.endClick - 0.04, CUES.endClick + 0.14, 0.04, 0.1);
  const fx = x + w - 180;
  const fy = 492;
  c.save();
  c.translate(fx + 75, fy + 27);
  c.scale(1 - press * 0.1, 1 - press * 0.1);
  rr(c, -75, -27, 150, 54, 27);
  c.fillStyle = t > CUES.endClick ? C.white : C.red;
  c.fill();
  c.fillStyle = t > CUES.endClick ? C.red : C.white;
  c.fillRect(-48, -9, 18, 18);
  c.font = font(800, 26);
  c.textBaseline = "middle";
  c.fillText(TEXT.end, -16, 2);
  c.restore();
  ripple(c, fx + 75, fy + 27, t, CUES.endClick, { rMax: 160, dur: 0.5 });
  c.restore();
  const cin = seg(t, 13.0, 13.25);
  const cout = seg(t, 13.5, 13.8);
  cursor(c, lerp(720, fx + 70, ease.outCubic(cin)), lerp(900, fy + 30, ease.outCubic(cin)), press, cin * (1 - cout));
  // transcription panel → note panel
  const py = lerp(770, 560, collapse);
  const ph = lerp(640, 830, collapse);
  const glow = window01(t, tf0, tf1 + 0.6, 0.2, 0.6);
  panel(c, x, py, w, ph, { glow, border: glow > 0.05 ? "rgba(227,6,19,0.8)" : C.panelLine });
  const lines = transcript(c, t, x + 36, py + 110, w - 72, { fade: 1 - ease.inCubic(seg(t, tf0, tf0 + 0.45)), finalizeAll: t > CUES.endClick + 0.3 });
  const done = t > CUES.endClick + 0.3;
  text(c, done ? "Transcription finalisée ✓" : "Transcription en cours...", x + 36, py + ph - 35,
       { size: 26, weight: 500, color: done ? C.white : C.red, alpha: 1 - seg(t, tf0, tf0 + 0.3) });
  // particles: the words fly to the fields
  if (t >= tf0 && t < tf1 + 0.5) {
    const r = rng(42);
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 260; i++) {
      const src = lines[i % Math.max(1, lines.length)] || { x: x + 40, y: py + 150, h: 80 };
      const sx = src.x + r() * (w - 80);
      const sy = src.y + 20 + r() * src.h;
      const target = GENERATED_FIELDS[i % GENERATED_FIELDS.length];
      const fi = GENERATED_FIELDS.indexOf(target);
      const tx = x + 60 + r() * (w - 140);
      const ty = 560 + 150 + fi * 160 + r() * 40;
      const delay = r() * 0.35;
      const k = ease.inOutCubic(seg(t, tf0 + delay, tf0 + delay + 0.55));
      const swirl = Math.sin(k * Math.PI) * (r() - 0.5) * 260;
      const px = lerp(sx, tx, k) + swirl;
      const pyy = lerp(sy, ty, k) - Math.sin(k * Math.PI) * 120 * r();
      const a = Math.sin(k * Math.PI) * (1 - seg(t, tf1 + 0.2, tf1 + 0.5));
      c.globalAlpha = a;
      c.fillStyle = i % 4 === 0 ? C.red : C.white;
      c.beginPath();
      c.arc(px, pyy, 1.5 + r() * 2.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  // structured fields
  if (t >= tf1 - 0.1) {
    const hk = seg(t, tf1 - 0.1, tf1 + 0.3);
    text(c, "PHONE CALL", x + 36, py + 70, { size: 28, weight: 800, color: C.white, spacing: 3, alpha: hk });
    pill(c, "GÉNÉRÉ PAR L'IA", x + w - 290, py + 34, { size: 20, h: 42, alpha: hk });
    GENERATED_FIELDS.forEach((f, i) => {
      const k = seg(t, f.at, f.at + 0.4);
      if (k <= 0) return;
      const fy = py + 150 + i * 160;
      const pop = ease.outBack(clamp(k * 1.4));
      c.save();
      c.globalAlpha = clamp(k * 2);
      c.translate(0, (1 - pop) * 30);
      rr(c, x + 30, fy - 8, w - 60, 136, 18);
      c.fillStyle = "rgba(255,255,255,0.035)";
      c.fill();
      const flash = 1 - seg(t, f.at, f.at + 0.6);
      c.fillStyle = C.red;
      c.fillRect(x + 30, fy - 8, 6, 136);
      if (flash > 0) {
        c.globalAlpha = flash * 0.5;
        rr(c, x + 30, fy - 8, w - 60, 136, 18);
        c.strokeStyle = C.red;
        c.lineWidth = 3;
        c.stroke();
        c.globalAlpha = clamp(k * 2);
      }
      text(c, f.label.toUpperCase(), x + 64, fy + 40, { size: 24, weight: 800, color: C.grey, spacing: 2 });
      text(c, f.value, x + 64, fy + 96, { size: 40, weight: 700, color: C.white, reveal: seg(t, f.at + 0.05, f.at + 0.45) });
      c.restore();
    });
    // shimmer sweep across the panel during generation
    const sk = seg(t, tf1, 17.2);
    if (sk > 0 && sk < 1) {
      c.save();
      rr(c, x, py, w, ph, 28);
      c.clip();
      const sy = lerp(py - 100, py + ph + 100, sk);
      const g = c.createLinearGradient(0, sy - 80, 0, sy + 80);
      g.addColorStop(0, "rgba(227,6,19,0)");
      g.addColorStop(0.5, "rgba(227,6,19,0.22)");
      g.addColorStop(1, "rgba(227,6,19,0)");
      c.fillStyle = g;
      c.fillRect(x, sy - 80, w, 160);
      c.restore();
    }
  }
}

/** The Phone Call note card (scenes 5 and 6). Long values go on a second line. */
function noteCard(c, t, { x, y, w, typing, copyState }) {
  const rowH = 56;
  const extra = 36;
  c.save();
  c.letterSpacing = "0px";
  const rows = NOTE.rows.map((row) => {
    if (row.section) return { ...row, h: rowH };
    c.font = font(700, 27);
    const lw = c.measureText(`${row.label} :`).width;
    const value = row.value ?? NOTE.absent;
    c.font = font(600, 27);
    const fits = c.measureText(value).width <= w - 80 - lw - 14;
    return { ...row, lw, value, fits, h: fits ? rowH : rowH + extra };
  });
  c.restore();
  const h = 146 + rows.reduce((a, r) => a + r.h, 0) + 14;
  noteCard.lastHeight = h;
  panel(c, x, y, w, h, { glow: 0.25 });
  // header
  text(c, "PHONE CALL", x + 40, y + 76, { size: 34, weight: 900, color: C.white, spacing: 4, family: FONT.display });
  pill(c, NOTE.header, x + w - 210, y + 38, { size: 24, h: 50 });
  text(c, TEXT.fictiveNote, x + 40, y + 116, { size: 22, weight: 500, color: C.grey });
  c.fillStyle = C.panelLine;
  c.fillRect(x + 40, y + 136, w - 80, 2);
  const [t0, t1] = typing;
  const per = (t1 - t0) / rows.length;
  let ry = y + 146;
  rows.forEach((row, i) => {
    const k = seg(t, t0 + i * per, t0 + (i + 0.9) * per);
    const top = ry;
    ry += row.h;
    if (k <= 0) return;
    if (row.section) {
      text(c, row.section.toUpperCase(), x + 40, top + 42, { size: 22, weight: 800, color: C.red, spacing: 3, alpha: clamp(k * 3) });
      return;
    }
    if (k < 1) {
      rr(c, x + 24, top + 6, w - 48, row.h - 6, 12);
      c.fillStyle = "rgba(227,6,19,0.12)";
      c.fill();
    }
    text(c, `${row.label} :`, x + 40, top + 42, { size: 27, weight: 700, color: C.greyLight, alpha: clamp(k * 3) });
    const vx = row.fits ? x + 40 + row.lw + 14 : x + 40;
    const vy = row.fits ? top + 42 : top + 42 + extra;
    text(c, row.value, vx, vy, {
      size: 27, weight: row.value === NOTE.absent ? 400 : 600, color: row.value === NOTE.absent ? C.grey : C.white,
      reveal: seg(k, 0.25, 1),
    });
  });
  // copy button
  if (copyState) {
    const { appear, press, copied } = copyState;
    const bw = 520;
    const bx = x + (w - bw) / 2;
    const by = y + h + 22;
    c.save();
    c.globalAlpha = appear;
    c.translate(bx + bw / 2, by + 38);
    c.scale(1 - press * 0.06, 1 - press * 0.06);
    rr(c, -bw / 2, -38, bw, 76, 38);
    c.fillStyle = copied ? C.white : C.red;
    c.fill();
    c.fillStyle = copied ? C.red : C.white;
    c.font = font(800, 30);
    c.letterSpacing = "3px";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(copied ? `✓  ${TEXT.copied}` : TEXT.copy, 0, 2);
    c.restore();
    return { h: h + 22 + 76, button: { x: bx + bw / 2, y: by + 38 } };
  }
  return { h };
}

/** Scene 5 — the complete Phone Call note. */
function sceneNote(c, t) {
  headline(c, TEXT.s5, t, 18.1, 23.95, { y: 330, size: 92 });
  const x = SAFE.left + 10;
  const w = CW - 20;
  const appear = seg(t, 21.7, 22.0);
  const press = window01(t, CUES.copyClick - 0.04, CUES.copyClick + 0.14, 0.04, 0.1);
  const copied = t >= CUES.copied;
  const card = noteCard(c, t, { x, y: 462, w, typing: CUES.noteTyping, copyState: { appear, press, copied } });
  if (card.button) {
    ripple(c, card.button.x, card.button.y, t, CUES.copyClick, { rMax: 300, dur: 0.6 });
    const cin = seg(t, 21.85, 22.3);
    const cout = seg(t, 22.7, 23.0);
    cursor(c, lerp(840, card.button.x + 40, ease.outCubic(cin)), lerp(1700, card.button.y + 6, ease.outCubic(cin)), press, cin * (1 - cout));
  }
}

/** Scene 6 — the result: validated note. */
function sceneResult(c, t) {
  const move = ease.inOutCubic(seg(t, 24.0, 24.45));
  const s = lerp(1, 0.8, move);
  const x = SAFE.left + 10;
  const w = CW - 20;
  c.save();
  c.translate(CX, lerp(470, 560, move));
  c.scale(s, s);
  c.translate(-CX, -470);
  noteCard(c, t, { x, y: 470, w, typing: [0, 0.1] });
  c.restore();
  // light sweep on the card
  const sk = seg(t, 24.35, 25.1);
  if (sk > 0 && sk < 1) {
    c.save();
    c.translate(CX, lerp(470, 560, move));
    c.scale(s, s);
    c.translate(-CX, -470);
    rr(c, x, 470, w, noteCard.lastHeight || 900, 28);
    c.clip();
    c.globalCompositeOperation = "lighter";
    const sx = lerp(x - 200, x + w + 200, sk);
    const g = c.createLinearGradient(sx - 150, 0, sx + 150, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(x, 470, w, 1200);
    c.restore();
  }
  // validation badge
  const vk = seg(t, CUES.validate, CUES.validate + 0.6);
  if (vk > 0) {
    const bx = SAFE.right - 120;
    const by = 1290;
    const pop = ease.outBack(clamp(vk * 1.6));
    c.save();
    c.translate(bx, by);
    c.scale(pop, pop);
    c.shadowColor = "rgba(227,6,19,0.8)";
    c.shadowBlur = 40;
    c.fillStyle = C.red;
    c.beginPath();
    c.arc(0, 0, 86, 0, Math.PI * 2);
    c.fill();
    c.shadowColor = "transparent";
    c.lineWidth = 6;
    c.strokeStyle = C.white;
    c.beginPath();
    c.arc(0, 0, 86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ease.outCubic(seg(t, CUES.validate, CUES.validate + 0.5)));
    c.stroke();
    // check mark drawn progressively
    const ck = ease.outCubic(seg(t, CUES.validate + 0.15, CUES.validate + 0.5));
    c.lineWidth = 14;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    const pts = [[-38, 2], [-10, 30], [40, -26]];
    const total = 2;
    const drawn = ck * total;
    c.moveTo(...pts[0]);
    for (let i = 1; i <= Math.ceil(drawn); i++) {
      const kk = Math.min(1, drawn - (i - 1));
      c.lineTo(lerp(pts[i - 1][0], pts[i][0], kk), lerp(pts[i - 1][1], pts[i][1], kk));
    }
    c.stroke();
    c.restore();
    text(c, "NOTE PRÊTE", bx, by + 140, { size: 30, weight: 900, color: C.white, align: "center", spacing: 3, alpha: seg(t, CUES.validate + 0.3, CUES.validate + 0.6), family: FONT.display });
  }
  headline(c, TEXT.s6a, t, 24.15, CUES.s6bIn - 0.02, { y: 360, size: 120 });
  headline(c, TEXT.s6b, t, CUES.s6bIn, 26.98, { y: 330, size: 110 });
}

/** Rounded rectangle path sampled by arc length (for the drawing line of the signature). */
function rectPoint(x, y, w, h, u) {
  const P = 2 * (w + h);
  let d = (u % 1) * P;
  if (d < w) return [x + d, y];
  d -= w;
  if (d < h) return [x + w, y + d];
  d -= h;
  if (d < w) return [x + w - d, y + h];
  d -= w;
  return [x, y + h - d];
}

/** Scene 7 — signature. */
function sceneSignature(c, t) {
  const bx = SAFE.left + 50;
  const bw = CW - 100;
  const by = 700;
  const bh = 560;
  const [l0, l1] = CUES.lineDraw;
  // the sound wave flattens into a line, then draws the outline of an interface
  const flat = ease.outCubic(seg(t, 27.0, 27.25));
  if (t < l0 + 0.35) {
    const fade = 1 - seg(t, l0 + 0.15, l0 + 0.35);
    c.save();
    c.globalAlpha = fade;
    waveLine(c, SAFE.left, SAFE.right, 960, t, 150 * (1 - flat) + 6, { color: C.red, width: 8, glow: 40 });
    waveLine(c, SAFE.left + 40, SAFE.right - 40, 960, t + 0.3, 90 * (1 - flat) + 3, { color: C.white, width: 3, glow: 20, seed: 2 });
    c.restore();
  }
  const dk = ease.inOutCubic(seg(t, l0, l1));
  if (dk > 0) {
    c.save();
    c.lineWidth = 5;
    c.strokeStyle = C.red;
    c.shadowColor = C.red;
    c.shadowBlur = 30;
    c.lineCap = "round";
    c.beginPath();
    const n = 240;
    for (let i = 0; i <= n * dk; i++) {
      const [px, py] = rectPoint(bx, by, bw, bh, i / n);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
    // spark at the head of the line
    if (dk < 1) {
      const [hx, hy] = rectPoint(bx, by, bw, bh, dk);
      const g = c.createRadialGradient(hx, hy, 0, hx, hy, 60);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(227,6,19,0)");
      c.fillStyle = g;
      c.fillRect(hx - 60, hy - 60, 120, 120);
    }
    c.restore();
  }
  // logo with impact
  const lk = seg(t, CUES.logoImpact, CUES.logoImpact + 0.5);
  if (lk > 0) {
    const s = lerp(1.25, 1, ease.outExpo(lk));
    c.save();
    c.translate(CX, by + 250);
    c.scale(s, s);
    c.globalAlpha = clamp(lk * 3);
    let size = 112;
    let wa;
    let wb;
    const a = "PHONE CALL ";
    const b = "AI";
    do {
      c.font = font(900, size, FONT.display);
      c.letterSpacing = `${-0.025 * size}px`;
      wa = c.measureText(a).width;
      wb = c.measureText(b).width;
      size -= 2;
    } while (wa + wb > bw - 110 && size > 40);
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
    c.shadowColor = "rgba(227,6,19,0.6)";
    c.shadowBlur = 40 * (1 - lk) + 10;
    c.fillStyle = C.white;
    c.fillText(a, -(wa + wb) / 2, 0);
    c.fillStyle = C.red;
    c.fillText(b, -(wa + wb) / 2 + wa, 0);
    c.restore();
    c.save();
    c.globalAlpha = clamp(lk * 2) * 0.9;
    c.fillStyle = C.red;
    c.fillRect(CX - 60 * ease.outCubic(lk), by + 290, 120 * ease.outCubic(lk), 4);
    c.restore();
  }
  headline(c, TEXT.sign1, t, CUES.sign1In, 31, { y: by + 400, size: 54, weight: 800 });
  headline(c, TEXT.sign2, t, CUES.sign2In, 31, { y: by + 470, size: 54, weight: 800 });
}

// ------------------------------------------------------------------ camera, transitions, post

/** Camera of the content layer: x/y offset (px), scale. */
function camera(t) {
  let x = 0;
  let y = 0;
  let s = 1;
  // slow cinematic push-in on every scene
  const sc = sceneAt(SCENES, t);
  s *= 1 + 0.025 * ease.inOutCubic(sc.k);
  // whip 2 → 3: the content leaves to the left, the next one comes from the right
  if (t < 7) x += -1150 * ease.inQuint(seg(t, 6.82, 7.0));
  else x += 1150 * (1 - ease.outQuint(seg(t, 7.0, 7.2)));
  // zoom through 4 → 5
  if (t < 18) s *= lerp(1, 2.6, ease.inQuint(seg(t, 17.72, 18.0)));
  else s *= lerp(0.62, 1, ease.outQuint(seg(t, 18.0, 18.35)));
  // pull back 5 → 6 (soft)
  y += -40 * ease.inOutCubic(seg(t, 23.9, 24.2)) * (1 - seg(t, 24.2, 24.5));
  // signature: slow push-in
  s *= t >= 27 ? 1 + 0.035 * ease.inOutCubic(seg(t, 27.5, 30)) : 1;
  // problem: tension, small drift
  if (t < 4) {
    x += Math.sin(t * 1.7) * 6;
    y += Math.cos(t * 1.3) * 6;
  }
  return { x, y, s };
}

function drawScene(c, t) {
  if (t < 4) sceneProblem(c, t);
  else if (t < 7) sceneSolution(c, t);
  else if (t < 13) sceneTranscription(c, t);
  else if (t < 18) sceneGeneration(c, t);
  else if (t < 24) sceneNote(c, t);
  else if (t < 27) sceneResult(c, t);
  else sceneSignature(c, t);
}

function mood(t) {
  if (t < 4) return { glow: 0.35, grid: 1.2, streaks: 0.4, particles: 0.5 };
  if (t < 4.18) return { glow: 0, grid: 0, streaks: 0, particles: 0 };
  if (t >= 27) return { glow: 0.85, grid: 0.3, streaks: 0.6, particles: 0.9 };
  return { glow: 1, grid: 0.8, streaks: 1, particles: 1 };
}

export function createRenderer(canvas, { debugSafe = false } = {}) {
  const main = canvas.getContext("2d");
  const layer = new OffscreenCanvas(W, H);
  const L = layer.getContext("2d");
  const accum = new OffscreenCanvas(W, H);
  const A = accum.getContext("2d");
  const bloom = new OffscreenCanvas(W / 4, H / 4);
  const B = bloom.getContext("2d");
  const particles = makeParticles();
  // film grain tiles (seeded)
  const grains = Array.from({ length: 6 }, (_, k) => {
    const g = new OffscreenCanvas(256, 256);
    const gc = g.getContext("2d");
    const img = gc.createImageData(256, 256);
    const r = rng(100 + k);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    return g;
  });
  // vignette
  const vig = new OffscreenCanvas(W, H);
  {
    const vc = vig.getContext("2d");
    const g = vc.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.72)");
    vc.fillStyle = g;
    vc.fillRect(0, 0, W, H);
  }

  function composite(cam) {
    main.save();
    main.translate(W / 2 + cam.x, H / 2 + cam.y);
    main.scale(cam.s, cam.s);
    main.translate(-W / 2, -H / 2);
    main.drawImage(layer, 0, 0);
    main.restore();
  }

  return function render(t) {
    const frame = Math.round(t * VIDEO.fps);
    const cam = camera(t);
    // 1. background
    main.save();
    main.globalAlpha = 1;
    main.globalCompositeOperation = "source-over";
    background(main, t, cam, particles, mood(t));
    main.restore();
    // 2. content layer
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.clearRect(0, 0, W, H);
    L.globalAlpha = 1;
    drawScene(L, t);
    // 3. composite with motion blur (average of sub-frame camera positions when it moves fast)
    const prev = camera(t - 1 / (VIDEO.fps * 2));
    const speed = Math.hypot(cam.x - prev.x, cam.y - prev.y) + Math.abs(cam.s - prev.s) * 900;
    const samples = speed > 3 ? Math.min(10, Math.ceil(speed / 5)) : 1;
    if (samples === 1) composite(cam);
    else {
      A.setTransform(1, 0, 0, 1, 0, 0);
      A.clearRect(0, 0, W, H);
      for (let i = 0; i < samples; i++) {
        const k = i / (samples - 1);
        const cm = { x: lerp(prev.x, cam.x, k), y: lerp(prev.y, cam.y, k), s: lerp(prev.s, cam.s, k) };
        A.save();
        A.globalAlpha = 1 / (i + 1); // running average of the samples
        A.translate(W / 2 + cm.x, H / 2 + cm.y);
        A.scale(cm.s, cm.s);
        A.translate(-W / 2, -H / 2);
        A.drawImage(layer, 0, 0);
        A.restore();
      }
      main.drawImage(accum, 0, 0);
    }
    // 4. post
    // flashes on the big cuts
    const flash = Math.max(
      window01(t, CUES.crmSlam - 0.02, CUES.crmSlam + 0.16, 0.02, 0.14) * 0.55,
      window01(t, 17.95, 18.12, 0.05, 0.12) * 0.5,
      window01(t, 26.92, 27.4, 0.04, 0.4) * 0.5,
      window01(t, CUES.logoImpact - 0.01, CUES.logoImpact + 0.18, 0.01, 0.17) * 0.35,
    );
    if (flash > 0) {
      main.save();
      main.globalCompositeOperation = "lighter";
      main.fillStyle = t > 26 && t < 27.45 ? `rgba(227,6,19,${flash})` : `rgba(255,255,255,${flash})`;
      main.fillRect(0, 0, W, H);
      main.restore();
    }
    // discreet bloom (blurred quarter-size copy added on top)
    B.setTransform(1, 0, 0, 1, 0, 0);
    B.clearRect(0, 0, W / 4, H / 4);
    B.filter = "blur(6px) brightness(0.9)";
    B.drawImage(canvas, 0, 0, W / 4, H / 4);
    B.filter = "none";
    main.save();
    main.globalCompositeOperation = "lighter";
    main.globalAlpha = 0.14;
    main.drawImage(bloom, 0, 0, W, H);
    main.restore();
    main.drawImage(vig, 0, 0);
    // film grain
    main.save();
    main.globalCompositeOperation = "soft-light";
    main.globalAlpha = 0.09;
    const g = grains[frame % grains.length];
    const r = rng(frame + 1);
    const ox = Math.floor(r() * 256);
    const oy = Math.floor(r() * 256);
    main.translate(-ox, -oy);
    main.fillStyle = main.createPattern(g, "repeat");
    main.fillRect(0, 0, W + 256, H + 256);
    main.restore();
    if (debugSafe) {
      main.save();
      main.strokeStyle = "#00ff88";
      main.lineWidth = 3;
      main.setLineDash([16, 10]);
      main.strokeRect(SAFE.left, SAFE.top, SAFE.right - SAFE.left, SAFE.bottom - SAFE.top);
      main.restore();
    }
  };
}
