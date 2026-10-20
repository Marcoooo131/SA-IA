// La vie : villageois et animaux instanciés, animés dans le shader (marche, travail, conversation,
// broutage, picorage, battement de queue), déplacés sur des trajets ; charrettes, sacs, caisses,
// tonneaux ; fumée des cheminées.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm2, rng } from '../core/math';
import { WIND } from './props';
import { normalTex } from './assets';

/**
 * Parties animées : 0 fixe, 1/2 membres en opposition (jambes, pattes en diagonale),
 * 3/4 bras en opposition, 5 tête (hochement, broutage, picorage), 6 queue (balancement).
 */
interface Part { geo: THREE.BufferGeometry; part: number; pivot: THREE.Vector3; skin?: boolean }

function assemble(parts: Part[]) {
  const geos = parts.map(({ geo, part, pivot, skin }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo).clone();
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    const pv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pv.set([pivot.x, pivot.y, pivot.z], i * 3);
    g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
    g.setAttribute('aSkin', new THREE.BufferAttribute(new Float32Array(n).fill(skin ? 1 : 0), 1));
    return g;
  });
  return mergeGeometries(geos)!;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** Villageois : tunique ou robe, capuchon / chapeau / coiffe, membres articulés. */
export function villagerGeometry(kind: 'man' | 'woman' | 'hood' | 'hat') {
  const p: Part[] = [];
  const hip = new THREE.Vector3(0, 0.92, 0), sh = new THREE.Vector3(0, 1.42, 0);
  for (const s of [-1, 1]) {
    const leg = T(new THREE.CylinderGeometry(0.075, 0.06, 0.85, 6), s * 0.1, 0.48, 0);
    const foot = T(new THREE.BoxGeometry(0.11, 0.08, 0.24), s * 0.1, 0.04, 0.04);
    p.push({ geo: leg, part: s < 0 ? 1 : 2, pivot: hip }, { geo: foot, part: s < 0 ? 1 : 2, pivot: hip });
    const arm = T(new THREE.CylinderGeometry(0.06, 0.05, 0.62, 6), s * 0.25, 1.12, 0);
    const hand = T(new THREE.SphereGeometry(0.055, 6, 4), s * 0.25, 0.78, 0.02);
    p.push({ geo: arm, part: s < 0 ? 4 : 3, pivot: sh.clone().setX(s * 0.24) }, { geo: hand, part: s < 0 ? 4 : 3, pivot: sh.clone().setX(s * 0.24), skin: true });
  }
  if (kind === 'woman') p.push({ geo: T(new THREE.CylinderGeometry(0.2, 0.42, 0.95, 10), 0, 0.55, 0), part: 0, pivot: hip });
  else p.push({ geo: T(new THREE.CylinderGeometry(0.21, 0.3, 0.45, 10), 0, 0.82, 0), part: 0, pivot: hip });
  p.push({ geo: T(new THREE.CylinderGeometry(0.19, 0.22, 0.62, 10), 0, 1.25, 0), part: 0, pivot: hip });
  p.push({ geo: T(new THREE.BoxGeometry(0.42, 0.06, 0.3), 0, 1.0, 0), part: 0, pivot: hip }); // ceinture
  p.push({ geo: T(new THREE.SphereGeometry(0.115, 10, 8), 0, 1.68, 0.01), part: 0, pivot: hip, skin: true });
  if (kind === 'hood') {
    p.push({ geo: T(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 1.7, -0.02), part: 0, pivot: hip });
    p.push({ geo: T(new THREE.ConeGeometry(0.28, 0.3, 10, 1, true), 0, 1.5, 0), part: 0, pivot: hip });
  } else if (kind === 'hat') {
    p.push({ geo: T(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 12), 0, 1.78, 0), part: 0, pivot: hip });
    p.push({ geo: T(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 10), 0, 1.85, 0), part: 0, pivot: hip });
  } else if (kind === 'woman') {
    p.push({ geo: T(new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 1.71, -0.01), part: 0, pivot: hip });
  } else {
    p.push({ geo: T(new THREE.SphereGeometry(0.118, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), 0, 1.7, -0.01), part: 0, pivot: hip });
  }
  return assemble(p);
}

/** Quadrupèdes et volaille. */
export function animalGeometry(kind: 'sheep' | 'horse' | 'cow' | 'chicken' | 'dog') {
  const p: Part[] = [];
  const legs = (w: number, l: number, hipY: number, len: number, r0: number, part = true) => {
    for (const [x, z, ph] of [[-w, l, 1], [w, -l, 1], [w, l, 2], [-w, -l, 2]] as const) {
      p.push({ geo: T(new THREE.CylinderGeometry(r0, r0 * 0.8, len, 6), x, hipY - len / 2, z), part: part ? ph : 0, pivot: new THREE.Vector3(x, hipY, z) });
    }
  };
  if (kind === 'sheep') {
    const body = new THREE.IcosahedronGeometry(0.45, 2);
    const bp = body.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(bp, i);
      v.multiplyScalar(1 + fbm2(v.x * 9, v.y * 9 + v.z * 7) * 0.12);
      bp.setXYZ(i, v.x * 0.85, v.y * 0.8, v.z * 1.35);
    }
    body.computeVertexNormals();
    p.push({ geo: T(body, 0, 0.72, 0), part: 0, pivot: new THREE.Vector3() });
    const head = T(new THREE.BoxGeometry(0.2, 0.22, 0.32), 0, 0.82, 0.68);
    p.push({ geo: head, part: 5, pivot: new THREE.Vector3(0, 0.82, 0.5), skin: true });
    for (const s of [-1, 1]) p.push({ geo: T(new THREE.BoxGeometry(0.14, 0.05, 0.08), s * 0.15, 0.88, 0.62), part: 5, pivot: new THREE.Vector3(0, 0.82, 0.5), skin: true });
    legs(0.2, 0.32, 0.45, 0.45, 0.045);
    p.forEach((x, i) => { if (i > 3 && x.part !== 0 && x.part !== 5) x.skin = true; });
  } else if (kind === 'chicken') {
    p.push({ geo: T(new THREE.SphereGeometry(0.14, 10, 8).scale(1, 0.9, 1.3), 0, 0.28, 0), part: 5, pivot: new THREE.Vector3(0, 0.18, -0.05) });
    p.push({ geo: T(new THREE.SphereGeometry(0.075, 8, 6), 0, 0.44, 0.14), part: 5, pivot: new THREE.Vector3(0, 0.18, -0.05) });
    p.push({ geo: T(new THREE.BoxGeometry(0.02, 0.06, 0.07), 0, 0.53, 0.14), part: 5, pivot: new THREE.Vector3(0, 0.18, -0.05), skin: true });
    p.push({ geo: T(new THREE.ConeGeometry(0.02, 0.06, 4).rotateX(Math.PI / 2), 0, 0.43, 0.23), part: 5, pivot: new THREE.Vector3(0, 0.18, -0.05), skin: true });
    p.push({ geo: T(new THREE.ConeGeometry(0.08, 0.18, 6).rotateX(-0.8), 0, 0.36, -0.18), part: 6, pivot: new THREE.Vector3(0, 0.3, -0.15) });
    for (const s of [-1, 1]) p.push({ geo: T(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), s * 0.05, 0.08, 0), part: s < 0 ? 1 : 2, pivot: new THREE.Vector3(s * 0.05, 0.16, 0), skin: true });
  } else {
    // cheval, vache, chien : corps, cou, tête, pattes, queue
    const S = kind === 'horse' ? 1 : kind === 'cow' ? 0.95 : 0.4;
    const hipY = 1.05 * S;
    p.push({ geo: T(new THREE.CapsuleGeometry(0.34 * S, 1.0 * S, 4, 10).rotateX(Math.PI / 2).scale(1, kind === 'cow' ? 1.15 : 1, 1), 0, hipY + 0.28 * S, 0), part: 0, pivot: new THREE.Vector3() });
    const neckPivot = new THREE.Vector3(0, hipY + 0.45 * S, 0.62 * S);
    const neckLen = kind === 'horse' ? 0.75 : 0.4;
    p.push({ geo: T(new THREE.CylinderGeometry(0.15 * S, 0.24 * S, neckLen * S, 8).rotateX(kind === 'horse' ? 0.6 : 1.1), 0, hipY + 0.68 * S, 0.88 * S), part: 5, pivot: neckPivot });
    p.push({ geo: T(new THREE.BoxGeometry(0.2 * S, 0.24 * S, 0.55 * S).rotateX(kind === 'horse' ? 0.9 : 0.3), 0, hipY + (kind === 'horse' ? 0.92 : 0.62) * S, (kind === 'horse' ? 1.2 : 1.12) * S), part: 5, pivot: neckPivot });
    for (const s of [-1, 1]) p.push({ geo: T(new THREE.ConeGeometry(0.05 * S, 0.16 * S, 4), s * 0.07 * S, hipY + (kind === 'horse' ? 1.17 : 0.8) * S, 1.02 * S), part: 5, pivot: neckPivot });
    if (kind === 'horse') p.push({ geo: T(new THREE.BoxGeometry(0.06, 0.5, 0.75).rotateX(0.6), 0, hipY + 0.82, 0.78), part: 5, pivot: neckPivot, skin: true }); // crinière
    legs(0.2 * S, 0.5 * S, hipY, hipY, 0.065 * S);
    p.push({ geo: T(new THREE.CylinderGeometry(0.05 * S, 0.02 * S, 0.7 * S, 5), 0, hipY - 0.05 * S, -0.72 * S), part: 6, pivot: new THREE.Vector3(0, hipY + 0.3 * S, -0.68 * S), skin: kind === 'horse' });
  }
  return assemble(p);
}

/** Matériau des créatures : membres articulés et teintes (tissu/peau) gérés dans le shader. */
function creatureMaterial(mode: 'people' | 'animal', skinColor: THREE.ColorRepresentation) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uSkin = { value: new THREE.Color(skinColor) };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPart; attribute vec3 aPivot; attribute float aSkin; attribute vec4 aAnim;
        uniform float uTime; uniform vec3 uSkin;
        mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
        mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // aAnim : x phase, y cadence (0 = immobile), z amplitude de marche, w mode (0 marche,1 travail,2 conversation,3 broutage,4 picorage)
        float ph = uTime * aAnim.y * 6.2831 + aAnim.x;
        float sw = sin(ph) * aAnim.z;
        float ang = 0.0;
        if (aPart > 0.5 && aPart < 1.5) ang = sw;
        else if (aPart > 1.5 && aPart < 2.5) ang = -sw;
        else if (aPart > 2.5 && aPart < 3.5) ang = -sw * 0.8 + (aAnim.w > 0.5 && aAnim.w < 1.5 ? -1.2 - 0.9 * max(0.0, sin(uTime * 4.0 + aAnim.x)) : 0.0) + (aAnim.w > 1.5 && aAnim.w < 2.5 ? -0.5 - 0.35 * sin(uTime * 2.2 + aAnim.x) : 0.0);
        else if (aPart > 3.5 && aPart < 4.5) ang = sw * 0.8;
        else if (aPart > 4.5 && aPart < 5.5) {
          float graze = aAnim.w > 2.5 && aAnim.w < 3.5 ? 0.9 + 0.12 * sin(uTime * 3.0 + aAnim.x) : 0.0;
          float peck = aAnim.w > 3.5 ? pow(max(0.0, sin(uTime * 2.7 + aAnim.x * 3.0)), 6.0) * 0.9 : 0.0;
          ang = graze + peck + 0.05 * sin(uTime * 0.9 + aAnim.x);
        }
        vec3 rel = transformed - aPivot;
        if (aPart > 5.5) rel = rotY(0.5 * sin(uTime * 3.5 + aAnim.x)) * rel;
        else rel = rotX(ang) * rel;
        transformed = aPivot + rel;
        // léger rebond de marche
        transformed.y += abs(cos(ph)) * 0.04 * aAnim.z;`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor.rgb = mix(vColor.rgb, uSkin * (0.8 + 0.4 * fract(sin(aAnim.x * 12.9898) * 437.585)), aSkin);
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'creature-' + mode;
  return m;
}

export interface Walker { path: THREE.Vector3[]; speed: number; offset: number; loop: boolean }

/**
 * Population instanciée d'un type (villageois ou animal). Chaque individu est soit immobile (pose donnée),
 * soit marcheur sur un trajet (position et orientation mises à jour chaque image).
 */
export class Crowd extends THREE.InstancedMesh {
  private walkers: (Walker | null)[] = [];
  private statics: THREE.Matrix4[] = [];
  private anim: Float32Array;
  constructor(geo: THREE.BufferGeometry, mode: 'people' | 'animal', capacity: number, skin: THREE.ColorRepresentation = 0xc89a7a) {
    const anim = new Float32Array(capacity * 4);
    geo = geo.clone();
    geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 4));
    super(geo, creatureMaterial(mode, skin), capacity);
    this.anim = anim;
    this.count = 0;
    this.castShadow = true;
    this.receiveShadow = true;
    this.frustumCulled = false;
  }
  /** Ajoute un individu. mode : 0 marche, 1 travail, 2 conversation, 3 broutage, 4 picorage. */
  spawn(opts: { pos?: THREE.Vector3; rotY?: number; walker?: Walker; color: THREE.ColorRepresentation; scale?: number; mode?: number; cadence?: number; stride?: number; seed?: number }) {
    const i = this.count++;
    const r = rng((opts.seed ?? i) + 17);
    const m = new THREE.Matrix4().compose(opts.pos ?? new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.rotY ?? 0), new THREE.Vector3().setScalar(opts.scale ?? 1));
    this.statics[i] = m;
    this.walkers[i] = opts.walker ?? null;
    this.setMatrixAt(i, m);
    this.setColorAt(i, new THREE.Color(opts.color));
    const moving = !!opts.walker;
    this.anim.set([r.range(0, 6.28), opts.cadence ?? (moving ? 0.9 * (opts.walker!.speed / 1.3) : 0), opts.stride ?? (moving ? 0.45 : 0), opts.mode ?? 0], i * 4);
    this.userData.scale ??= [];
    (this.userData.scale as number[])[i] = opts.scale ?? 1;
    return i;
  }
  update(t: number, ground?: (x: number, z: number) => number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      const w = this.walkers[i];
      if (!w) continue;
      // longueur du trajet
      const segs: number[] = [];
      let total = 0;
      for (let k = 0; k < w.path.length - 1; k++) { const l = w.path[k].distanceTo(w.path[k + 1]); segs.push(l); total += l; }
      let d = w.offset + t * w.speed;
      if (w.loop) d = ((d % total) + total) % total;
      else { d = d % (total * 2); if (d > total) d = total * 2 - d; }
      const back = !w.loop && (w.offset + t * w.speed) % (total * 2) > total;
      let k = 0;
      while (k < segs.length - 1 && d > segs[k]) { d -= segs[k]; k++; }
      const a = w.path[k], b = w.path[k + 1];
      p.copy(a).lerp(b, Math.min(1, d / segs[k]));
      if (ground) p.y = ground(p.x, p.z);
      const dir = b.clone().sub(a);
      let yaw = Math.atan2(dir.x, dir.z);
      if (back) yaw += Math.PI;
      q.setFromAxisAngle(up, yaw);
      m.compose(p, q, new THREE.Vector3().setScalar((this.userData.scale as number[])[i]));
      this.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) this.instanceMatrix.needsUpdate = true;
  }
}

export const CLOTH = [0x6a4a2a, 0x3a4a5a, 0x7a2a22, 0x4a5a3a, 0x8a7a5a, 0x5a3a4a, 0x2a3a2a, 0x9a8a6a, 0x4a3022, 0x6a6a72];

// ------------------------------------------------------------------ accessoires de la vie quotidienne
const woodMat = () => new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9, normalMap: normalTex('planks', 1) });

export function cart() {
  const g = new THREE.Group();
  const w = woodMat();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.6), w);
  bed.position.y = 0.95;
  g.add(bed);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 2.6), w);
    side.position.set(s * 0.72, 1.2, 0);
    g.add(side);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 6, 18), w);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(s * 0.85, 0.62, 0.1);
    g.add(wheel);
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.05), w);
      sp.position.copy(wheel.position);
      sp.rotation.x = (k / 6) * Math.PI;
      g.add(sp);
    }
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), w);
    shaft.position.set(s * 0.45, 0.85, 2.2);
    shaft.rotation.x = 0.12;
    g.add(shaft);
  }
  // chargement : sacs de grain et foin
  for (let k = 0; k < 4; k++) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 0.75, 1.3), new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 1, normalMap: normalTex('cloth', 2) }));
    sack.position.set(-0.35 + (k % 2) * 0.7, 1.25, -0.6 + Math.floor(k / 2) * 0.8);
    g.add(sack);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Tas de marchandises : caisses, sacs, tonneaux (instanciés). */
export function goods(points: THREE.Vector4[], seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const crate = new THREE.BoxGeometry(0.7, 0.6, 0.7);
  const sack = new THREE.SphereGeometry(0.33, 8, 6).scale(1, 0.8, 1.2);
  const barrel = new THREE.CylinderGeometry(0.36, 0.36, 0.9, 12, 3);
  const bp = barrel.attributes.position;
  for (let i = 0; i < bp.count; i++) { const k = 1 + (1 - (bp.getY(i) / 0.45) ** 2) * 0.12; bp.setX(i, bp.getX(i) * k); bp.setZ(i, bp.getZ(i) * k); }
  barrel.computeVertexNormals();
  const defs: [THREE.BufferGeometry, THREE.Material, number][] = [
    [crate, woodMat(), 0.3],
    [sack, new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 1, normalMap: normalTex('cloth', 2) }), 0.33],
    [barrel, new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85, normalMap: normalTex('planks', 1) }), 0.45],
  ];
  defs.forEach(([geo, mat, h], di) => {
    const pts = points.filter((_, i) => i % 3 === di);
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
    pts.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x + r.range(-0.3, 0.3), p.y + h * p.w, p.z + r.range(-0.3, 0.3)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.range(0, 6)), new THREE.Vector3().setScalar(p.w))));
    mesh.count = pts.length;
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  });
  return g;
}

/** Puits de pierre à toit de bois. */
export function well() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95, normalMap: normalTex('rock', 2) });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.9, 16, 1, true), stone);
  (ring.material as THREE.Material).side = THREE.DoubleSide;
  ring.position.y = 0.45;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 6, 18), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.05, metalness: 0.5 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  g.add(ring, rim, water);
  const w = woodMat();
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), w);
    post.position.set(s * 0.95, 1.1, 0);
    g.add(post);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.3), w);
    roof.position.set(0, 2.4, s * 0.5);
    roof.rotation.x = s * 0.6;
    g.add(roof);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6), w);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 1.7;
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.25, 8), w);
  bucket.position.set(0.3, 1.0, 0);
  g.add(axle, bucket);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Moulin à vent : tour de pierre, toit conique, ailes qui tournent. */
export function windmill() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xc8bca4, roughness: 0.95, normalMap: normalTex('plaster', 2) });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 10, 16), stone);
  tower.position.y = 5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 3.4, 16), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 }));
  roof.position.y = 11.7;
  g.add(tower, roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.2), woodMat());
  door.position.set(0, 1, 3.3);
  g.add(door);
  const sails = new THREE.Group();
  sails.position.set(0, 10.5, 3.4);
  const w = woodMat();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe0d8c4, roughness: 1, side: THREE.DoubleSide, normalMap: normalTex('cloth', 2) });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k / 4) * Math.PI * 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7.5, 0.15), w);
    spar.position.y = 3.75;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5.5), cloth);
    sail.position.set(0.9, 4.4, 0.05);
    arm.add(spar, sail);
    sails.add(arm);
  }
  g.add(sails);
  g.userData.sails = sails;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
