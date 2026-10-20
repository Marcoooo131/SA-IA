// Maisons médiévales détaillées : soubassement de pierre, étages à colombages en encorbellement,
// poutres en relief, fenêtres à meneaux et volets, portes cloutées, auvents, enseignes, cheminées,
// toits de tuiles, d'ardoise ou de chaume avec débords. ~16 modèles uniques, instanciés en grand nombre.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, type Rng } from '../core/math';
import { normalTex } from './assets';

type Mat = 'stone' | 'plaster' | 'wood' | 'tile' | 'slate' | 'thatch' | 'glassLit' | 'glassDark';

// ------------------------------------------------------------------ textures
const cache = new Map<string, THREE.Texture>();
function ctex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, r: Rng) => void) {
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, rng(key.length * 131));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}
function grime(g: CanvasRenderingContext2D, r: Rng, w: number, h: number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${r.int(30, 60)},${r.int(25, 45)},${r.int(15, 30)},${r.range(0.02, a)})`;
    g.beginPath();
    g.ellipse(r.range(0, w), r.range(0, h), r.range(4, 40), r.range(4, 60), 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** Enduit vieilli (taches, fissures, coulures en pied de mur). 1 tuile = 2 m. */
const plasterTex = () =>
  ctex('plaster', 512, 512, (g, r) => {
    g.fillStyle = '#d9cdb4';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      const v = r.int(-18, 14);
      g.fillStyle = `rgba(${200 + v},${190 + v},${165 + v},0.35)`;
      g.fillRect(r.range(0, 512), r.range(0, 512), r.range(1, 5), r.range(1, 5));
    }
    grime(g, r, 512, 512, 40, 0.08);
    const lg = g.createLinearGradient(0, 380, 0, 512);
    lg.addColorStop(0, 'rgba(60,45,25,0)');
    lg.addColorStop(1, 'rgba(60,45,25,0.35)');
    g.fillStyle = lg;
    g.fillRect(0, 380, 512, 132);
    g.strokeStyle = 'rgba(70,55,40,0.45)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let x = r.range(0, 512), y = r.range(0, 512);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += r.range(-14, 14); y += r.range(4, 16); g.lineTo(x, y); }
      g.stroke();
    }
  });

/** Pierre appareillée irrégulière (moellons, joints creux). 1 tuile = 2 m. */
const stoneTexHouse = () =>
  ctex('stoneWall', 512, 512, (g, r) => {
    g.fillStyle = '#4a4540';
    g.fillRect(0, 0, 512, 512);
    let y = 0;
    while (y < 512) {
      const h = r.range(34, 58);
      let x = -r.range(0, 40);
      while (x < 512) {
        const w = r.range(50, 110);
        const v = r.int(-22, 22);
        g.fillStyle = `rgb(${132 + v},${124 + v},${112 + v})`;
        g.beginPath();
        g.roundRect(x + 3, y + 3, w - 6, h - 6, 8);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + 6, y + 5, w - 14, 4);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillRect(x + 4, y + h - 9, w - 8, 5);
        x += w;
      }
      y += h;
    }
    grime(g, r, 512, 512, 30, 0.12);
    for (let i = 0; i < 25; i++) {
      g.fillStyle = `rgba(${r.int(70, 100)},${r.int(100, 120)},${r.int(50, 70)},${r.range(0.15, 0.35)})`;
      g.beginPath();
      g.arc(r.range(0, 512), r.range(300, 512), r.range(6, 22), 0, Math.PI * 2);
      g.fill();
    }
  });

/** Bois : planches veinées. 1 tuile = 1 m. */
const woodTex = () =>
  ctex('wood', 256, 256, (g, r) => {
    for (let x = 0; x < 256; x += 32) {
      const v = r.int(-14, 14);
      g.fillStyle = `rgb(${92 + v},${66 + v},${44 + v})`;
      g.fillRect(x, 0, 32, 256);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(30,18,10,${r.range(0.15, 0.4)})`;
        g.lineWidth = r.range(0.5, 1.6);
        g.beginPath();
        const xx = x + r.range(2, 30);
        g.moveTo(xx, 0);
        g.bezierCurveTo(xx + r.range(-3, 3), 80, xx + r.range(-3, 3), 170, xx + r.range(-2, 2), 256);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x, 0, 1.5, 256);
    }
  });

/** Tuiles canal en rangs décalés. 1 tuile de texture = 1,5 m. */
const tileTex = () =>
  ctex('tiles', 512, 512, (g, r) => {
    g.fillStyle = '#5a2e1e';
    g.fillRect(0, 0, 512, 512);
    const rows = 14, cols = 12;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = (i + (j % 2) * 0.5) * (512 / cols), y = j * (512 / rows);
        const v = r.int(-25, 25);
        const gr = g.createLinearGradient(x, y, x, y + 512 / rows);
        gr.addColorStop(0, `rgb(${150 + v},${74 + v * 0.6},${48 + v * 0.4})`);
        gr.addColorStop(1, `rgb(${96 + v},${46 + v * 0.5},${30})`);
        g.fillStyle = gr;
        g.beginPath();
        g.roundRect(x + 1, y + 1, 512 / cols - 2, 512 / rows + 6, [0, 0, 10, 10]);
        g.fill();
      }
    }
    grime(g, r, 512, 512, 60, 0.18);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r.int(80, 110)},${r.int(100, 120)},${r.int(50, 60)},${r.range(0.2, 0.45)})`;
      g.beginPath();
      g.arc(r.range(0, 512), r.range(0, 512), r.range(4, 16), 0, Math.PI * 2);
      g.fill();
    }
  });

const slateTex = () =>
  ctex('slate', 512, 512, (g, r) => {
    g.fillStyle = '#25272c';
    g.fillRect(0, 0, 512, 512);
    const rows = 18, cols = 14;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const v = r.int(-12, 14);
        g.fillStyle = `rgb(${62 + v},${66 + v},${74 + v})`;
        const x = (i + (j % 2) * 0.5) * (512 / cols), y = j * (512 / rows);
        g.fillRect(x + 1, y + 1, 512 / cols - 2, 512 / rows + 4);
      }
    grime(g, r, 512, 512, 40, 0.15);
  });

const thatchTex = () =>
  ctex('thatch', 512, 512, (g, r) => {
    g.fillStyle = '#7a6438';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5000; i++) {
      const x = r.range(0, 512), y = r.range(0, 512);
      const v = r.int(-30, 30);
      g.strokeStyle = `rgba(${170 + v},${140 + v},${80 + v * 0.5},${r.range(0.3, 0.8)})`;
      g.lineWidth = r.range(0.6, 1.8);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + r.range(-3, 3), y + r.range(14, 34));
      g.stroke();
    }
    for (let y = 0; y < 512; y += 64) {
      g.fillStyle = 'rgba(40,30,15,0.35)';
      g.fillRect(0, y + 58, 512, 6);
    }
  });

// ------------------------------------------------------------------ matériaux partagés
let MATS: Record<Mat, THREE.Material> | null = null;
export function houseMaterials() {
  if (MATS) return MATS;
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, ...p });
  MATS = {
    stone: std({ map: stoneTexHouse(), normalMap: normalTex('rock', 1), normalScale: new THREE.Vector2(1.4, 1.4) }),
    plaster: std({ map: plasterTex(), normalMap: normalTex('plaster', 1), normalScale: new THREE.Vector2(0.8, 0.8) }),
    wood: std({ map: woodTex(), normalMap: normalTex('planks', 1), roughness: 0.85 }),
    tile: std({ map: tileTex(), normalMap: normalTex('tiles', 1), roughness: 0.8 }),
    slate: std({ map: slateTex(), normalMap: normalTex('tiles', 1), roughness: 0.6, metalness: 0.1 }),
    thatch: std({ map: thatchTex(), normalMap: normalTex('earth', 1), roughness: 1 }),
    glassLit: new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xffa04a, emissiveIntensity: 1.6, roughness: 0.3 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.15, metalness: 0.3 }),
  };
  return MATS;
}

// ------------------------------------------------------------------ géométrie utilitaire
/** Boîte aux UV en mètres (projection par face) et teintée par sommet. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, unitU: number, unitV: number, color: THREE.Color, rotY = 0, rotX = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) + w / 2, py = p.getY(i) + h / 2, pz = p.getZ(i) + d / 2;
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (nx > 0.5) uv.setXY(i, pz / unitU, py / unitV);
    else if (ny > 0.5) uv.setXY(i, px / unitU, pz / unitV);
    else uv.setXY(i, px / unitU, py / unitV);
  }
  if (rotX) g.rotateX(rotX);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return withColor(g, color);
}
function withColor(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** Pignon triangulaire (enduit) dans le plan XY, épaisseur e. */
function gable(w: number, h: number, e: number, color: THREE.Color) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: e, bevelEnabled: false }).toNonIndexed();
  g.translate(0, 0, -e / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / 2, p.getY(i) / 2);
  return withColor(g, color);
}

export interface HouseProto {
  geos: Partial<Record<Mat, THREE.BufferGeometry>>;
  width: number;
  depth: number;
  height: number;
  chimney: THREE.Vector3 | null;
}

/** Une maison unique. `style` oriente le caractère (cité dense, village, ferme). */
export function makeHouse(seed: number, style: 'city' | 'village' | 'farm' = 'village', detail = true): HouseProto {
  const r = rng(seed);
  const parts: Partial<Record<Mat, THREE.BufferGeometry[]>> = {};
  const add = (m: Mat, g: THREE.BufferGeometry) => (parts[m] ??= []).push(g);
  const white = new THREE.Color(1, 1, 1);
  const W = style === 'city' ? r.range(6.5, 10) : r.range(7, 11);
  const D = r.range(6.5, 9);
  const floors = style === 'city' ? r.int(2, 3) : style === 'farm' ? 1 : r.int(1, 2);
  const stoneBase = style === 'farm' ? r.next() < 0.7 : r.next() < 0.75;
  const plasterTint = new THREE.Color().setHSL(r.range(0.07, 0.13), r.range(0.15, 0.4), r.range(0.72, 0.9));
  const stoneTint = new THREE.Color().setScalar(r.range(0.8, 1.05));
  const woodTint = new THREE.Color().setScalar(r.range(0.7, 1.05));
  const shutterTint = new THREE.Color(r.pick([0x5a7a5a, 0x8a3a2a, 0x3a5a7a, 0x7a6a4a, 0x6a4a6a]));
  const FH = 3.0; // hauteur d'étage
  let y = 0;
  let jetty = 0;
  const beams = (w: number, d: number, y0: number, h: number) => {
    // poteaux d'angle, sablières, poteaux intermédiaires et décharges en relief
    const t = 0.24;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood', box(t, h, t, sx * (w / 2), y0 + h / 2, sz * (d / 2), 1, 1, woodTint));
    for (const sz of [-1, 1]) {
      add('wood', box(w + t, t, t, 0, y0 + 0.12, sz * (d / 2), 1, 1, woodTint));
      add('wood', box(w + t, t, t, 0, y0 + h - 0.12, sz * (d / 2), 1, 1, woodTint));
      const n = Math.round(w / 1.6);
      for (let i = 1; i < n; i++) add('wood', box(0.18, h, 0.18, -w / 2 + (i * w) / n, y0 + h / 2, sz * (d / 2 + 0.02), 1, 1, woodTint));
      // décharges en croix de Saint-André sur un panneau sur deux
      for (let i = 0; i < (detail ? n : 0); i += 2) {
        const cx = -w / 2 + ((i + 0.5) * w) / n;
        const len = Math.hypot(w / n, h * 0.6);
        const ang = Math.atan2(h * 0.6, w / n);
        for (const s of [-1, 1]) {
          const g = box(len, 0.15, 0.15, 0, 0, 0, 1, 1, woodTint);
          g.rotateZ(s * ang);
          g.translate(cx, y0 + h / 2, sz * (d / 2 + 0.03));
          add('wood', g);
        }
      }
    }
    for (const sx of [-1, 1]) {
      add('wood', box(t, t, d + t, sx * (w / 2), y0 + 0.12, 0, 1, 1, woodTint));
      add('wood', box(t, t, d + t, sx * (w / 2), y0 + h - 0.12, 0, 1, 1, woodTint));
      const n = Math.round(d / 1.6);
      for (let i = 1; i < n; i++) add('wood', box(0.18, h, 0.18, sx * (w / 2 + 0.02), y0 + h / 2, -d / 2 + (i * d) / n, 1, 1, woodTint));
    }
  };
  const windows = (w: number, d: number, y0: number, ground: boolean) => {
    // fenêtres sur les façades avant/arrière et parfois sur les côtés
    const nf = Math.max(1, Math.floor(w / 2.8));
    for (const sz of [-1, 1]) {
      for (let i = 0; i < nf; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / nf;
        if (ground && sz === 1 && i === Math.floor(nf / 2)) continue; // la porte
        if (r.next() < 0.15) continue;
        const lit = r.next() < (style === 'city' ? 0.45 : 0.3);
        const z = sz * (d / 2 + 0.09);
        const wy = y0 + (ground ? 1.5 : 1.6);
        add('wood', box(1.05, 1.3, 0.1, x, wy, z, 1, 1, woodTint));
        add(lit ? 'glassLit' : 'glassDark', box(0.8, 1.05, 0.06, x, wy, z + sz * 0.04, 1, 1, white));
        if (!detail) continue;
        add('wood', box(0.08, 1.05, 0.08, x, wy, z + sz * 0.07, 1, 1, woodTint)); // meneau
        add('wood', box(1.2, 0.1, 0.25, x, wy - 0.7, z + sz * 0.08, 1, 1, woodTint)); // appui
        if (r.next() < 0.7) {
          // volets ouverts, peints
          for (const s of [-1, 1]) add('wood', box(0.45, 1.15, 0.05, x + s * 0.8, wy, z + sz * 0.05, 1, 1, shutterTint));
        }
      }
    }
  };
  for (let f = 0; f < floors; f++) {
    const w = W + jetty * 2, d = D + jetty * 2;
    const isStone = f === 0 && stoneBase;
    if (isStone) {
      add('stone', box(w, FH, d, 0, y + FH / 2, 0, 2, 2, stoneTint));
    } else {
      add('plaster', box(w, FH, d, 0, y + FH / 2, 0, 2, 2, plasterTint));
      beams(w, d, y, FH);
    }
    windows(w, d, y, f === 0);
    // encorbellement : l'étage suivant déborde sur des poutres de plancher
    if (f < floors - 1) {
      const nj = style === 'city' ? 0.45 : r.range(0, 0.35);
      for (let i = 0; i <= Math.round((W + jetty * 2) / 1.2); i++) {
        for (const sz of [-1, 1]) add('wood', box(0.22, 0.26, 0.9, -w / 2 + i * 1.2, y + FH - 0.05, sz * (d / 2 + 0.2), 1, 1, woodTint));
      }
      jetty += nj;
    }
    y += FH;
  }
  // porte cloutée + auvent
  const doorZ = D / 2 + (stoneBase ? 0.06 : 0.08);
  add('wood', box(1.25, 2.2, 0.14, 0, 1.1, doorZ, 1, 1, woodTint.clone().multiplyScalar(0.8)));
  add('stone', box(1.6, 0.25, 0.8, 0, 0.12, doorZ + 0.35, 2, 2, stoneTint));
  if (r.next() < 0.55) {
    // petit auvent de planches sur deux consoles
    add('wood', box(2.2, 0.08, 1.1, 0, 2.75, doorZ + 0.5, 1, 1, woodTint, 0, 0.3));
    for (const s of [-1, 1]) add('wood', box(0.1, 0.1, 0.9, s * 0.95, 2.45, doorZ + 0.4, 1, 1, woodTint, 0, -0.6));
  }
  if (style !== 'farm' && r.next() < 0.4) {
    // enseigne suspendue
    add('wood', box(1.0, 0.08, 0.08, 1.4, 3.0, doorZ + 0.5, 1, 1, woodTint));
    add('wood', box(0.75, 0.55, 0.05, 1.6, 2.6, doorZ + 0.95, 1, 1, new THREE.Color(r.pick([0x9a4a2a, 0x3a5a7a, 0x8a7a3a]))));
  }
  // toit
  const roofKind: Mat = style === 'farm' ? (r.next() < 0.7 ? 'thatch' : 'tile') : style === 'city' ? (r.next() < 0.6 ? 'slate' : 'tile') : r.pick(['tile', 'tile', 'thatch', 'slate'] as Mat[]);
  const w = W + jetty * 2, d = D + jetty * 2;
  const pitch = roofKind === 'thatch' ? r.range(0.85, 1.0) : r.range(0.7, 0.95);
  const over = roofKind === 'thatch' ? 0.7 : 0.45;
  const halfSpan = d / 2 + over;
  const rise = Math.tan(pitch) * (d / 2);
  const slopeLen = halfSpan / Math.cos(pitch);
  const thick = roofKind === 'thatch' ? 0.55 : 0.18;
  for (const s of [-1, 1]) {
    const g = box(w + over * 2, thick, slopeLen, 0, 0, 0, 1.5, 1.5, new THREE.Color().setScalar(r.range(0.85, 1.05)));
    g.translate(0, 0, s * slopeLen / 2);
    g.rotateX(s * pitch);
    g.translate(0, y + rise + thick * 0.3, 0);
    add(roofKind, g);
  }
  // faîtage
  add(roofKind === 'thatch' ? 'thatch' : 'wood', box(w + over * 2 + 0.1, 0.3, 0.45, 0, y + rise + thick * 0.6, 0, 1, 1, woodTint));
  // pignons
  for (const sx of [-1, 1]) {
    const g = gable(d, rise, 0.25, plasterTint);
    g.rotateY(Math.PI / 2);
    g.translate(sx * (w / 2), y, 0);
    add(roofKind === 'thatch' || r.next() < 0.5 ? 'plaster' : 'stone', g);
    // poinçon et arbalétriers du pignon
    add('wood', box(0.18, rise, 0.18, sx * (w / 2 + 0.05), y + rise / 2, 0, 1, 1, woodTint));
  }
  // lucarne
  if (roofKind !== 'thatch' && style === 'city' && r.next() < 0.6) {
    const lx = r.range(-w / 4, w / 4);
    add('plaster', box(1.6, 1.4, 1.4, lx, y + rise * 0.45, d / 2 - 0.9, 2, 2, plasterTint));
    add('glassLit', box(0.7, 0.8, 0.05, lx, y + rise * 0.45, d / 2 - 0.18, 1, 1, white));
    add(roofKind, box(2.0, 0.12, 1.8, lx, y + rise * 0.45 + 0.95, d / 2 - 0.9, 1.5, 1.5, white, 0, 0.35));
  }
  // cheminée
  let chimney: THREE.Vector3 | null = null;
  if (r.next() < 0.85) {
    const cx = r.pick([-1, 1]) * (w / 2 - 0.9), cz = r.range(-d / 4, d / 4);
    const top = y + rise + 1.6;
    add('stone', box(0.9, top, 0.9, cx, top / 2, cz, 2, 2, stoneTint));
    add('stone', box(1.1, 0.25, 1.1, cx, top, cz, 2, 2, stoneTint));
    chimney = new THREE.Vector3(cx, top + 0.3, cz);
  }
  // jardinière / bûches / tonneau près de la porte (détails de vie)
  if (r.next() < 0.5) add('wood', box(1.2, 0.3, 0.3, -1.6, 1.0, doorZ + 0.2, 1, 1, new THREE.Color(0x6a8a3a)));
  if (style !== 'city' && r.next() < 0.6) {
    for (let k = 0; k < 6; k++) add('wood', box(1.0, 0.22, 0.22, W / 2 + 0.5, 0.15 + Math.floor(k / 3) * 0.22, -1 + (k % 3) * 0.24, 1, 1, woodTint, Math.PI / 2));
  }
  const geos: Partial<Record<Mat, THREE.BufferGeometry>> = {};
  for (const [k, arr] of Object.entries(parts) as [Mat, THREE.BufferGeometry[]][]) {
    geos[k] = mergeGeometries(arr.map((g) => { if (g.index) g = g.toNonIndexed(); g.deleteAttribute('normal'); return g; }))!;
    geos[k]!.computeVertexNormals();
  }
  return { geos, width: w + over * 2, depth: d + over * 2, height: y + rise, chimney };
}

/** Ensemble de maisons instanciées : chaque modèle × matériau = un InstancedMesh. */
export class HouseSet extends THREE.Group {
  private placements: { proto: number; pos: THREE.Vector3; rotY: number; scale: number }[] = [];
  chimneys: THREE.Vector3[] = [];
  constructor(public protos: HouseProto[]) {
    super();
  }
  add2(proto: number, pos: THREE.Vector3, rotY: number, scale = 1) {
    this.placements.push({ proto, pos, rotY, scale });
    const ch = this.protos[proto].chimney;
    if (ch) this.chimneys.push(ch.clone().multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos));
  }
  build(shadows = true) {
    const mats = houseMaterials();
    this.protos.forEach((p, pi) => {
      const pl = this.placements.filter((x) => x.proto === pi);
      if (!pl.length) return;
      for (const [k, geo] of Object.entries(p.geos) as [Mat, THREE.BufferGeometry][]) {
        const mesh = new THREE.InstancedMesh(geo, mats[k], pl.length);
        pl.forEach((x, i) => mesh.setMatrixAt(i, new THREE.Matrix4().compose(x.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), x.rotY), new THREE.Vector3().setScalar(x.scale))));
        mesh.castShadow = shadows && k !== 'glassLit' && k !== 'glassDark';
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        THREE.Group.prototype.add.call(this, mesh);
      }
    });
    return this;
  }
}
