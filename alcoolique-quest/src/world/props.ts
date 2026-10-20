// Éléments de décor de la plaine oubliée : herbes ondulantes, pierres runiques, squelette colossal,
// carcasses de machines de guerre, silhouette de la cité lointaine.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, type Rng } from '../core/math';
import { rockify } from './terrain';
import { runeGlyphsTex } from './textures';

/** Uniforme de temps partagé par toutes les herbes. */
export const WIND = { uTime: { value: 0 }, uStrength: { value: 1 } };

/**
 * Champ d'herbes instancié : brins effilés, couleur d'or sec à olive sombre, ondulation par vagues de vent
 * (décalage dans le vertex shader, plus fort au sommet des brins).
 */
export function grassField(opts: { count: number; patches: { x: number; z: number; r: number; w: number }[]; height: (x: number, z: number) => number; seed?: number; bladeH?: number }) {
  const r = rng(opts.seed ?? 3);
  const H = opts.bladeH ?? 0.9;
  const blade = new THREE.PlaneGeometry(0.07, H, 1, 4);
  blade.translate(0, H / 2, 0);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i) / H;
    bp.setX(i, bp.getX(i) * (1 - y * 0.85));
    bp.setZ(i, y * y * 0.15);
  }
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uStrength = WIND.uStrength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uStrength;\nvarying float vH;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vH = uv.y;
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float gust = sin(ip.x * 0.08 + uTime * 1.6) * 0.5 + sin(ip.z * 0.11 + ip.x * 0.03 + uTime * 2.3) * 0.35 + sin(uTime * 4.1 + ip.x * 1.7 + ip.z * 1.3) * 0.15;
        float bend = uv.y * uv.y * uStrength * (0.35 + 0.35 * gust);
        transformed.x += bend * 0.9;
        transformed.z += bend * 0.35;
        transformed.y -= bend * bend * 0.25;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.35 + 0.75 * vH;')
      // translucidité : le contre-jour traverse les brins (sommets dorés)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vH * vH * 0.45;');
  };
  mat.customProgramCacheKey = () => 'grass';
  const mesh = new THREE.InstancedMesh(blade, mat, opts.count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  const palette = [0xb39a52, 0x8f7a3c, 0x6e6a34, 0xc4a868, 0x5a5a2c];
  const total = opts.patches.reduce((a, b) => a + b.w, 0);
  let k = 0;
  for (const patch of opts.patches) {
    const n = Math.floor((patch.w / total) * opts.count);
    for (let i = 0; i < n && k < opts.count; i++, k++) {
      const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * patch.r;
      p.set(patch.x + Math.cos(a) * d, 0, patch.z + Math.sin(a) * d);
      p.y = opts.height(p.x, p.z) - 0.05;
      q.setFromEuler(new THREE.Euler(r.range(-0.15, 0.15), r.range(0, Math.PI * 2), r.range(-0.15, 0.15)));
      const sc = r.range(0.55, 1.15);
      s.set(sc, sc * r.range(0.7, 1.3), sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, c.set(r.pick(palette)).multiplyScalar(r.range(0.75, 1.1)));
    }
  }
  mesh.count = k;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Menhir gravé de runes qui luisent faiblement. */
export function runestone(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(1.3, 4.6, 0.7, 6, 16, 3);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const taper = 1 - (y + 2.3) / 4.6 * 0.35;
    p.setX(i, p.getX(i) * taper + Math.sin(y * 2 + seed) * 0.04);
    p.setZ(i, p.getZ(i) * taper);
    if (y > 2.2) p.setY(i, y - Math.abs(p.getX(i)) * 0.6);
  }
  geo.computeVertexNormals();
  const glyphs = runeGlyphsTex();
  const mat = rockify(new THREE.MeshStandardMaterial({ color: 0x5f5d58, roughness: 0.95, emissive: 0x58b4ff, emissiveMap: glyphs, emissiveIntensity: 2.2 }), 1.4, 0.7, 0.0, 0.6);
  const stone = new THREE.Mesh(geo, mat);
  stone.position.y = 2.0;
  stone.rotation.set(r.range(-0.08, 0.08), r.range(0, 3), r.range(-0.1, 0.1));
  stone.castShadow = stone.receiveShadow = true;
  g.add(stone);
  g.userData.mat = mat;
  return g;
}

const boneMat = () => rockify(new THREE.MeshStandardMaterial({ color: 0xcfc4ac, roughness: 0.8 }), 0.9, 0.55, 0.0, 0.5);

/** Squelette de créature colossale à demi enfoui : colonne, côtes, crâne cornu. */
export function giantSkeleton(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const mat = boneMat();
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-30, -3, 0), new THREE.Vector3(-18, 2.5, 1), new THREE.Vector3(-4, 4.5, 0), new THREE.Vector3(10, 4, -1), new THREE.Vector3(22, 1, 0), new THREE.Vector3(32, -2, 2),
  ]);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const pt = spineCurve.getPoint(u);
    const v = new THREE.SphereGeometry(1, 8, 6);
    v.scale(0.7, 1.1 + Math.sin(u * Math.PI) * 0.6, 1.1);
    v.translate(pt.x, pt.y, pt.z);
    parts.push(v);
    const spike = new THREE.ConeGeometry(0.35, 2.2 * Math.sin(u * Math.PI) + 0.4, 5);
    spike.translate(pt.x, pt.y + 1.6 + Math.sin(u * Math.PI), pt.z);
    parts.push(spike);
  }
  // côtes : arcs qui plongent dans le sol
  for (let i = 0; i < 13; i++) {
    const u = 0.25 + (i / 12) * 0.5;
    const pt = spineCurve.getPoint(u);
    const size = 9 * Math.sin(u * Math.PI) + 2;
    for (const side of [-1, 1]) {
      if (r.next() < 0.12) continue; // côte manquante
      const pts = [
        pt.clone(),
        pt.clone().add(new THREE.Vector3(0.5, size * 0.35, side * size * 0.7)),
        pt.clone().add(new THREE.Vector3(1.2, -size * 0.25, side * size * 1.05)),
        pt.clone().add(new THREE.Vector3(1.6, -size * 0.85 - 3, side * size * 0.85)),
      ];
      // certaines côtes sont brisées à mi-longueur
      const rib = new THREE.CatmullRomCurve3(r.next() < 0.25 ? pts.slice(0, 3) : pts);
      const tube = new THREE.TubeGeometry(rib, 16, 0.32 + size * 0.02, 6, false);
      parts.push(tube.toNonIndexed());
    }
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('uv'); return p; }))!;
  merged.computeVertexNormals();
  const body = new THREE.Mesh(merged, mat);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // crâne cornu posé au sol
  const skull = new THREE.Group();
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 14), mat);
  cranium.scale.set(1.5, 0.9, 1);
  skull.add(cranium);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 10), mat);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(7, -0.8, 0);
  skull.add(snout);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 3.6), mat);
  jaw.position.set(4.5, -3.2, 0);
  jaw.rotation.z = -0.25;
  skull.add(jaw);
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    socket.position.set(3.5, 0.9, side * 2.3);
    skull.add(socket);
    const horn = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1, 2, side * 2.5), new THREE.Vector3(-5, 6, side * 5), new THREE.Vector3(-11, 5, side * 6), new THREE.Vector3(-14, 9, side * 4)]), 20, 0.9, 8), mat);
    skull.add(horn);
  }
  skull.position.set(40, 1, 3);
  skull.rotation.set(0.2, -0.4, -0.15);
  skull.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.add(skull);
  return g;
}

const woodMat = () => rockify(new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 1 }), 2.5, 0.6, 0, 0.4);

/** Trébuchet effondré : poutres brisées, roue renversée, contrepoids enfoncé. */
export function trebuchetWreck(r: Rng) {
  const g = new THREE.Group();
  const wood = woodMat();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6, metalness: 0.6 });
  const beam = (l: number, w: number) => new THREE.Mesh(new THREE.BoxGeometry(w, l, w), wood);
  for (const side of [-1, 1]) {
    const a = beam(12, 0.6);
    a.position.set(-2, 4.5, side * 2.2);
    a.rotation.z = 0.45;
    g.add(a);
    const b = beam(11, 0.6);
    b.position.set(2.5, 4, side * 2.2);
    b.rotation.z = -0.5;
    g.add(b);
    const base = beam(14, 0.7);
    base.rotation.z = Math.PI / 2;
    base.position.set(0, 0.35, side * 2.2);
    g.add(base);
  }
  const arm = beam(22, 0.7);
  arm.position.set(1, 6, 0);
  arm.rotation.set(0.1, 0, 1.15);
  g.add(arm);
  const armBroken = beam(7, 0.65);
  armBroken.position.set(-9, 0.6, 1.5);
  armBroken.rotation.set(0.3, 0.6, 1.5);
  g.add(armBroken);
  const box = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3), iron);
  box.position.set(6.2, 1, 0);
  box.rotation.set(0.2, 0.3, -0.3);
  g.add(box);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 6, 18), wood);
  wheel.position.set(-5, 0.5, -4);
  wheel.rotation.set(Math.PI / 2 - 0.15, 0, r.range(0, 1));
  g.add(wheel);
  for (let i = 0; i < 6; i++) {
    const sp = beam(4.2, 0.12);
    sp.position.copy(wheel.position);
    sp.rotation.set(Math.PI / 2 - 0.15, 0, (i / 6) * Math.PI);
    g.add(sp);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
  g.rotation.z = 0.08;
  return g;
}

/** Ossature d'une tour de siège effondrée. */
export function siegeTowerWreck() {
  const g = new THREE.Group();
  const wood = woodMat();
  const post = (x: number, z: number, h: number, tilt: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), wood);
    m.position.set(x, h / 2, z);
    m.rotation.z = tilt;
    g.add(m);
  };
  post(-2.5, -2.5, 14, 0.08); post(2.5, -2.5, 10, -0.05); post(-2.5, 2.5, 13, 0.1); post(2.5, 2.5, 6, 0.3);
  for (let y = 2; y < 12; y += 3) {
    for (const z of [-2.5, 2.5]) {
      if (y > 9 && z > 0) continue;
      const cross = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 0.35), wood);
      cross.position.set(0, y, z);
      cross.rotation.z = (y % 2 ? 0.6 : -0.6) * 0.5;
      g.add(cross);
    }
  }
  g.rotation.z = 0.18;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}

/** Silhouette d'une cité gothique à l'horizon (formes simples, lumières chaudes). */
export function citySilhouette(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2730, roughness: 1 });
  const parts: THREE.BufferGeometry[] = [];
  // remparts
  for (let x = -260; x <= 260; x += 26) {
    const w = new THREE.BoxGeometry(27, 34, 10);
    w.translate(x, 17, 0);
    parts.push(w);
    if (Math.abs(x) % 78 === 0) {
      const t = new THREE.CylinderGeometry(9, 10, 58, 10);
      t.translate(x, 29, 2);
      parts.push(t);
      const roof = new THREE.ConeGeometry(11, 22, 10);
      roof.translate(x, 69, 2);
      parts.push(roof);
    }
  }
  // toits et clochers derrière
  for (let i = 0; i < 70; i++) {
    const x = r.range(-240, 240), z = r.range(-220, -20);
    const h = r.range(30, 70) * (1 - Math.abs(x) / 400);
    const b = new THREE.BoxGeometry(r.range(14, 30), h, r.range(14, 30));
    b.translate(x, h / 2, z);
    parts.push(b);
    if (r.next() < 0.3) {
      const sp = new THREE.ConeGeometry(r.range(4, 7), r.range(25, 60), 6);
      sp.translate(x, h + 20, z);
      parts.push(sp);
    }
  }
  // la grande tour centrale et la cathédrale
  const tower = new THREE.CylinderGeometry(16, 22, 230, 12);
  tower.translate(0, 115, -120);
  parts.push(tower);
  const crown = new THREE.ConeGeometry(20, 70, 12);
  crown.translate(0, 265, -120);
  parts.push(crown);
  for (const sx of [-60, 60]) {
    const sp = new THREE.ConeGeometry(9, 110, 8);
    sp.translate(sx, 125, -80);
    parts.push(sp);
    const base = new THREE.BoxGeometry(20, 80, 20);
    base.translate(sx, 40, -80);
    parts.push(base);
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  g.add(new THREE.Mesh(merged, mat));
  // lumières de la cité
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }), 160);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    m.makeTranslation(r.range(-230, 230), r.range(6, 60), r.range(-200, 8));
    lights.setMatrixAt(i, m);
  }
  g.add(lights);
  return g;
}
