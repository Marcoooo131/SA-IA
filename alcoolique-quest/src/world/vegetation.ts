// Végétation naturelle : arbres de plusieurs essences (chêne, bouleau, sapin, peuplier, saule),
// buissons, fougères, fleurs sauvages, roseaux, blé, haies, murets de pierre, clôtures.
// Tout est instancié (une géométrie par variante, des milliers d'instances) et animé par le vent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm2, rng, type Rng } from '../core/math';
import { normalTex } from './assets';
import { rockify } from './terrain';
import { WIND } from './props';

// ------------------------------------------------------------------ textures de feuillage (canevas)
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, r: Rng) => void, srgb = true) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, rng(key.length * 97 + w));
  t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Grappe de feuilles (alpha) : feuilles ovales nervurées, teintes variées, ombrage interne. */
export function leafClusterTex(kind: 'broad' | 'small' | 'willow') {
  return canvasTex('leaf-' + kind, 256, 256, (g, r) => {
    const n = kind === 'small' ? 160 : kind === 'willow' ? 120 : 90;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 100;
      const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 0.9;
      const depth = 1 - d / 110;
      const L = kind === 'small' ? r.range(9, 15) : kind === 'willow' ? r.range(18, 30) : r.range(14, 24);
      const W = kind === 'willow' ? L * 0.22 : L * 0.55;
      g.save();
      g.translate(x, y);
      g.rotate(kind === 'willow' ? Math.PI / 2 + r.range(-0.3, 0.3) : r.range(0, Math.PI * 2));
      const light = 0.55 + depth * 0.25 + r.range(-0.12, 0.12);
      const hue = kind === 'small' ? r.range(70, 95) : r.range(78, 110);
      g.fillStyle = `hsl(${hue}, ${r.range(35, 55)}%, ${light * 38}%)`;
      g.beginPath();
      g.ellipse(0, 0, W, L, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `hsla(${hue}, 40%, ${light * 52}%, 0.6)`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -L);
      g.lineTo(0, L);
      g.stroke();
      g.restore();
    }
  });
}

/** Écorce : stries verticales, nœuds, lichens. */
export function barkTex(kind: 'dark' | 'birch' | 'pine') {
  return canvasTex('bark-' + kind, 128, 256, (g, r) => {
    const base = kind === 'birch' ? '#d9d4c8' : kind === 'pine' ? '#5a3a26' : '#4a3d30';
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 160; i++) {
      const x = r.range(0, 128);
      if (kind === 'birch') {
        g.fillStyle = `rgba(20,18,16,${r.range(0.5, 0.9)})`;
        g.fillRect(x, r.range(0, 256), r.range(4, 22), r.range(1.5, 4));
      } else {
        g.strokeStyle = `rgba(0,0,0,${r.range(0.15, 0.45)})`;
        g.lineWidth = r.range(1, 3);
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y < 256; y += 16) g.lineTo(x + r.range(-3, 3), y);
        g.stroke();
      }
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${r.int(90, 140)},${r.int(120, 150)},${r.int(70, 90)},${r.range(0.1, 0.35)})`;
      g.beginPath();
      g.arc(r.range(0, 128), r.range(0, 256), r.range(3, 12), 0, Math.PI * 2);
      g.fill();
    }
  });
}

function fernTex() {
  return canvasTex('fern', 64, 256, (g, r) => {
    g.strokeStyle = '#3d5a22';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 6); g.stroke();
    for (let y = 250; y > 10; y -= 7) {
      const k = 1 - Math.abs((y - 120) / 140);
      const L = 28 * Math.max(0.15, k);
      for (const s of [-1, 1]) {
        g.fillStyle = `hsl(${r.range(85, 105)}, 45%, ${r.range(24, 34)}%)`;
        g.beginPath();
        g.ellipse(32 + s * L * 0.5, y - 3, L * 0.5, 3.2, s * -0.35, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Matériau de feuillage : alpha-test, double face, translucidité et oscillation au vent. */
function foliageMat(map: THREE.Texture, opts: { sway?: number; translucency?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  const sway = opts.sway ?? 0.25;
  const tr = opts.translucency ?? 0.3;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uStrength = WIND.uStrength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hgt = max(0.0, position.y);
        float w = sin(uTime * 1.3 + ip.x * 0.05 + ip.z * 0.07) * 0.6 + sin(uTime * 3.1 + position.x * 2.0 + ip.z) * 0.25;
        transformed.x += w * ${sway.toFixed(3)} * hgt * 0.06 * uStrength;
        transformed.z += cos(uTime * 2.3 + position.z * 1.7 + ip.x) * ${sway.toFixed(3)} * hgt * 0.03 * uStrength;`,
      );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${tr.toFixed(3)} * 0.35;`,
    );
  };
  m.customProgramCacheKey = () => `foliage-${sway}-${tr}`;
  return m;
}

// ------------------------------------------------------------------ arbres
export type Species = 'oak' | 'birch' | 'pine' | 'poplar' | 'willow' | 'dead';

interface TreeGeo { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null; species: Species; height: number }

/** Quad de feuillage dont les normales pointent depuis le centre de la couronne (ombrage volumique doux). */
function leafCard(center: THREE.Vector3, crown: THREE.Vector3, size: number, r: Rng, out: THREE.BufferGeometry[], stretchY = 1) {
  for (let k = 0; k < 2; k++) {
    const g = new THREE.PlaneGeometry(size, size * stretchY);
    g.rotateY(r.range(0, Math.PI) + k * Math.PI / 2);
    g.rotateX(r.range(-0.5, 0.5));
    g.translate(center.x, center.y, center.z);
    const n = g.attributes.normal;
    const p = g.attributes.position;
    for (let i = 0; i < n.count; i++) {
      const v = new THREE.Vector3(p.getX(i) - crown.x, (p.getY(i) - crown.y) * 1.4, p.getZ(i) - crown.z).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    out.push(g);
  }
}

function branchSeg(base: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, out: THREE.BufferGeometry[], radial = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 2, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(base.x, base.y, base.z);
  out.push(g);
  return base.clone().addScaledVector(dir, len);
}

export function makeTree(species: Species, seed: number): TreeGeo {
  const r = rng(seed);
  const bark: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  let height = 10;
  if (species === 'pine') {
    // sapin : tronc droit, étages de branches en cône
    height = r.range(14, 22);
    branchSeg(new THREE.Vector3(0, -0.5, 0), up, height, 0.35, 0.05, bark, 7);
    const crown = new THREE.Vector3(0, height * 0.55, 0);
    const tiers = Math.floor(height / 1.1);
    for (let i = 0; i < tiers; i++) {
      const y = height * 0.22 + (i / tiers) * height * 0.78;
      const rad = (1 - (y / height)) * height * 0.32 + 0.4;
      const n = Math.max(3, Math.floor(rad * 3));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r.range(-0.3, 0.3);
        const tip = new THREE.Vector3(Math.cos(a) * rad, y - rad * 0.35, Math.sin(a) * rad);
        if (k % 2 === 0) branchSeg(new THREE.Vector3(0, y, 0), tip.clone().sub(new THREE.Vector3(0, y, 0)).normalize(), rad, 0.07, 0.02, bark, 4);
        leafCard(new THREE.Vector3(Math.cos(a) * rad * 0.6, y - rad * 0.2, Math.sin(a) * rad * 0.6), crown, rad * 1.35, r, leaves, 0.6);
      }
    }
    leafCard(new THREE.Vector3(0, height, 0), crown, 1.6, r, leaves, 1.3);
  } else {
    const cfg = {
      oak: { h: [9, 14], trunk: 0.55, spread: 0.8, depth: 4, card: 3.4, lean: 0.25 },
      birch: { h: [11, 16], trunk: 0.22, spread: 0.45, depth: 4, card: 2.3, lean: 0.12 },
      poplar: { h: [16, 22], trunk: 0.35, spread: 0.18, depth: 4, card: 2.6, lean: 0.06 },
      willow: { h: [8, 11], trunk: 0.5, spread: 0.85, depth: 3, card: 2.8, lean: 0.3 },
      dead: { h: [7, 11], trunk: 0.45, spread: 0.8, depth: 5, card: 0, lean: 0.3 },
    }[species];
    height = r.range(cfg.h[0], cfg.h[1]);
    const trunkLen = height * (species === 'poplar' ? 0.25 : species === 'birch' ? 0.45 : 0.4);
    const top = branchSeg(new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(r.range(-0.08, 0.08), 1, r.range(-0.08, 0.08)).normalize(), trunkLen + 0.6, cfg.trunk, cfg.trunk * 0.7, bark, 8);
    const crown = new THREE.Vector3(0, height * 0.62, 0);
    const grow = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
      // la branche se courbe légèrement en deux segments
      const mid = branchSeg(base, dir, len * 0.5, rad, rad * 0.8, bark, 5);
      const d2 = dir.clone().add(new THREE.Vector3(r.range(-0.25, 0.25), r.range(-0.05, 0.15) - (species === 'willow' ? 0.25 : 0), r.range(-0.25, 0.25))).normalize();
      const end = branchSeg(mid, d2, len * 0.5, rad * 0.8, rad * 0.6, bark, 5);
      if (depth <= 0) {
        if (cfg.card > 0) {
          const n = species === 'willow' ? 4 : 3;
          for (let k = 0; k < n; k++) leafCard(end.clone().add(new THREE.Vector3(r.range(-0.6, 0.6), species === 'willow' ? -0.9 : r.range(-0.3, 0.5), r.range(-0.6, 0.6))), crown, cfg.card * r.range(0.8, 1.25), r, leaves, species === 'willow' ? 1.8 : 1);
        }
        return;
      }
      const kids = depth >= 3 ? r.int(2, 3) : r.int(2, 4);
      for (let i = 0; i < kids; i++) {
        const a = r.range(0, Math.PI * 2);
        const nd = d2.clone().multiplyScalar(1.1).add(new THREE.Vector3(Math.cos(a) * cfg.spread, r.range(0.1, 0.6), Math.sin(a) * cfg.spread)).normalize();
        grow(end, nd, len * r.range(0.62, 0.78), rad * 0.62, depth - 1);
      }
      if (cfg.card > 0 && depth <= 2) leafCard(end, crown, cfg.card * (depth === 2 ? 1.3 : 1.0), r, leaves);
    };
    const firstLen = (height - trunkLen) * 0.45;
    const nMain = species === 'poplar' ? 5 : r.int(3, 4);
    for (let i = 0; i < nMain; i++) {
      const a = (i / nMain) * Math.PI * 2 + r.range(-0.4, 0.4);
      const d = new THREE.Vector3(Math.cos(a) * cfg.spread * 0.8, 1, Math.sin(a) * cfg.spread * 0.8).normalize();
      grow(top, d, firstLen, cfg.trunk * 0.65, cfg.depth - 1);
    }
  }
  const prep = (arr: THREE.BufferGeometry[]) => mergeGeometries(arr.map((g) => (g.index ? g.toNonIndexed() : g)));
  const barkGeo = prep(bark)!;
  barkGeo.computeVertexNormals();
  return { bark: barkGeo, leaves: leaves.length ? prep(leaves) : null, species, height };
}

const SPECIES_STYLE: Record<Species, { leaf: 'broad' | 'small' | 'willow'; bark: 'dark' | 'birch' | 'pine'; tint: number[] }> = {
  oak: { leaf: 'broad', bark: 'dark', tint: [0x6a8a3a, 0x5a7a30, 0x7a9440, 0x4f6e2c] },
  birch: { leaf: 'small', bark: 'birch', tint: [0x9ab04a, 0x8aa840, 0xa8b850] },
  pine: { leaf: 'small', bark: 'pine', tint: [0x2f4a2a, 0x3a5530, 0x2a4226] },
  poplar: { leaf: 'small', bark: 'dark', tint: [0x7a9a3a, 0x6a8c34] },
  willow: { leaf: 'willow', bark: 'dark', tint: [0x8aa050, 0x7a9448] },
  dead: { leaf: 'broad', bark: 'dark', tint: [0xffffff] },
};

const sharedMats = new Map<string, THREE.Material>();
function barkMaterial(kind: 'dark' | 'birch' | 'pine') {
  let m = sharedMats.get('bark' + kind);
  if (!m) {
    const map = barkTex(kind).clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 3);
    map.needsUpdate = true;
    m = new THREE.MeshStandardMaterial({ map, normalMap: normalTex('bark', 3), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, color: kind === 'birch' ? 0xffffff : 0xbfb4a8 });
    sharedMats.set('bark' + kind, m);
  }
  return m;
}

/**
 * Forêt / bosquet instancié : plusieurs variantes de chaque essence, placées par une fonction.
 * `place` renvoie la liste des positions (x, y, z, échelle) ; les variantes sont réparties aléatoirement.
 */
export function forest(opts: { species: Species; variants?: number; points: THREE.Vector4[]; seed?: number; castShadow?: boolean }) {
  const r = rng(opts.seed ?? 1);
  const g = new THREE.Group();
  const nv = opts.variants ?? 3;
  const style = SPECIES_STYLE[opts.species];
  const leafMat = foliageMat(leafClusterTex(style.leaf), { sway: opts.species === 'poplar' || opts.species === 'birch' ? 0.45 : 0.25 });
  const buckets: THREE.Vector4[][] = Array.from({ length: nv }, () => []);
  opts.points.forEach((p) => buckets[r.int(0, nv - 1)].push(p));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    const pts = buckets[v];
    if (!pts.length) continue;
    const tg = makeTree(opts.species, (opts.seed ?? 1) * 31 + v * 7);
    const trunks = new THREE.InstancedMesh(tg.bark, barkMaterial(style.bark), pts.length);
    const crowns = tg.leaves ? new THREE.InstancedMesh(tg.leaves, leafMat, pts.length) : null;
    pts.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(r.range(-0.04, 0.04), r.range(0, Math.PI * 2), r.range(-0.04, 0.04)));
      s.setScalar(p.w);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
      trunks.setMatrixAt(i, m);
      if (crowns) {
        crowns.setMatrixAt(i, m);
        crowns.setColorAt(i, c.set(r.pick(style.tint)).multiplyScalar(r.range(0.85, 1.2)));
      }
    });
    trunks.castShadow = crowns ? false : !!opts.castShadow;
    trunks.receiveShadow = true;
    g.add(trunks);
    if (crowns) {
      crowns.castShadow = !!opts.castShadow;
      crowns.receiveShadow = true;
      g.add(crowns);
    }
    trunks.castShadow = !!opts.castShadow;
  }
  return g;
}

/** Arbres lointains : silhouettes simplifiées (niveau de détail bas) pour les forêts à l'horizon. */
export function farForest(points: THREE.Vector4[], seed = 3, conifer = false) {
  const r = rng(seed);
  const geo = conifer ? new THREE.ConeGeometry(2.6, 11, 7) : new THREE.IcosahedronGeometry(4, 1);
  if (conifer) geo.translate(0, 6.5, 0);
  else {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + fbm2(v.x * 0.6 + seed, v.z * 0.6 + v.y * 0.4) * 0.35);
      v.y = v.y * 0.85 + 7;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: !conifer });
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  points.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.y - 0.5, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.range(0, 6)), new THREE.Vector3(p.w, p.w * r.range(0.85, 1.25), p.w));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(conifer ? r.pick([0x2a4024, 0x324a2a]) : r.pick([0x4a6a2c, 0x5a7a34, 0x3e5e28, 0x6a8238])).multiplyScalar(r.range(0.8, 1.1)));
  });
  mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ sous-bois et prairie
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, pts: THREE.Vector4[], seed: number, colors?: number[], tilt = 0.1) {
  const r = rng(seed);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
  const m = new THREE.Matrix4(), c = new THREE.Color();
  pts.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(-tilt, tilt), r.range(0, Math.PI * 2), r.range(-tilt, tilt))), new THREE.Vector3(p.w, p.w * r.range(0.8, 1.2), p.w));
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, c.set(r.pick(colors)).multiplyScalar(r.range(0.85, 1.15)));
  });
  mesh.count = pts.length;
  mesh.receiveShadow = true;
  return mesh;
}

/** Buissons : boules de feuillage (cartes croisées) au ras du sol. */
export function bushes(pts: THREE.Vector4[], seed = 5) {
  const r = rng(seed);
  const cards: THREE.BufferGeometry[] = [];
  const center = new THREE.Vector3(0, 0.6, 0);
  for (let i = 0; i < 9; i++) leafCard(new THREE.Vector3(r.range(-0.7, 0.7), r.range(0.3, 1.1), r.range(-0.7, 0.7)), center, r.range(1.0, 1.5), r, cards);
  const geo = mergeGeometries(cards)!;
  return instanced(geo, foliageMat(leafClusterTex('broad'), { sway: 0.15, translucency: 0.4 }), pts, seed, [0x5a7a30, 0x4a6a2a, 0x6a8a38, 0x3e5a26]);
}

/** Fougères : frondes arquées disposées en rosette. */
export function ferns(pts: THREE.Vector4[], seed = 6) {
  const fr: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.PlaneGeometry(0.35, 1.2, 1, 6);
    g.translate(0, 0.6, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      p.setZ(k, y * y * 0.45);
      p.setY(k, y * (1 - y * 0.2));
    }
    g.rotateY((i / 7) * Math.PI * 2);
    fr.push(g);
  }
  const geo = mergeGeometries(fr)!;
  geo.rotateX(0);
  return instanced(geo, foliageMat(fernTex(), { sway: 0.3, translucency: 0.5 }), pts, seed, [0xffffff, 0xe0ffd0, 0xd8e8b0], 0.05);
}

/** Fleurs sauvages : tiges vertes + corolles colorées (deux maillages instanciés aux mêmes matrices). */
export function wildflowers(pts: THREE.Vector4[], seed = 7) {
  const r = rng(seed);
  const stem = new THREE.PlaneGeometry(0.02, 0.45);
  stem.translate(0, 0.22, 0);
  const stem2 = stem.clone().rotateY(Math.PI / 2);
  const stemGeo = mergeGeometries([stem, stem2])!;
  const head = new THREE.PlaneGeometry(0.075, 0.075);
  head.rotateX(-Math.PI / 2 + 0.5);
  head.translate(0, 0.46, 0);
  const g = new THREE.Group();
  const stems = instanced(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4a6a28, side: THREE.DoubleSide, roughness: 0.8 }), pts, seed, undefined, 0.2);
  const petals = canvasTex('flower', 64, 64, (g2) => {
    for (let k = 0; k < 6; k++) {
      g2.save();
      g2.translate(32, 32);
      g2.rotate((k / 6) * Math.PI * 2);
      g2.fillStyle = '#ffffff';
      g2.beginPath();
      g2.ellipse(0, -14, 7, 14, 0, 0, Math.PI * 2);
      g2.fill();
      g2.restore();
    }
    g2.fillStyle = '#e8c040';
    g2.beginPath();
    g2.arc(32, 32, 6, 0, Math.PI * 2);
    g2.fill();
  });
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xffffff, map: petals, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.06 }), Math.max(1, pts.length));
  const palette = [0xf4f0e8, 0xf0d040, 0xb070d0, 0xd02a2a, 0x5a7ad8, 0xf2a0c0, 0xf8f8f8, 0xe8c030];
  const c = new THREE.Color(), m = new THREE.Matrix4();
  // couleurs par massifs : la teinte dépend du lieu (bruit), pas du hasard pur
  pts.forEach((p, i) => {
    stems.getMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    const zone = Math.floor((fbm2(p.x * 0.05, p.z * 0.05) * 0.5 + 0.5) * palette.length * 2.2 + r.range(0, 2.5));
    heads.setColorAt(i, c.set(palette[Math.abs(zone) % palette.length]));
  });
  heads.count = pts.length;
  g.add(stems, heads);
  // les fleurs ondulent avec les herbes
  for (const mesh of [stems, heads]) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = WIND.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float k = max(0.0, position.y) / 0.46;
          transformed.x += sin(uTime * 1.6 + ip.x * 0.08 + ip.z * 0.11) * 0.08 * k * k;`);
    };
    mat.customProgramCacheKey = () => 'flower' + (mesh === stems ? 's' : 'h');
  }
  return g;
}

/** Roseaux et massettes au bord de l'eau. */
export function reeds(pts: THREE.Vector4[], seed = 8) {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const h = r.range(1.2, 2.0);
    const b = new THREE.PlaneGeometry(0.05, h, 1, 3);
    b.translate(r.range(-0.2, 0.2), h / 2, r.range(-0.2, 0.2));
    b.rotateY(r.range(0, 3));
    parts.push(b);
  }
  const cat = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 5);
  cat.translate(0, 1.7, 0);
  parts.push(cat.toNonIndexed());
  const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6a30, side: THREE.DoubleSide, roughness: 0.9 });
  return instanced(geo, mat, pts, seed, [0xffffff, 0xd8c890, 0xb0c080], 0.12);
}

/** Champ de blé : épis dorés en rangs, ondulant au vent. */
export function wheat(pts: THREE.Vector4[], seed = 9) {
  const b = new THREE.PlaneGeometry(0.06, 1.0, 1, 3);
  b.translate(0, 0.5, 0);
  const ear = new THREE.CylinderGeometry(0.025, 0.012, 0.16, 4);
  ear.translate(0, 1.05, 0);
  const geo = mergeGeometries([b.toNonIndexed(), b.clone().rotateY(Math.PI / 2).toNonIndexed(), ear.toNonIndexed()])!;
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8b860, side: THREE.DoubleSide, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float k = max(0.0, position.y);
        float wave = sin(uTime * 1.8 + ip.x * 0.15 + ip.z * 0.05) * 0.6 + 0.4 * sin(uTime * 3.2 + ip.z * 0.3);
        transformed.x += wave * 0.16 * k * k;`);
  };
  mat.customProgramCacheKey = () => 'wheat';
  return instanced(geo, mat, pts, seed, [0xffffff, 0xf0e0b0, 0xe8d090], 0.08);
}

/** Muret de pierres sèches le long d'une polyligne. */
export function stoneWall(path: THREE.Vector3[], seed = 10, height = 1.0) {
  const r = rng(seed);
  const stone = new THREE.IcosahedronGeometry(0.32, 1);
  const p = stone.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    v.multiplyScalar(1 + fbm2(v.x * 4, v.z * 4 + v.y * 3) * 0.3);
    p.setXYZ(i, v.x * 1.3, v.y * 0.75, v.z);
  }
  stone.computeVertexNormals();
  const pts: THREE.Matrix4[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    for (let d = 0; d < len; d += 0.55) {
      for (let row = 0; row < Math.round(height / 0.33); row++) {
        if (r.next() < 0.05) continue;
        const k = d / len;
        const pos = a.clone().lerp(b, k).add(new THREE.Vector3(r.range(-0.08, 0.08), 0.15 + row * 0.3, r.range(-0.08, 0.08)));
        const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(-0.2, 0.2), ang + Math.PI / 2 + r.range(-0.3, 0.3), r.range(-0.2, 0.2))), new THREE.Vector3().setScalar(r.range(0.75, 1.2)));
        pts.push(m);
      }
    }
  }
  const mat = rockify(new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 0.95, normalMap: normalTex('rock', 1) }), 2.5, 0.5, 0, 0.5);
  const mesh = new THREE.InstancedMesh(stone, mat, pts.length);
  const c = new THREE.Color();
  pts.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    // mousse sur certaines pierres
    mesh.setColorAt(i, r.next() < 0.3 ? c.set(0x6a7a48) : c.set(0xffffff).multiplyScalar(r.range(0.75, 1.05)));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Clôture de bois (poteaux et deux lisses). */
export function fence(path: THREE.Vector3[], seed = 11) {
  const r = rng(seed);
  const post = new THREE.BoxGeometry(0.12, 1.2, 0.12);
  post.translate(0, 0.6, 0);
  const posts: THREE.Matrix4[] = [], rails: THREE.Matrix4[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) {
      const pos = a.clone().lerp(b, k / n);
      posts.push(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(-0.06, 0.06), r.range(0, 3), r.range(-0.06, 0.06))), new THREE.Vector3(1, r.range(0.85, 1.05), 1)));
      if (k < n) {
        const p0 = a.clone().lerp(b, k / n), p1 = a.clone().lerp(b, (k + 1) / n);
        for (const h of [0.45, 0.9]) {
          const mid = p0.clone().add(p1).multiplyScalar(0.5);
          mid.y += h + r.range(-0.05, 0.05);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), p1.clone().sub(p0).normalize());
          rails.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(p0.distanceTo(p1) + 0.2, 1, 1)));
        }
      }
    }
  }
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95, normalMap: normalTex('planks', 1) });
  const g = new THREE.Group();
  const pm = new THREE.InstancedMesh(post, wood, posts.length);
  posts.forEach((m, i) => pm.setMatrixAt(i, m));
  const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 0.05), wood, rails.length);
  rails.forEach((m, i) => rm.setMatrixAt(i, m));
  pm.castShadow = rm.castShadow = true;
  g.add(pm, rm);
  return g;
}

/** Échantillonnage naturel : rejet par une fonction de densité (bruit, distance au chemin…). */
export function scatter(n: number, area: { x0: number; x1: number; z0: number; z1: number }, density: (x: number, z: number) => number, height: (x: number, z: number) => number, scale: [number, number], seed: number) {
  const r = rng(seed);
  const out: THREE.Vector4[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const x = r.range(area.x0, area.x1), z = r.range(area.z0, area.z1);
    if (r.next() > density(x, z)) continue;
    out.push(new THREE.Vector4(x, height(x, z), z, r.range(scale[0], scale[1])));
  }
  return out;
}
