// Textures générées sur canevas : aucune image externe n'est nécessaire.
import * as THREE from 'three';
import { fbm2, rng } from '../core/math';

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Point lumineux doux (particules, halos). */
export const softDot = () =>
  cached('dot', () => {
    const [c, g] = canvas(64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return tex(c, false);
  });

/** Volute de nuage / brume (bruit fractal dans un disque doux). */
export const cloudPuff = () =>
  cached('cloud', () => {
    const S = 128;
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        const n = fbm2(x / 28, y / 28, 5) * 0.5 + 0.5;
        const a = Math.max(0, 1 - d * (1.05 - n * 0.4)) ** 1.6 * (0.55 + n * 0.6);
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(255, a * 255);
      }
    g.putImageData(img, 0, 0);
    return tex(c, false);
  });

/** Plume : rachis central et vexille, transparence par alphaTest. */
export const featherTex = () =>
  cached('feather', () => {
    const W = 64, H = 256;
    const [c, g] = canvas(W, H);
    const r = rng(7);
    g.clearRect(0, 0, W, H);
    // vexille
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.bezierCurveTo(W * 0.98, H * 0.15, W * 0.98, H * 0.85, W / 2, H);
    g.bezierCurveTo(W * 0.02, H * 0.85, W * 0.02, H * 0.15, W / 2, 0);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#f2f2f2');
    gr.addColorStop(0.55, '#d0d0d0');
    gr.addColorStop(1, '#9a9a9a');
    g.fillStyle = gr;
    g.fill();
    // barbes
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 12; i++) {
      const y = r.range(H * 0.08, H * 0.9);
      const side = r.sign();
      g.lineWidth = r.range(0.5, 1.1);
      g.beginPath();
      g.moveTo(W / 2 + side * r.range(4, 14), y);
      g.lineTo(W / 2 + side * W, y - r.range(10, 30));
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(40,30,20,0.55)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, H);
    g.stroke();
    return tex(c);
  });

/** Petite texture de pierre en niveaux de gris, répétable. */
export const stoneTex = () =>
  cached('stone', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        // bruit périodique (tore) pour un raccord parfait
        const a = (x / S) * Math.PI * 2, b = (y / S) * Math.PI * 2;
        const n = fbm2(Math.cos(a) * 1.6 + Math.sin(b) * 0.7 + 10, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, 6);
        const v = 150 + n * 90;
        const i = (y * S + x) * 4;
        img.data[i] = v; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c, true, true);
  });

/** Dallage de pierre (sol de cathédrale, place). */
export const flagstoneTex = () =>
  cached('flag', () => {
    const S = 512;
    const [c, g] = canvas(S);
    g.drawImage(stoneTex().image as HTMLCanvasElement, 0, 0, S, S);
    const r = rng(21);
    g.strokeStyle = 'rgba(10,8,8,0.75)';
    g.lineWidth = 3;
    const rows = 4;
    for (let j = 0; j < rows; j++) {
      const y = (j * S) / rows;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      const off = j % 2 ? S / 6 : 0;
      for (let i = 0; i < 3; i++) {
        const x = off + (i * S) / 3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + S / rows); g.stroke();
      }
    }
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(0,0,0,${r.range(0.03, 0.12)})`;
      g.beginPath();
      g.arc(r.range(0, S), r.range(0, S), r.range(10, 50), 0, Math.PI * 2);
      g.fill();
    }
    return tex(c, true, true);
  });

/** Glyphes runiques anguleux, dessinés à la volée. */
function drawRune(g: CanvasRenderingContext2D, x: number, y: number, s: number, r: ReturnType<typeof rng>) {
  g.beginPath();
  const n = r.int(2, 4);
  g.moveTo(x, y - s);
  g.lineTo(x, y + s);
  for (let k = 0; k < n; k++) {
    const yy = y + r.range(-s, s * 0.6);
    g.moveTo(x, yy);
    g.lineTo(x + r.sign() * s * r.range(0.4, 0.8), yy + r.sign() * s * r.range(0.2, 0.6));
  }
  g.stroke();
}

/** Cercle runique (magie, invocation). */
export const runeCircleTex = (seed = 3) =>
  cached('runecircle' + seed, () => {
    const S = 512;
    const [c, g] = canvas(S);
    const r = rng(seed);
    g.translate(S / 2, S / 2);
    g.strokeStyle = '#ffffff';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 6;
    const ring = (rad: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); };
    ring(246, 5); ring(232, 2); ring(178, 3); ring(166, 1.5); ring(70, 3);
    // runes entre les anneaux
    g.lineWidth = 3;
    const count = 24;
    for (let i = 0; i < count; i++) {
      g.save();
      g.rotate((i / count) * Math.PI * 2);
      drawRune(g, 0, -205, 14, r);
      g.restore();
    }
    // étoile / pentagramme intérieur
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2;
      const px = Math.cos(a) * 166, py = Math.sin(a) * 166;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7 - Math.PI / 2;
      g.beginPath(); g.arc(Math.cos(a) * 120, Math.sin(a) * 120, 16, 0, Math.PI * 2); g.stroke();
    }
    return tex(c, false);
  });

/** Gravures runiques sur pierre (masque émissif). */
export const runeGlyphsTex = () =>
  cached('glyphs', () => {
    const [c, g] = canvas(128, 512);
    const r = rng(99);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 512);
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.shadowColor = '#fff';
    g.shadowBlur = 8;
    for (let y = 60; y < 480; y += 52) drawRune(g, 64, y, 18, r);
    return tex(c, false);
  });

/** Fissures lumineuses (sol, logo). */
export const cracksTex = (seed = 5, size = 512) =>
  cached('cracks' + seed + size, () => {
    const [c, g] = canvas(size);
    const r = rng(seed);
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      if (depth <= 0 || len < 4) return;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      let cx = x, cy = y;
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        a += r.range(-0.5, 0.5);
        cx += (Math.cos(a) * len) / steps;
        cy += (Math.sin(a) * len) / steps;
        g.lineTo(cx, cy);
      }
      g.stroke();
      branch(cx, cy, a + r.range(-0.7, 0.7), len * 0.7, w * 0.7, depth - 1);
      if (r.next() < 0.6) branch(cx, cy, a + r.sign() * r.range(0.6, 1.2), len * 0.55, w * 0.6, depth - 1);
    };
    g.shadowColor = '#fff';
    g.shadowBlur = size / 80;
    for (let i = 0; i < 9; i++) branch(size / 2, size / 2, (i / 9) * Math.PI * 2 + r.range(-0.2, 0.2), size * 0.16, size / 90, 5);
    return tex(c, false);
  });

/** Rosace gothique : vitraux colorés et plombs sombres. */
export const roseWindowTex = () =>
  cached('rose', () => {
    const S = 1024;
    const [c, g] = canvas(S);
    const r = rng(77);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    const palette = ['#1d3d8f', '#7a1020', '#c08a1f', '#244f8a', '#4a1458', '#0f5a66', '#9a2a12'];
    const R = S / 2 - 8;
    // segments concentriques
    const rings = [0, 0.16, 0.34, 0.55, 0.78, 1];
    for (let k = 0; k < rings.length - 1; k++) {
      const n = [1, 8, 16, 24, 32][k];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        g.beginPath();
        g.arc(0, 0, R * rings[k + 1], a0, a1);
        g.arc(0, 0, R * rings[k], a1, a0, true);
        g.closePath();
        const col = palette[(i + k * 3 + r.int(0, 2)) % palette.length];
        const gr = g.createRadialGradient(0, 0, R * rings[k], 0, 0, R * rings[k + 1]);
        gr.addColorStop(0, col);
        gr.addColorStop(1, '#05050a');
        g.fillStyle = col;
        g.globalAlpha = r.range(0.75, 1);
        g.fill();
        g.globalAlpha = 1;
      }
    }
    // pétales (rayonnant)
    g.strokeStyle = '#0a0806';
    g.lineWidth = 10;
    for (let i = 0; i < 16; i++) {
      g.save();
      g.rotate((i / 16) * Math.PI * 2);
      g.beginPath();
      g.moveTo(0, R * 0.16);
      g.quadraticCurveTo(R * 0.12, R * 0.6, 0, R * 0.98);
      g.quadraticCurveTo(-R * 0.12, R * 0.6, 0, R * 0.16);
      g.stroke();
      g.restore();
    }
    for (const rr of rings.slice(1)) { g.lineWidth = 12; g.beginPath(); g.arc(0, 0, R * rr, 0, Math.PI * 2); g.stroke(); }
    // plombs fins
    g.lineWidth = 3;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.34, Math.sin(a) * R * 0.34); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke();
    }
    // salissures
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(0,0,0,${r.range(0.05, 0.25)})`;
      g.beginPath(); g.arc(r.range(-R, R), r.range(-R, R), r.range(4, 30), 0, Math.PI * 2); g.fill();
    }
    // bordure circulaire
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    return tex(c);
  });

/** Étiquette de la bouteille d'eau (marque fictive, volontairement banale). */
export const bottleLabelTex = () =>
  cached('label', () => {
    const W = 1024, H = 256;
    const [c, g] = canvas(W, H);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#e9f3fb');
    gr.addColorStop(1, '#bcd8ee');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f5fa8';
    g.fillRect(0, 0, W, 26);
    g.fillRect(0, H - 26, W, 26);
    // montagnes stylisées (le cliché de toutes les étiquettes d'eau minérale)
    g.fillStyle = '#7fb2dc';
    g.beginPath();
    g.moveTo(0, 200);
    for (let x = 0; x <= W; x += 64) g.lineTo(x, 200 - ((x / 64) % 2 ? 60 : 20));
    g.lineTo(W, H - 26); g.lineTo(0, H - 26);
    g.fill();
    g.fillStyle = '#123f78';
    g.textAlign = 'center';
    g.font = 'bold 74px sans-serif';
    g.fillText('SOURCE CLAIRE', W * 0.3, 118);
    g.fillText('SOURCE CLAIRE', W * 0.8, 118);
    g.font = '30px sans-serif';
    g.fillText('Eau de source naturelle · 50 cl', W * 0.3, 168);
    g.fillText('Eau de source naturelle · 50 cl', W * 0.8, 168);
    return tex(c);
  });

/** Façade médiévale : colombages et fenêtres (map + carte d'émission des fenêtres éclairées). */
export const facadeTex = () =>
  cached('facade', () => {
    const S = 256;
    const [c, g] = canvas(S);
    g.drawImage(stoneTex().image as HTMLCanvasElement, 0, 0, S, S);
    g.fillStyle = 'rgba(120,100,80,0.35)';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#2a1c12';
    g.lineWidth = 6;
    for (let x = 0; x <= S; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
    g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
    g.lineWidth = 4;
    for (let x = 0; x < S; x += 64) { g.beginPath(); g.moveTo(x, S / 2); g.lineTo(x + 64, S); g.stroke(); }
    g.fillStyle = '#100c0a';
    for (let x = 18; x < S; x += 64) { g.fillRect(x, 30, 28, 46); g.fillRect(x, 158, 28, 46); }
    return tex(c, true, true);
  });

export const facadeEmissiveTex = () =>
  cached('facadeE', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const r = rng(12);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    for (let x = 18; x < S; x += 64)
      for (const y of [30, 158]) {
        if (r.next() < 0.45) continue;
        g.fillStyle = `rgb(255,${r.int(140, 190)},${r.int(60, 90)})`;
        g.fillRect(x + 3, y + 3, 22, 40);
      }
    return tex(c, true, true);
  });

/** Emblème « goutte d'eau » des Gardes de la Tempérance (boucliers ennemis). */
export const dropEmblemTex = () =>
  cached('drop', () => {
    const S = 256;
    const [c, g] = canvas(S);
    g.fillStyle = '#1a1c22';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#8a7a4a';
    g.lineWidth = 10;
    g.strokeRect(10, 10, S - 20, S - 20);
    g.fillStyle = '#c9d6e6';
    g.beginPath();
    g.moveTo(S / 2, 40);
    g.bezierCurveTo(S / 2 + 20, 90, S / 2 + 70, 130, S / 2 + 70, 170);
    g.arc(S / 2, 170, 70, 0, Math.PI);
    g.bezierCurveTo(S / 2 - 70, 130, S / 2 - 20, 90, S / 2, 40);
    g.fill();
    return tex(c);
  });

/** Bannière de tissu avec motif (cité). */
export const bannerTex = (color: string, seed = 1) =>
  cached('banner' + color + seed, () => {
    const [c, g] = canvas(64, 256);
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 0, 64, 10);
    g.beginPath();
    g.moveTo(32, 70); g.lineTo(48, 110); g.lineTo(32, 150); g.lineTo(16, 110);
    g.fill();
    // bas en queue d'aronde
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, 256); g.lineTo(32, 210); g.lineTo(64, 256); g.fill();
    return tex(c);
  });

/** Iris de rapace : or brun, fibres radiales, pupille noire. */
export const irisTex = () =>
  cached('iris', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const r = rng(31);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, '#000');
    gr.addColorStop(0.36, '#000');
    gr.addColorStop(0.4, '#5a2a05');
    gr.addColorStop(0.6, '#c98a22');
    gr.addColorStop(0.85, '#8a4e10');
    gr.addColorStop(0.97, '#2a1404');
    gr.addColorStop(1, '#100800');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 260; i++) {
      const a = r.range(0, Math.PI * 2);
      g.strokeStyle = r.next() < 0.5 ? 'rgba(255,200,90,0.25)' : 'rgba(60,25,0,0.3)';
      g.lineWidth = r.range(0.5, 2);
      g.beginPath();
      g.moveTo(Math.cos(a) * S * 0.2, Math.sin(a) * S * 0.2);
      g.lineTo(Math.cos(a + r.range(-0.1, 0.1)) * S * 0.48, Math.sin(a + r.range(-0.1, 0.1)) * S * 0.48);
      g.stroke();
    }
    return tex(c);
  });

/** Étoile de lumière (reflet spéculaire en croix) pour les scintillements « sacrés ». */
export const starFlareTex = () =>
  cached('star', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.08, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.08)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    for (const [a, len, w] of [[0, 0.5, 3], [Math.PI / 2, 0.5, 3], [Math.PI / 4, 0.28, 1.5], [-Math.PI / 4, 0.28, 1.5]] as const) {
      g.save();
      g.rotate(a);
      const lg = g.createLinearGradient(-S * len, 0, S * len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(-S * len, -w, S * len * 2, w * 2);
      g.restore();
    }
    return tex(c, false);
  });
