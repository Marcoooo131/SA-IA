// Terrains procéduraux : champ de hauteurs + couleurs par sommet (strates rocheuses, herbe, neige).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm2, rng, type Rng } from '../core/math';
import { ASSETS, type NormalName } from './assets';

export function heightfield(opts: {
  width: number;
  depth: number;
  segX: number;
  segZ: number;
  center?: [number, number];
  height: (x: number, z: number) => number;
  color: (x: number, y: number, z: number, slope: number, out: THREE.Color) => void;
  material?: Partial<THREE.MeshStandardMaterialParameters>;
  uvScale?: number;
  rockScale?: number;
  rockStrength?: number;
  rockBump?: number;
  tri?: { name: NormalName; scale: number; k: number } | null;
}) {
  const geo = new THREE.PlaneGeometry(opts.width, opts.depth, opts.segX, opts.segZ);
  geo.rotateX(-Math.PI / 2);
  if (opts.uvScale) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * opts.uvScale, uv.getY(i) * opts.uvScale);
  }
  const [cx, cz] = opts.center ?? [0, 0];
  geo.translate(cx, 0, cz);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, opts.height(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const slope = 1 - n.getY(i);
    opts.color(p.getX(i), p.getY(i), p.getZ(i), slope, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = rockify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...opts.material }), opts.rockScale ?? 0.05, opts.rockStrength ?? 0.55, 0.08, opts.rockBump ?? 1, opts.tri === undefined ? { name: 'rock', scale: 0.12, k: 0.55 } : opts.tri);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Arbre mort procédural (branches récursives fusionnées en une seule géométrie). */
export function deadTree(r: Rng, height = 6) {
  const parts: THREE.BufferGeometry[] = [];
  const grow = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const end = base.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.62, rad, len, 6, 1);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyQuaternion(q);
    g.translate(base.x, base.y, base.z);
    parts.push(g);
    if (depth <= 0) return;
    const n = depth > 2 ? 2 : r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().add(new THREE.Vector3(r.range(-0.9, 0.9), r.range(-0.1, 0.5), r.range(-0.9, 0.9))).normalize();
      grow(end, nd, len * r.range(0.55, 0.8), rad * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(r.range(-0.15, 0.15), 1, r.range(-0.15, 0.15)).normalize(), height * 0.45, height * 0.06, 5);
  const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }));
}

/** Rocher irrégulier (icosaèdre déformé par du bruit). */
export function rock(r: Rng, size: number, color: THREE.ColorRepresentation = 0x55524e) {
  const g = new THREE.IcosahedronGeometry(size, 2);
  const p = g.attributes.position;
  const ox = r.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const k = 1 + fbm2(v.x / size * 1.3 + ox, v.z / size * 1.3 + v.y / size) * 0.45;
    v.multiplyScalar(k);
    v.y *= 0.75;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, rockify(new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }), 2.2 / size, 0.6, 0.05));
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Ruines : colonnes brisées et arche, pour les crêtes et la plaine. */
export function ruins(seed: number, scale = 1, mat?: THREE.Material) {
  const r = rng(seed);
  const g = new THREE.Group();
  const m = mat ?? new THREE.MeshStandardMaterial({ color: 0x6d6760, roughness: 0.95 });
  const n = r.int(4, 7);
  for (let i = 0; i < n; i++) {
    const h = r.range(2, 9) * scale;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.65 * scale, h, 10), m);
    col.position.set((i - n / 2) * 3.2 * scale, h / 2, r.range(-0.6, 0.6) * scale);
    col.rotation.z = r.range(-0.08, 0.08);
    col.castShadow = col.receiveShadow = true;
    g.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 0.5 * scale, 1.6 * scale), m);
    cap.position.set(col.position.x, h + 0.25 * scale, col.position.z);
    if (r.next() < 0.6) g.add(cap);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3 * scale, 0.6 * scale, 6, 16, Math.PI), m);
  arch.position.set(r.range(-3, 3) * scale, 8 * scale, -3 * scale);
  arch.castShadow = true;
  const archL = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 8 * scale, 1.2 * scale), m);
  archL.position.set(arch.position.x - 3 * scale, 4 * scale, arch.position.z);
  const archR = archL.clone();
  archR.position.x = arch.position.x + 3 * scale;
  archR.scale.y = 0.55;
  archR.position.y = 2.2 * scale;
  g.add(arch, archL, archR);
  // fragments au sol
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(r.range(0.6, 1.6) * scale, r.range(0.4, 0.9) * scale, r.range(0.6, 1.6) * scale), m);
    b.position.set(r.range(-10, 10) * scale, 0.2 * scale, r.range(-5, 5) * scale);
    b.rotation.set(r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.3, 0.3));
    g.add(b);
  }
  // L'arche n'est conservée que sur certaines ruines
  if (r.next() < 0.4) { g.remove(arch); g.remove(archR); }
  return g;
}

/**
 * Détail rocheux procédural en espace monde (sans UV, donc sans étirement sur les parois verticales) :
 * grain, strates et variations de teinte injectés dans un MeshStandardMaterial.
 */
export function rockify<T extends THREE.MeshStandardMaterial>(mat: T, scale = 0.08, strength = 0.5, strata = 0.08, bump = 1, tri: { name: NormalName; scale: number; k: number } | null = { name: 'rock', scale: 0.25, k: 0.6 }): T {
  // relief photographique : normal map CC0 projetée en triplanaire (espace monde), sans UV
  const triTex = tri ? ASSETS.normals[tri.name] ?? null : null;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTri = { value: triTex };
    sh.uniforms.uTriScale = { value: tri?.scale ?? 1 };
    sh.uniforms.uTriK = { value: triTex ? tri!.k : 0 };
    sh.uniforms.uRockScale = { value: scale };
    sh.uniforms.uRockStrength = { value: strength };
    sh.uniforms.uStrata = { value: strata };
    sh.uniforms.uBump = { value: bump };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;\nvarying vec3 vRockN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRockN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRockPos;
        varying vec3 vRockN;
        uniform float uRockScale, uRockStrength, uStrata, uBump, uTriScale, uTriK;
        uniform sampler2D uTri;
        float rh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float rn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(rh(i), rh(i+vec3(1,0,0)), f.x), mix(rh(i+vec3(0,1,0)), rh(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(rh(i+vec3(0,0,1)), rh(i+vec3(1,0,1)), f.x), mix(rh(i+vec3(0,1,1)), rh(i+vec3(1,1,1)), f.x), f.y), f.z); }
        float rfbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * rn(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float g = rfbm(vRockPos * uRockScale);
          float fine = rn(vRockPos * uRockScale * 9.0);
          float steep = 1.0 - abs(vRockN.y);
          float str = sin(vRockPos.y * 0.35 + g * 6.0) * uStrata * steep;
          diffuseColor.rgb *= (1.0 - uRockStrength * 0.5) + uRockStrength * (g * 0.8 + fine * 0.2) + str;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // relief procédural : perturbation de la normale par le gradient écran du bruit
          float hgt = (rfbm(vRockPos * uRockScale * 3.0) + rn(vRockPos * uRockScale * 14.0) * 0.25) * uBump;
          vec2 dH = vec2(dFdx(hgt), dFdy(hgt));
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
          normal = normalize(abs(det) * normal - grad);
          if (uTriK > 0.0) {
            vec3 wn = normalize(vRockN);
            vec3 bw = pow(abs(wn), vec3(4.0));
            bw /= dot(bw, vec3(1.0));
            vec3 tx = texture2D(uTri, vRockPos.zy * uTriScale).xyz * 2.0 - 1.0;
            vec3 ty = texture2D(uTri, vRockPos.xz * uTriScale).xyz * 2.0 - 1.0;
            vec3 tz = texture2D(uTri, vRockPos.xy * uTriScale).xyz * 2.0 - 1.0;
            // mélange « whiteout » des trois projections
            vec3 nx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x).zyx;
            vec3 ny = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y).xzy;
            vec3 nz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
            vec3 wN = normalize(nx * bw.x + ny * bw.y + nz * bw.z);
            vec3 vN = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
            normal = normalize(mix(normal, vN, uTriK));
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => `rock-${scale}-${strength}-${strata}-${bump}-${triTex ? tri!.name + tri!.scale : 'x'}`;
  return mat;
}
