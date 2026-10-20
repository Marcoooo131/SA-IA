// SCÈNE 3 — LA PLAINE OUBLIÉE (30 → 42 s)
// Une campagne verdoyante sous un soleil d'après-midi : prairies fleuries, collines boisées, rivière bordée
// de roseaux et de saules, chemin de terre, champs, murets, hameau habité (moulin, puits, fumées,
// villageois, troupeaux). Les vestiges d'une catastrophe ancienne (squelette colossal, machines de guerre,
// pierre runique) sont envahis par la végétation. Dernier plan : travelling aérien derrière l'aigle.
import * as THREE from 'three';
import type { CineScene, PostParams, Quality } from '../core/director';
import { inShot, prog } from '../core/timeline';
import { TimedPath, setCam } from '../core/camera';
import { clamp, ease, fbm2, lerp, rng, smoothstep } from '../core/math';
import { Eagle } from '../world/eagle';
import { skyDome, sunlight } from '../world/sky';
import { deadTree, heightfield, rock, ruins } from '../world/terrain';
import { WIND, citySilhouette, giantSkeleton, grassField, runestone, trebuchetWreck } from '../world/props';
import { Particles, ambientMotes } from '../fx/particles';
import { godRay } from '../fx/magic';
import { ASSETS, applyEnvironment, normalTex } from '../world/assets';
import { bushes, farForest, fence, ferns, forest, reeds, scatter, stoneWall, wheat, wildflowers } from '../world/vegetation';
import { HouseSet, makeHouse } from '../world/houses';
import { CLOTH, Crowd, animalGeometry, cart, goods, villagerGeometry, well, windmill } from '../world/life';
import { cloudPuff } from '../world/textures';

const roadX = (z: number) => 18 * Math.sin(z * 0.006) + 6 * Math.sin(z * 0.023);
const riverX = (z: number) => 150 + 70 * Math.sin(z * 0.0035 + 1) + 20 * Math.sin(z * 0.011);
const HAMLET = new THREE.Vector3(48, 0, -275);
const MILL = new THREE.Vector3(135, 0, -360);

/** Relief : collines douces, coteaux boisés sur les côtés, lit de rivière et chemin creusés. */
function baseH(x: number, z: number) {
  const hills = fbm2(x * 0.0022 + 3, z * 0.0022, 4) * 30 + fbm2(x * 0.009, z * 0.009, 3) * 4.5 + fbm2(x * 0.04, z * 0.04, 2) * 0.5;
  const side = smoothstep(170, 650, Math.abs(x - 30)) * (55 + fbm2(x * 0.004, z * 0.004) * 45);
  // la zone des premiers plans reste douce (composition stable)
  const calm = smoothstep(60, 220, Math.hypot(x - 10, (z + 60) * 0.8));
  const knoll = 9 * Math.exp(-((x - MILL.x) ** 2 + (z - MILL.z) ** 2) / 1800);
  return hills * (0.35 + 0.65 * calm) + side + knoll;
}
const ground = (x: number, z: number) => {
  let h = baseH(x, z);
  const dr = Math.abs(x - roadX(z));
  if (dr < 5) h -= (5 - dr) * 0.06;
  const dv = Math.abs(x - riverX(z));
  h -= 4.2 * (1 - smoothstep(5, 17, dv));
  // le hameau est bâti sur un terrain aplani
  const dh = Math.hypot(x - HAMLET.x, z - HAMLET.z);
  if (dh < 70) h = lerp(baseH(HAMLET.x, HAMLET.z), h, smoothstep(40, 70, dh));
  return h;
};
/** Champs autour du hameau : parcelles alignées (labours, blé, prés de fauche). */
function fieldAt(x: number, z: number): 0 | 1 | 2 {
  if (x < 70 || x > 220 || z > -150 || z < -460) return 0;
  if (Math.abs(x - riverX(z)) < 22) return 0;
  const u = x * 0.8 + z * 0.6, v = -x * 0.6 + z * 0.8;
  const cell = Math.floor(u / 42) * 7 + Math.floor(v / 55) * 3;
  const k = ((cell % 3) + 3) % 3;
  return k === 0 ? 1 : k === 1 ? 2 : 0;
}

export function createPlainScene(quality: Quality): CineScene {
  const hi = quality === 'high';
  const r = rng(8);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 9000);
  const fogColor = new THREE.Color(0xa8c4e0);
  scene.fog = new THREE.FogExp2(fogColor, 0.00028);
  // soleil d'après-midi, bien identifiable, rasant de trois quarts
  const sunDir = new THREE.Vector3(-0.62, 0.36, -0.5).normalize();
  const sky = skyDome({ top: 0x2858b8, horizon: 0xaccbe8, bottom: 0x6a7a5a, sunDir, sunColor: 0xfff0d6, sunSize: 0.9994, glow: 1.0, clouds: 0.2, cloudColor: 0xf4f6f8 });
  scene.add(sky);
  applyEnvironment(scene, 'sky', 0.5);
  const { sun } = sunlight(scene, { dir: sunDir, color: 0xffe2b8, intensity: 4.2, sky: 0xc8d8ea, ground: 0x5a6a30, hemi: 0.3 });
  sun.castShadow = true;
  sun.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -60; sc.right = sc.top = 60; sc.near = 1; sc.far = 900;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;

  // ------------------------------------------------------------------ terrain (couleurs « splat » par zone)
  const C = (hex: number) => new THREE.Color(hex);
  const greens = [C(0x4e7a26), C(0x3f6a20), C(0x6a8a2e), C(0x5a7e2a), C(0x7a8a38)];
  const terrain = heightfield({
    width: 4200, depth: 4200, segX: hi ? 360 : 200, segZ: hi ? 360 : 200, center: [0, -1000],
    height: ground,
    color: (x, _y, z, slope, c) => {
      const n = fbm2(x * 0.012, z * 0.012) * 0.5 + 0.5;
      const n2 = fbm2(x * 0.06 + 9, z * 0.06) * 0.5 + 0.5;
      c.copy(greens[Math.min(4, Math.floor(n * 5))]).lerp(greens[Math.min(4, Math.floor(n2 * 5))], 0.5);
      // prairie plus sèche sur les bosses, plus grasse dans les creux
      c.multiplyScalar(0.85 + n2 * 0.3);
      if (forestDensity(x, z) > 0.35) c.lerp(C(0x2e4018), 0.6); // sous-bois
      const f = fieldAt(x, z);
      if (f === 1) c.copy(C(0xc8a858)).lerp(C(0xa88a40), n2); // blé mûr
      if (f === 2) c.copy((Math.floor((x * 0.8 + z * 0.6) / 1.6) % 2 === 0) ? C(0x5a4028) : C(0x6a4c30)); // labours
      const dv = Math.abs(x - riverX(z));
      if (dv < 17) c.lerp(C(0x3a3422), 1 - smoothstep(8, 17, dv)); // berges boueuses
      const dr = Math.abs(x - roadX(z));
      if (dr < 3.6) {
        c.lerp(C(0x8a7458), 0.9 * (1 - smoothstep(2.6, 3.6, dr)));
        if (Math.abs(dr - 0.9) < 0.25) c.multiplyScalar(0.7); // ornières
        if (Math.abs(dr) < 0.35) c.lerp(C(0x5a7a2a), 0.5); // herbe au milieu du chemin
      }
      if (Math.hypot(x - HAMLET.x, z - HAMLET.z) < 34) c.lerp(C(0x7a6a50), 0.5 * (1 - smoothstep(20, 34, Math.hypot(x - HAMLET.x, z - HAMLET.z))));
      if (slope > 0.35) c.lerp(C(0x7a7266), smoothstep(0.35, 0.6, slope)); // affleurements rocheux
    },
    rockScale: 0.35,
    rockStrength: 0.35,
    rockBump: 0.18,
    tri: { name: 'earth', scale: 0.35, k: 0.3 },
  });
  scene.add(terrain);
  function forestDensity(x: number, z: number) {
    if (Math.abs(x - roadX(z)) < 12 || Math.abs(x - riverX(z)) < 20 || fieldAt(x, z) || Math.hypot(x - HAMLET.x, z - HAMLET.z) < 60) return 0;
    const west = smoothstep(-120, -220, x) * smoothstep(-40, -120, z);
    const east = smoothstep(260, 340, x);
    const copse = smoothstep(0.42, 0.6, fbm2(x * 0.008 + 40, z * 0.008));
    return Math.max(west, east, copse) * (0.55 + 0.45 * (fbm2(x * 0.03, z * 0.03) * 0.5 + 0.5));
  }

  // ------------------------------------------------------------------ eau : rivière qui serpente
  const rivPts: THREE.Vector3[] = [];
  for (let z = 400; z >= -2200; z -= 20) rivPts.push(new THREE.Vector3(riverX(z), 0, z));
  const rivGeo = new THREE.PlaneGeometry(1, 1, 1, rivPts.length - 1);
  {
    const p = rivGeo.attributes.position, uv = rivGeo.attributes.uv;
    for (let i = 0; i < rivPts.length; i++) {
      const c = rivPts[i];
      const next = rivPts[Math.min(rivPts.length - 1, i + 1)], prev = rivPts[Math.max(0, i - 1)];
      const dir = next.clone().sub(prev).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const w = 11 + 3 * Math.sin(i * 0.4);
      const y = baseH(c.x, c.z) - 2.6;
      for (let k = 0; k < 2; k++) {
        const idx = i * 2 + k;
        const s = k === 0 ? -1 : 1;
        p.setXYZ(idx, c.x + side.x * w * s, y, c.z + side.z * w * s);
        uv.setXY(idx, k * 2, i * 1.5);
      }
    }
    rivGeo.computeVertexNormals();
  }
  const waterN = normalTex('water', 1);
  const river = new THREE.Mesh(
    rivGeo,
    new THREE.MeshPhysicalMaterial({ color: 0x1e3a40, roughness: 0.06, metalness: 0.0, normalMap: waterN, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.6, envMapIntensity: 1.4, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
  );
  river.receiveShadow = true;
  scene.add(river);

  // ------------------------------------------------------------------ chemin, murets, clôtures
  const wallL: THREE.Vector3[] = [], wallR: THREE.Vector3[] = [];
  for (let z = -190; z >= -420; z -= 6) {
    const x = roadX(z);
    if (Math.abs(z - HAMLET.z) > 40) {
      wallL.push(new THREE.Vector3(x - 5.2, ground(x - 5.2, z), z));
      wallR.push(new THREE.Vector3(x + 5.2, ground(x + 5.2, z), z));
    }
  }
  const splitRuns = (pts: THREE.Vector3[]) => {
    const runs: THREE.Vector3[][] = [[]];
    pts.forEach((p, i) => { if (i && p.distanceTo(pts[i - 1]) > 8) runs.push([]); runs[runs.length - 1].push(p); });
    return runs.filter((x) => x.length > 1);
  };
  for (const run of [...splitRuns(wallL), ...splitRuns(wallR)]) scene.add(stoneWall(run, run.length));
  // pré à moutons clôturé
  const pasture = [[-95, -150], [-30, -150], [-25, -235], [-100, -240], [-95, -150]].map(([x, z]) => new THREE.Vector3(x, ground(x, z), z));
  const fencePts: THREE.Vector3[] = [];
  for (let i = 0; i < pasture.length - 1; i++) for (let k = 0; k < 8; k++) { const p = pasture[i].clone().lerp(pasture[i + 1], k / 8); p.y = ground(p.x, p.z); fencePts.push(p); }
  scene.add(fence(fencePts, 4));

  // ------------------------------------------------------------------ végétation
  const near = (x: number, z: number) => Math.hypot(x - 10, (z + 120) * 0.7) < 420;
  const dens = (x: number, z: number) => forestDensity(x, z);
  const area = { x0: -700, x1: 700, z0: -1300, z1: 200 };
  const treePts = (n: number, seed: number, scale: [number, number], filter: (x: number, z: number) => boolean) =>
    scatter(n, area, (x, z) => (filter(x, z) ? dens(x, z) : 0), ground, scale, seed);
  // arbres détaillés à proximité des trajectoires de caméra
  scene.add(forest({ species: 'oak', points: treePts(hi ? 160 : 70, 1, [0.8, 1.25], (x, z) => near(x, z) && fbm2(x * 0.01, z * 0.01) > -0.1), seed: 11, castShadow: true }));
  scene.add(forest({ species: 'birch', points: treePts(hi ? 110 : 50, 2, [0.8, 1.15], (x, z) => near(x, z) && fbm2(x * 0.01, z * 0.01) < 0.15), seed: 12, castShadow: true }));
  scene.add(forest({ species: 'pine', points: treePts(hi ? 140 : 60, 3, [0.8, 1.3], (x, z) => near(x, z) && (x < -200 || x > 260)), seed: 13, castShadow: true }));
  // saules et peupliers le long de la rivière et du chemin
  const willowPts: THREE.Vector4[] = [], poplarPts: THREE.Vector4[] = [];
  for (let z = 150; z > -900; z -= r.range(14, 30)) {
    const s = r.sign();
    const x = riverX(z) + s * r.range(17, 26);
    if (!fieldAt(x, z)) willowPts.push(new THREE.Vector4(x, ground(x, z), z, r.range(0.85, 1.2)));
  }
  for (let z = -160; z > -700; z -= r.range(16, 26)) {
    if (Math.abs(z - HAMLET.z) < 50) continue;
    const x = roadX(z) + r.sign() * r.range(8, 11);
    poplarPts.push(new THREE.Vector4(x, ground(x, z), z, r.range(0.85, 1.1)));
  }
  scene.add(forest({ species: 'willow', points: willowPts, seed: 14, castShadow: true }));
  scene.add(forest({ species: 'poplar', points: poplarPts, seed: 15, castShadow: true }));
  // forêts lointaines (niveau de détail bas)
  const farPts = scatter(hi ? 5500 : 2500, { x0: -2000, x1: 2000, z0: -2800, z1: 300 }, (x, z) => (near(x, z) ? 0 : dens(x, z) * 1.2), ground, [1.2, 2.2], 21);
  scene.add(farForest(farPts.filter((p) => p.x > -150 && p.x < 250), 4, false));
  scene.add(farForest(farPts.filter((p) => p.x <= -150 || p.x >= 250), 5, true));
  // sous-bois, buissons, fougères, fleurs, roseaux
  scene.add(bushes(scatter(hi ? 1400 : 600, area, (x, z) => (Math.abs(x - roadX(z)) < 6 || fieldAt(x, z) ? 0 : 0.15 + dens(x, z) * 0.8) * (near(x, z) ? 1 : 0.2), ground, [0.6, 1.4], 31), 31));
  scene.add(ferns(scatter(hi ? 900 : 400, { x0: -120, x1: 60, z0: -120, z1: 20 }, (x, z) => 0.1 + dens(x, z) + (Math.hypot(x + 22, z + 40) < 18 ? 0.8 : 0), ground, [0.7, 1.3], 32), 32));
  const flowerDens = (x: number, z: number) => {
    if (Math.abs(x - roadX(z)) < 3.5 || fieldAt(x, z) || dens(x, z) > 0.4) return 0;
    const massif = smoothstep(0.0, 0.5, fbm2(x * 0.02 + 5, z * 0.02));
    return massif * 0.9 + 0.08;
  };
  scene.add(wildflowers([
    ...scatter(hi ? 5000 : 1800, { x0: 10, x1: 46, z0: 0, z1: 34 }, () => 1, ground, [0.8, 1.3], 41),
    ...scatter(hi ? 2500 : 900, { x0: 10, x1: 75, z0: -150, z1: -85 }, flowerDens, ground, [0.8, 1.2], 42),
    ...scatter(hi ? 9000 : 3000, { x0: -150, x1: 200, z0: -500, z1: 60 }, flowerDens, ground, [0.8, 1.3], 43),
  ], 41));
  const reedPts: THREE.Vector4[] = [];
  for (let z = 200; z > -800; z -= hi ? 1.3 : 2.6) {
    for (const s of [-1, 1]) if (r.next() < 0.6) {
      const x = riverX(z) + s * r.range(10, 15);
      reedPts.push(new THREE.Vector4(x, ground(x, z), z + r.range(-1, 1), r.range(0.8, 1.3)));
    }
  }
  scene.add(reeds(reedPts, 51));
  // blé
  scene.add(wheat(scatter(hi ? 26000 : 9000, { x0: 70, x1: 220, z0: -460, z1: -150 }, (x, z) => (fieldAt(x, z) === 1 ? 1 : 0), ground, [0.85, 1.15], 61), 61));
  // herbes hautes animées (zones des plans rapprochés et bords de chemin)
  scene.add(grassField({
    count: hi ? 110000 : 36000,
    height: ground,
    bladeH: 0.62,
    palette: [0x5e8a2e, 0x4e7a26, 0x7a9a3a, 0x8aa040, 0x6a8a30, 0xa8a850],
    patches: [
      { x: 30, z: 18, r: 16, w: 8 },
      { x: -18, z: -32, r: 24, w: 5 },
      { x: 38, z: -112, r: 42, w: 7 },
      { x: 6, z: 20, r: 45, w: 6 },
      { x: 0, z: -70, r: 110, w: 6 },
    ],
  }));

  // ------------------------------------------------------------------ vestiges de la catastrophe ancienne
  const tree = deadTree(rng(5), 11);
  tree.position.set(-27, ground(-27, -44), -44);
  tree.castShadow = true;
  scene.add(tree);
  const stone = runestone(3);
  stone.position.set(-20, ground(-20, -37) - 0.3, -37);
  scene.add(stone);
  for (let i = 0; i < 9; i++) {
    const b = rock(r, r.range(0.4, 1.4), 0x6a665e);
    const x = -22 + r.range(-12, 12), z = -40 + r.range(-10, 10);
    b.position.set(x, ground(x, z) - 0.2, z);
    scene.add(b);
  }
  const skel = giantSkeleton(4);
  skel.position.set(42, ground(42, -122) - 1.6, -122);
  skel.rotation.y = 0.5;
  scene.add(skel);
  const treb = trebuchetWreck(r);
  treb.position.set(25, ground(25, -97), -97);
  treb.rotation.y = 1.1;
  scene.add(treb);
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x8a8476, roughness: 1, normalMap: normalTex('rock', 2) });
  for (const [x, z, s] of [[-48, -170, 1.4], [-160, -330, 1.8], [-30, -520, 2.2]] as const) {
    const rr = ruins(Math.round(x * 3), s, ruinMat);
    rr.position.set(x, ground(x, z) - 0.4, z);
    rr.rotation.y = r.range(0, 3);
    rr.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    scene.add(rr);
  }

  // ------------------------------------------------------------------ le hameau
  const protos = Array.from({ length: 10 }, (_, i) => makeHouse(400 + i, i % 3 === 0 ? 'farm' : 'village'));
  const houses = new HouseSet(protos);
  let hp = 0;
  for (let z = HAMLET.z + 36; z > HAMLET.z - 42; z -= r.range(13, 17)) {
    for (const s of [-1, 1]) {
      if (r.next() < 0.15) continue;
      const x = roadX(z) + s * r.range(15, 20);
      houses.add2(hp++ % protos.length, new THREE.Vector3(x, ground(x, z) - 0.15, z), s > 0 ? -Math.PI / 2 + r.range(-0.15, 0.15) : Math.PI / 2 + r.range(-0.15, 0.15));
    }
  }
  // fermes isolées
  for (const [x, z] of [[-60, -380], [210, -520], [-140, -620], [95, -150]] as const) houses.add2(hp++ % protos.length, new THREE.Vector3(x, ground(x, z) - 0.15, z), r.range(0, 6));
  houses.build(true);
  scene.add(houses);
  const wellM = well();
  wellM.position.set(roadX(HAMLET.z) + 7, ground(roadX(HAMLET.z) + 7, HAMLET.z), HAMLET.z);
  scene.add(wellM);
  const mill = windmill();
  mill.position.set(MILL.x, ground(MILL.x, MILL.z) - 0.3, MILL.z);
  mill.rotation.y = 0.9;
  scene.add(mill);
  const wagon = cart();
  scene.add(wagon);
  scene.add(goods(scatter(40, { x0: HAMLET.x - 40, x1: HAMLET.x + 40, z0: HAMLET.z - 40, z1: HAMLET.z + 40 }, (x, z) => (Math.abs(x - roadX(z)) > 6 && Math.abs(x - roadX(z)) < 12 ? 1 : 0), ground, [0.8, 1.1], 71), 71));

  // fumées des cheminées
  const smoke = new Particles(hi ? 1400 : 700, { additive: false, map: ASSETS.cloud ?? cloudPuff() });
  scene.add(smoke);

  // ------------------------------------------------------------------ habitants et animaux
  const kinds = ['man', 'woman', 'hood', 'hat'] as const;
  const crowds = kinds.map((k) => new Crowd(villagerGeometry(k), 'people', 40));
  crowds.forEach((c) => scene.add(c));
  const roadPath = (z0: number, z1: number) => {
    const pts: THREE.Vector3[] = [];
    for (let z = z0; z >= z1; z -= 8) pts.push(new THREE.Vector3(roadX(z) + r.range(-0.8, 0.8), 0, z));
    return pts;
  };
  for (let i = 0; i < 22; i++) {
    const c = crowds[i % 4];
    c.spawn({ walker: { path: roadPath(-120, -460), speed: r.range(1.0, 1.5), offset: r.range(0, 600), loop: false }, color: r.pick(CLOTH), seed: i });
  }
  // au puits : conversation ; aux champs : travail
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = wellM.position.clone().add(new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
    crowds[i % 4].spawn({ pos: p, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI / 2, color: r.pick(CLOTH), mode: i % 2 ? 2 : 0, cadence: 0.4, stride: 0.05, seed: 100 + i });
  }
  for (let i = 0; i < 14; i++) {
    let x = 0, z = 0;
    for (let k = 0; k < 40; k++) { x = r.range(80, 210); z = r.range(-440, -160); if (fieldAt(x, z)) break; }
    crowds[i % 4].spawn({ pos: new THREE.Vector3(x, ground(x, z), z), rotY: r.range(0, 6), color: r.pick(CLOTH), mode: 1, cadence: 0.5, stride: 0.05, seed: 200 + i });
  }
  const sheep = new Crowd(animalGeometry('sheep'), 'animal', 60, 0x2a2420);
  for (let i = 0; i < 48; i++) {
    const x = r.range(-92, -32), z = r.range(-232, -156);
    sheep.spawn({ pos: new THREE.Vector3(x, ground(x, z), z), rotY: r.range(0, 6), color: r.pick([0xe8e2d4, 0xd8d0c0, 0xf0ece0, 0x6a5a4a]), mode: 3, scale: r.range(0.85, 1.1), seed: 300 + i });
  }
  // quelques moutons du plan 3c, près du squelette
  for (let i = 0; i < 9; i++) {
    const x = r.range(55, 80), z = r.range(-115, -90);
    sheep.spawn({ pos: new THREE.Vector3(x, ground(x, z), z), rotY: r.range(0, 6), color: 0xe8e2d4, mode: 3, seed: 400 + i });
  }
  scene.add(sheep);
  const chickens = new Crowd(animalGeometry('chicken'), 'animal', 40, 0xc83a2a);
  for (let i = 0; i < 30; i++) {
    const p = HAMLET.clone().add(new THREE.Vector3(r.range(-30, 30), 0, r.range(-30, 30)));
    p.x = roadX(p.z) + r.sign() * r.range(5, 14);
    p.y = ground(p.x, p.z);
    chickens.spawn({ pos: p, rotY: r.range(0, 6), color: r.pick([0xf0e8d8, 0x8a5a2a, 0x3a2a1a, 0xd8a050]), mode: 4, seed: 500 + i });
  }
  scene.add(chickens);
  const horses = new Crowd(animalGeometry('horse'), 'animal', 6, 0x1a1410);
  const cartPath = roadPath(-60, -470);
  horses.spawn({ walker: { path: cartPath, speed: 1.2, offset: 120, loop: false }, color: 0x6a4a2a, seed: 600 });
  for (const [x, z] of [[roadX(HAMLET.z - 10) + 6, HAMLET.z - 10], [roadX(HAMLET.z + 14) - 6, HAMLET.z + 14]]) horses.spawn({ pos: new THREE.Vector3(x, ground(x, z), z), rotY: 1.6, color: r.pick([0x3a2a1a, 0x8a6a4a, 0x2a2420]), mode: 3, seed: 601 + x });
  scene.add(horses);
  const cows = new Crowd(animalGeometry('cow'), 'animal', 10, 0x2a2420);
  for (let i = 0; i < 8; i++) {
    const x = r.range(-20, 30), z = r.range(-420, -360);
    cows.spawn({ pos: new THREE.Vector3(x, ground(x, z), z), rotY: r.range(0, 6), color: r.pick([0x8a5a3a, 0xe8e0d0, 0x3a2a20]), mode: 3, seed: 700 + i });
  }
  scene.add(cows);

  // ------------------------------------------------------------------ ciel : cumulus, lointains
  // cumulus de beau temps : base ombrée, sommets éclairés, bas sur l'horizon
  const cloudMat = new THREE.SpriteMaterial({ map: ASSETS.cloud ?? cloudPuff(), color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  const cloudShade = new THREE.SpriteMaterial({ map: ASSETS.cloud ?? cloudPuff(), color: 0xd8dee8, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  for (let i = 0; i < 26; i++) {
    const a = r.range(-1.6, 1.6), d = r.range(3500, 5600);
    const base = new THREE.Vector3(Math.sin(a) * d, r.range(380, 720), -Math.cos(a) * d - 600);
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Sprite(k < 2 ? cloudShade : cloudMat);
      s.position.copy(base).add(new THREE.Vector3(r.range(-260, 260), k * 55 + r.range(0, 50), r.range(-120, 120)));
      const sz = r.range(300, 560);
      s.scale.set(sz * 1.5, sz, 1);
      scene.add(s);
    }
  }
  const city = citySilhouette(2);
  city.position.set(0, ground(0, -1500) - 5, -1500);
  scene.add(city);
  // montagnes lointaines bleutées
  const farMts = heightfield({
    width: 9000, depth: 2400, segX: 160, segZ: 40, center: [0, -3800],
    height: (x, z) => Math.max(0, fbm2(x * 0.0009, z * 0.0009, 5) * 500 + 260 + Math.abs(fbm2(x * 0.002, 1)) * 300) * smoothstep(-2700, -3300, z),
    color: (_x, y, _z, _s, c) => c.set(0x6a7a8e).lerp(new THREE.Color(0xf0f4f8), smoothstep(520, 700, y)),
    rockScale: 0.01,
  });
  scene.add(farMts);

  // ------------------------------------------------------------------ lumière dans le feuillage, poussières
  const motes = ambientMotes({ count: hi ? 700 : 300, box: new THREE.Vector3(100, 18, 160), center: new THREE.Vector3(10, 5, -50), color: 0xfff0c0, size: 0.04, speed: new THREE.Vector3(0.6, 0.1, 0.2), opacity: 0.7 });
  scene.add(motes);
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const ray = godRay({ length: 40, radiusTop: 1, radiusBottom: 5, color: 0xfff0c8, opacity: 0.09 });
    ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir.clone().negate());
    const x = -30 + r.range(-8, 8), z = -48 + r.range(-6, 6);
    ray.position.set(x, ground(x, z), z).addScaledVector(sunDir, 32);
    scene.add(ray);
    rays.push(ray);
  }

  // ------------------------------------------------------------------ l'aigle : travelling aérien
  const eagle = new Eagle();
  eagle.scale.setScalar(1.4);
  scene.add(eagle);
  const ePath = new TimedPath([
    [37.4, [36, 44, 70]],
    [38, [33, 43, 48]],
    [39.4, [26, 39, -10]],
    [40.8, [18, 41, -70]],
    [42, [10, 44, -125]],
    [42.6, [6, 45, -150]],
  ]);
  const ePos = new THREE.Vector3(), eVel = new THREE.Vector3(), eVel2 = new THREE.Vector3();
  const look = new THREE.Vector3(), pos = new THREE.Vector3(), tmp = new THREE.Vector3();
  let focus = 10;
  let lastT = 0;

  return {
    key: 'plain',
    scene,
    camera,
    update(t, dt) {
      WIND.uTime.value = t;
      WIND.uStrength.value = 1;
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      for (const ray of rays) (ray.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (stone.userData.mat as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.6;
      if (waterN) waterN.offset.set(t * 0.01, -t * 0.12);
      (mill.userData.sails as THREE.Group).rotation.z = -t * 0.6;
      for (const c of crowds) c.update(t, ground);
      horses.update(t, ground);
      // la charrette suit le cheval
      const hm = new THREE.Matrix4();
      horses.getMatrixAt(0, hm);
      const hpPos = new THREE.Vector3().setFromMatrixPosition(hm);
      const hq = new THREE.Quaternion().setFromRotationMatrix(hm);
      wagon.position.copy(hpPos).add(new THREE.Vector3(0, 0, -3.4).applyQuaternion(hq));
      wagon.position.y = ground(wagon.position.x, wagon.position.z);
      wagon.quaternion.copy(hq);

      // fumées
      const step = clamp(t - lastT, 0, 0.1);
      if (step > 0) {
        for (const ch of houses.chimneys) {
          if (Math.random() < step * 6) smoke.emit(1, { pos: ch, spread: 0.3, vel: new THREE.Vector3(0.6, 1.4, -0.2), velSpread: 0.25, life: [4, 7], size: [1.5, 2.6], color: 0xd8d4cc, color2: 0xa8a49c, gravity: -0.05, drag: 0.15, alpha: 0.45, grow: 2.5 });
        }
      }
      smoke.update(step);
      lastT = t;

      eagle.visible = t > 37.4;
      if (eagle.visible) {
        ePath.at(t, ePos);
        ePath.velocity(t, eVel);
        ePath.velocity(t - 0.3, eVel2);
        eagle.position.copy(ePos);
        eagle.lookAt(look.copy(ePos).add(eVel));
        const turn = eVel.x * eVel2.z - eVel.z * eVel2.x;
        eagle.rotateZ(clamp(turn * 0.004, -0.5, 0.5));
        eagle.fold = 0.18 + 0.06 * Math.sin(t * 0.7); // ailes légèrement repliées en vol plané
        eagle.legsTuck = 1;
        eagle.flapFreq = 2.1;
        eagle.flapAmp = t > 39.6 && t < 40.6 ? 0.55 : 0.04;
        eagle.headYaw = Math.sin(t * 0.9) * 0.25;
        eagle.headPitch = 0.15 + Math.sin(t * 1.3) * 0.05;
        eagle.tailSpread = 0.45;
        eagle.ruffle = 1;
        eagle.update(dt);
      }

      let fov = 35, shake = 0.004;
      if (inShot('3a', t)) {
        // macro au ras des herbes fleuries, travelling latéral lent
        const u = ease.inOutSine(prog('3a', t));
        const px = lerp(24, 31, u);
        pos.set(px, ground(px, 26) + 0.7, 26);
        look.set(px - 4, ground(px - 4, 10) + 1.3, 10);
        fov = 32; focus = 6;
      } else if (inShot('3b', t)) {
        // lisière de forêt : arbre mort, pierre runique, rais de lumière
        const u = ease.inOutSine(prog('3b', t));
        pos.set(lerp(-5, -8, u), ground(-6, -20) + lerp(1.5, 1.8, u), lerp(-17, -22, u));
        look.set(-22, ground(-22, -40) + 3.4, -40);
        fov = 40; focus = pos.distanceTo(look);
      } else if (inShot('3c', t)) {
        // le squelette colossal envahi par les herbes ; moutons, trébuchet
        const u = ease.inOutSine(prog('3c', t));
        const px = lerp(6, 16, u);
        pos.set(px, ground(px, -80) + 2.4, -80);
        look.set(lerp(38, 44, u), ground(40, -120) + 5, -120);
        fov = 44; focus = pos.distanceTo(look);
      } else {
        // travelling aérien derrière l'aigle : prairies, rivière, hameau, moulin, la cité au loin
        const u = ease.inOutSine(prog('3d', t));
        pos.copy(ePos).add(tmp.set(lerp(-6, -3, u), lerp(7, 4, u), lerp(20, 12, u)));
        pos.y = Math.max(pos.y, ground(pos.x, pos.z) + 8);
        const horizon = tmp.set(0, 60, -1500);
        look.copy(ePos).lerp(horizon, lerp(0.25, 0.08, u));
        fov = lerp(52, 46, u); focus = 40; shake = 0.012;
      }
      setCam(camera, pos, look, fov, Math.sin(t * 0.6) * (inShot('3d', t) ? 0.04 : 0), shake, t);
      sky.position.copy(camera.position);
      // zone d'ombres : suit le plan
      const span = inShot('3d', t) ? 160 : 60;
      if (sc.right !== span) { sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.updateProjectionMatrix(); }
      sun.target.position.copy(inShot('3d', t) ? ePos.clone().add(new THREE.Vector3(0, -30, -60)) : look.clone().lerp(pos, 0.5));
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 400);
    },
    post(t): Partial<PostParams> {
      const d = inShot('3d', t) ? null : { focus, aperture: inShot('3a', t) ? 0.0022 : 0.0008, maxblur: 0.005 };
      return { dof: d, exposure: 1.0, bloomStrength: 0.45, bloomThreshold: 0.85, saturation: 1.06, contrast: 1.06, lift: [0.01, 0.012, 0.02], gain: [1.03, 1.0, 0.96], vignette: 0.9 };
    },
  };
}
