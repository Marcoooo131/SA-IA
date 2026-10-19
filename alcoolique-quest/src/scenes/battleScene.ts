// SCÈNE 5 — LES HÉROS ET LES COMBATS (60 → 82 s)
// Six séquences lisibles, chacune centrée sur une action : le mage, l'épéiste, l'invocateur,
// le berserker, le rôdeur et sa flèche au ralenti, puis le Colosse qui se dresse.
import * as THREE from 'three';
import type { CineScene, PostParams, Quality } from '../core/director';
import { HITS, inShot } from '../core/timeline';
import { impactShake, setCam } from '../core/camera';
import { clamp, ease, lerp, remap, rng, smoothstep } from '../core/math';
import { cameraFill, skyDome, sunlight } from '../world/sky';
import { heightfield, rock } from '../world/terrain';
import { citySilhouette } from '../world/props';
import { cloudPuff } from '../world/textures';
import { Particles, ambientMotes } from '../fx/particles';
import { BladeTrail, Shockwave, drawnRuneCircle, glow, groundCracks, portalDisc, runeCircle } from '../fx/magic';
import { arrow as makeArrow, barrelMaul, makeBerserker, makeGuard, makeMage, makeRanger, makeSummoner, makeSwordsman, sword as makeSword } from '../world/characters';
import { SpectralBeast, makeColossus } from '../world/creatures';
import { Clip, addPose, idle, walk, type Pose } from '../world/rig';

/** Fenêtres de ralenti (début, fin, vitesse). */
const SLOW: [number, number, number][] = [
  [62.45, 62.95, 0.3],
  [64.75, 65.05, 0.35],
  [65.45, 65.9, 0.35],
  [72.3, 72.55, 0.3],
  [74.15, 74.45, 0.3],
  [75.05, 77.25, 0.22],
];
export const timeScale = (t: number) => {
  for (const [a, b, k] of SLOW) if (t >= a && t < b) return k;
  return 1;
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function createBattleScene(quality: Quality): CineScene {
  const hi = quality === 'high';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 6000);
  scene.fog = new THREE.FogExp2(0x2a1d1c, 0.0075);
  const sunDir = V(0.3, 0.1, 0.95).normalize();
  const sky = skyDome({ top: 0x0b0d16, horizon: 0x7a2c18, bottom: 0x1a1010, sunDir, sunColor: 0xff6a30, sunSize: 0.9996, glow: 1.3, clouds: 1, cloudColor: 0x1c1418, radius: 5000 });
  scene.add(sky);
  sunlight(scene, { dir: V(0.4, 0.5, 0.8), color: 0xff9a6a, intensity: 1.6, sky: 0x4a5070, ground: 0x24170f, hemi: 0.75 });
  const back = new THREE.DirectionalLight(0x8aa0ff, 1.2);
  back.position.set(-0.5, 0.6, -1).multiplyScalar(50);
  scene.add(back);
  const fill = cameraFill(scene, 0xd0d8ff, 0.8);

  // ------------------------------------------------------------------ décor : plaine dévastée
  const r = rng(13);
  const ground = heightfield({
    width: 900, depth: 900, segX: hi ? 200 : 120, segZ: hi ? 200 : 120,
    height: (x, z) => {
      const d = Math.hypot(x, z);
      return d < 70 ? 0 : (d - 70) * 0.02 * (1 + Math.sin(x * 0.03) * Math.cos(z * 0.025));
    },
    color: (x, _y, z, _s, c) => {
      const n = Math.sin(x * 0.3) * Math.sin(z * 0.27) * 0.02;
      c.setRGB(0.07 + n, 0.055 + n, 0.045);
    },
    rockScale: 0.6,
    rockStrength: 0.6,
    rockBump: 0.25,
  });
  scene.add(ground);
  for (let i = 0; i < 60; i++) {
    const b = rock(r, r.range(0.3, 2.2), 0x3a3430);
    const a = r.range(0, Math.PI * 2), d = r.range(14, 90);
    b.position.set(Math.cos(a) * d, -0.2, Math.sin(a) * d);
    if (Math.abs(b.position.x) < 6 && b.position.z > -30 && b.position.z < 40) continue;
    scene.add(b);
  }
  // crête rocheuse derrière laquelle dort le Colosse
  for (let i = 0; i < 16; i++) {
    const b = rock(r, r.range(4, 9), 0x2c2622);
    b.position.set(r.range(-50, 50), r.range(-1, 2), r.range(-36, -30));
    scene.add(b);
  }
  // épées plantées, bannières déchirées, braseros
  const heroSpots = [V(0, 0, 5), V(28, 0, 6), V(-26, 0, 8), V(4, 0, -24), V(-16, 0, -17), V(0, 0, 13)];
  for (let i = 0; i < 26; i++) {
    const s = makeSword(r.range(0.7, 1.0));
    s.position.set(r.range(-40, 40), -0.15, r.range(-30, 45));
    if (heroSpots.some((h) => h.distanceTo(s.position) < 10)) continue;
    s.rotation.set(Math.PI + r.range(-0.3, 0.3), r.range(0, 3), r.range(-0.3, 0.3));
    scene.add(s);
  }
  const fires: THREE.Vector3[] = [];
  for (const [x, z] of [[-9, 18], [12, 22], [-20, -8], [18, -12], [35, 10], [-36, 14], [0, 34]] as const) {
    const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x1c1a18, metalness: 0.7, roughness: 0.5 }));
    brazier.position.set(x, 0.55, z);
    scene.add(brazier);
    const flame = glow(0xff7a2a, 2.4, 0.9);
    flame.position.set(x, 1.6, z);
    scene.add(flame);
    fires.push(V(x, 1.3, z));
  }
  const fireLight = new THREE.PointLight(0xff7030, 60, 40, 2);
  fireLight.position.set(0, 3, 22);
  scene.add(fireLight);
  // la cité, au loin, en flammes
  const city = citySilhouette(9);
  city.position.set(0, 0, 900);
  city.rotation.y = Math.PI;
  scene.add(city);
  const embersAmb = ambientMotes({ count: hi ? 1400 : 600, box: V(120, 30, 120), center: V(0, 10, 0), color: 0xff8a40, size: 0.06, speed: V(0.6, 0.9, 0.3), opacity: 0.9 });
  scene.add(embersAmb);
  const ash = ambientMotes({ count: hi ? 900 : 400, box: V(100, 25, 100), center: V(0, 8, 0), color: 0x1a1414, size: 0.08, speed: V(0.4, -0.3, 0.2), additive: false, opacity: 0.8 });
  scene.add(ash);

  // ------------------------------------------------------------------ effets
  const sparks = new Particles(hi ? 2500 : 1200);
  const dust = new Particles(hi ? 900 : 450, { additive: false, map: cloudPuff() });
  scene.add(sparks, dust);
  const L1 = new THREE.PointLight(0x8ad0ff, 0, 30, 2);
  const L2 = new THREE.PointLight(0x3affc0, 0, 25, 2);
  scene.add(L1, L2);

  // ------------------------------------------------------------------ personnages
  const M0 = V(0, 0, 0), S0 = V(28, 0, 6), U0 = V(-26, 0, 4), B0 = V(4, 0, -28), R0 = V(-16, 0, -17);
  const mage = makeMage(), sw = makeSwordsman(), summ = makeSummoner(), bers = makeBerserker(), ranger = makeRanger();
  for (const c of [mage, sw, summ, bers, ranger]) scene.add(c.rig);

  interface Foe { c: ReturnType<typeof makeGuard>; home: THREE.Vector3; ry: number; hit?: number; dir?: THREE.Vector3; power?: number }
  const foes: Foe[] = [];
  const addFoe = (x: number, z: number, ry: number) => {
    const c = makeGuard(foes.length);
    c.rig.position.set(x, 0, z);
    c.rig.rotation.y = ry;
    scene.add(c.rig);
    const f: Foe = { c, home: V(x, 0, z), ry };
    foes.push(f);
    return f;
  };
  const mageFoes = [addFoe(-2.2, 14, Math.PI), addFoe(0.2, 15.6, Math.PI), addFoe(2.6, 14.4, Math.PI)];
  mageFoes.forEach((f, i) => { f.hit = HITS.fireballImpact; f.dir = V((i - 1) * 0.6, 0, 1).normalize(); f.power = 9; });
  const swordFoe = addFoe(S0.x, S0.z + 2.35, Math.PI);
  swordFoe.hit = HITS.spin + 0.35; swordFoe.dir = V(0.3, 0, 1).normalize(); swordFoe.power = 5;
  const wallFoes = [addFoe(B0.x - 1.6, -20.2, Math.PI), addFoe(B0.x, -19.8, Math.PI), addFoe(B0.x + 1.6, -20.2, Math.PI)];
  wallFoes.forEach((f, i) => { f.hit = HITS.maulSmash; f.dir = V((i - 1) * 0.8, 0, 1).normalize(); f.power = 11; });
  const arrowFoe = addFoe(10, 30, Math.PI + 0.5);
  arrowFoe.hit = HITS.arrowImpact; arrowFoe.dir = V(0.4, 0, 1).normalize(); arrowFoe.power = 2.2;
  // armée de fond (lisible en silhouette)
  const army: Foe[] = [];
  for (let i = 0; i < (hi ? 18 : 10); i++) army.push(addFoe(-24 + (i % 9) * 6 + r.range(-1, 1), 24 + Math.floor(i / 9) * 5 + r.range(-1, 1), Math.PI + r.range(-0.2, 0.2)));

  const beast = new SpectralBeast();
  beast.visible = false;
  scene.add(beast);
  const colossus = makeColossus();
  colossus.rig.position.set(0, -40, -48);
  scene.add(colossus.rig);

  // sort du mage
  const mageRunes = [runeCircle(0x8ad0ff, 0.75, 3), runeCircle(0xc0e4ff, 1.15, 7)];
  mageRunes.forEach((m) => { m.position.set(M0.x, 1.55, M0.z + 1.0); scene.add(m); });
  mageRunes[1].position.z += 0.25;
  const mageGround = runeCircle(0x6ab0ff, 2.4, 11);
  mageGround.rotation.x = -Math.PI / 2;
  mageGround.position.set(M0.x, 0.03, M0.z);
  scene.add(mageGround);
  const orb = new THREE.Group();
  const orbCore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  orb.add(orbCore, glow(0x8ad0ff, 1.1, 0.8), glow(0xffffff, 0.45, 0.8));
  scene.add(orb);
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  scene.add(fireball);
  const shock = new Shockwave(0xa8d8ff);
  shock.rotation.x = -Math.PI / 2;
  scene.add(shock);
  const shock2 = new Shockwave(0xffd8a0);
  shock2.rotation.x = -Math.PI / 2;
  scene.add(shock2);
  const shock3 = new Shockwave(0xffa060);
  shock3.rotation.x = -Math.PI / 2;
  scene.add(shock3);

  // invocation
  const summCircle = drawnRuneCircle(0x3affc0, 2.6, 5);
  summCircle.rotation.x = -Math.PI / 2;
  summCircle.position.set(U0.x, 0.04, U0.z + 0.6);
  scene.add(summCircle);
  const cracks = groundCracks(0x3affc0, 7);
  cracks.position.set(U0.x, 0.035, U0.z + 0.6);
  scene.add(cracks);
  const portal = new THREE.Group();
  const portalRing = runeCircle(0x3affc0, 2.4, 17);
  const portalCore = portalDisc(0x3affc0, 2.1);
  portal.add(portalCore, portalRing);
  portal.position.set(U0.x, 2.4, U0.z + 5.5);
  scene.add(portal);

  // lame de l'épéiste
  const trail = new BladeTrail(0xffc890, 14);
  scene.add(trail);

  // berserker : maillet-tonneau posé au sol, tête de hache détachable
  const maul = barrelMaul();
  maul.position.set(B0.x + 2.3, 0.45, -22.6);
  maul.rotation.set(Math.PI / 2 - 0.1, 0, 0.6);
  scene.add(maul);
  const axeHead = bers.axe.userData.head as THREE.Mesh;
  const flyingHead = axeHead.clone();
  flyingHead.visible = false;
  scene.add(flyingHead);
  const flyingHandle = (bers.axe.userData.shaft as THREE.Mesh).clone();
  flyingHandle.visible = false;
  scene.add(flyingHandle);

  // flèche
  const flyingArrow = makeArrow();
  flyingArrow.scale.setScalar(1.4);
  scene.add(flyingArrow);
  const arrowGlow = glow(0xffe8c0, 0.12, 0.5);
  flyingArrow.add(arrowGlow);
  const arrowFrom = V(R0.x + 1.2, 3.3, R0.z + 1.8);
  const arrowTo = V(10, 2.15, 30);

  // ------------------------------------------------------------------ chorégraphies (temps réel, ralentis intégrés)
  const mageClip = new Clip([
    { t: 60.0, pose: { upperArmR: [-0.3, 0, -0.1], foreArmR: [-0.4, 0, 0] } },
    { t: 60.45, pose: { upperArmR: [-0.3, 0, -0.1], foreArmR: [-0.4, 0, 0], head: [0.1, 0, 0] } },
    { t: 61.0, pose: { upperArmL: [-1.9, 0, 0.35], foreArmL: [-0.35, 0, 0], upperArmR: [-1.9, 0, -0.35], foreArmR: [-0.35, 0, 0], spine: [-0.18, 0, 0], head: [-0.25, 0, 0], thighL: [-0.25, 0, 0], thighR: [0.2, 0, 0], shinR: [0.2, 0, 0] } },
    { t: 61.5, pose: { upperArmL: [-1.4, 0, 0.15], foreArmL: [-0.6, 0, 0], upperArmR: [-1.4, 0, -0.15], foreArmR: [-0.6, 0, 0], spine: [-0.08, 0, 0], head: [-0.05, 0, 0], thighL: [-0.25, 0, 0], thighR: [0.2, 0, 0], shinR: [0.2, 0, 0] } },
    { t: 61.65, pose: { upperArmL: [-1.62, 0, 0.05], foreArmL: [-0.05, 0, 0], upperArmR: [-1.62, 0, -0.05], foreArmR: [-0.05, 0, 0], spine: [0.22, 0, 0], head: [-0.1, 0, 0], thighL: [-0.5, 0, 0], shinL: [0.2, 0, 0], thighR: [0.35, 0, 0], shinR: [0.3, 0, 0], root: [0, -0.06, 0.15] }, ease: ease.outCubic },
    { t: 63.6, pose: { upperArmL: [-1.3, 0, 0.1], foreArmL: [-0.2, 0, 0], upperArmR: [-1.3, 0, -0.1], foreArmR: [-0.2, 0, 0], spine: [0.12, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.2, 0, 0], thighR: [0.3, 0, 0], shinR: [0.3, 0, 0], root: [0, -0.04, 0.15] } },
  ]);
  const guardSwing = new Clip([
    { t: 63.6, pose: { upperArmR: [-0.6, 0, -0.2], foreArmR: [-0.6, 0, 0] } },
    { t: 64.05, pose: { upperArmR: [-2.9, 0, -0.1], foreArmR: [-0.5, 0, 0], spine: [-0.15, 0, 0] } },
    { t: 64.17, pose: { upperArmR: [-1.75, 0, -0.1], foreArmR: [-0.1, 0, 0], spine: [0.15, 0, 0] }, ease: ease.inCubic },
    { t: 64.5, pose: { upperArmR: [-1.7, 0.8, -0.6], foreArmR: [-0.3, 0, 0], spine: [0.0, 0.4, 0] } },
    { t: 64.9, pose: { upperArmR: [-1.5, -1.0, -0.7], foreArmR: [-0.1, 0, 0], spine: [0.1, -0.5, 0] }, ease: ease.inCubic },
    { t: 65.9, pose: { upperArmR: [-1.0, -0.6, -0.4], foreArmR: [-0.4, 0, 0], spine: [0.05, -0.2, 0] } },
  ]);
  const swordClip = new Clip([
    { t: 63.6, pose: { upperArmR: [-0.8, 0, -0.1], foreArmR: [-0.7, 0, 0], thighL: [-0.3, 0, 0], thighR: [0.3, 0, 0], shinR: [0.3, 0, 0] } },
    { t: 64.1, pose: { upperArmR: [-2.5, 0, -0.5], foreArmR: [-1.1, 0, 0], upperArmL: [-2.4, 0, 0.6], foreArmL: [-1.2, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.3, 0, 0], thighR: [0.4, 0, 0], shinR: [0.5, 0, 0], root: [0, -0.15, 0] } },
    { t: 64.4, pose: { upperArmR: [-2.4, 0, -0.5], foreArmR: [-1.1, 0, 0], upperArmL: [-2.3, 0, 0.6], foreArmL: [-1.2, 0, 0], thighL: [-0.5, 0, 0], shinL: [0.5, 0, 0], thighR: [0.5, 0, 0], shinR: [0.7, 0, 0], root: [0, -0.25, -0.1] } },
    // esquive : renversé en arrière, la lame ennemie passe au-dessus
    { t: 64.8, pose: { spine: [-0.55, 0, 0.15], chest: [-0.35, 0, 0], head: [-0.3, 0, 0], upperArmR: [-0.5, 0, -0.9], foreArmR: [-0.3, 0, 0], upperArmL: [0.4, 0, 1.0], thighL: [-0.9, 0, 0], shinL: [1.3, 0, 0], thighR: [0.2, 0, 0], shinR: [1.0, 0, 0], root: [-0.4, -0.55, -0.4] } },
    { t: 65.15, pose: { spine: [-0.6, 0, 0.2], chest: [-0.4, 0, 0], head: [-0.3, 0, 0], upperArmR: [-0.5, 0, -0.9], foreArmR: [-0.3, 0, 0], upperArmL: [0.4, 0, 1.0], thighL: [-0.9, 0, 0], shinL: [1.3, 0, 0], thighR: [0.2, 0, 0], shinR: [1.0, 0, 0], root: [-0.5, -0.6, -0.4] } },
    // contre-attaque circulaire : bras tendu, rotation complète
    { t: 65.35, pose: { spine: [0.15, 0, 0], upperArmR: [-1.5, 0, -1.3], foreArmR: [-0.05, 0, 0], upperArmL: [-0.4, 0, 1.2], thighL: [-0.5, 0, 0], shinL: [0.4, 0, 0], thighR: [0.4, 0, 0], shinR: [0.5, 0, 0], root: [0, -0.25, 0.2] } },
    { t: 66.1, pose: { spine: [0.25, 0, 0], upperArmR: [-1.4, 0, -1.2], foreArmR: [0, 0, 0], upperArmL: [-0.4, 0, 1.3], thighL: [-0.6, 0, 0], shinL: [0.5, 0, 0], thighR: [0.5, 0, 0], shinR: [0.6, 0, 0], root: [0, -0.3, 0.5] } },
    { t: 67.2, pose: { spine: [0.1, 0, 0], upperArmR: [-0.4, 0, -0.6], foreArmR: [-0.2, 0, 0], upperArmL: [-0.2, 0, 0.4], thighL: [-0.3, 0, 0], thighR: [0.3, 0, 0], shinR: [0.3, 0, 0], root: [0, -0.1, 0.5] } },
  ]);
  const spinAngle = (t: number) => {
    // rotation complète, ralentie au milieu (cohérente avec le ralenti 65.45–65.9)
    if (t < 65.3) return 0;
    if (t > 66.05) return -Math.PI * 2;
    const u = remap(t, 65.3, 66.05);
    const shaped = u < 0.2 ? u * 1.6 : u < 0.8 ? 0.32 + (u - 0.2) * 0.6 : 0.68 + (u - 0.8) * 1.6;
    return -Math.PI * 2 * shaped;
  };
  const summClip = new Clip([
    { t: 67.2, pose: { spine: [0.3, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.9, 0, 0], thighR: [-0.1, 0, 0], shinR: [1.5, 0, 0], root: [0, -0.35, 0], upperArmR: [-0.9, 0.8, -0.4], foreArmR: [-0.2, 0, 0] } },
    { t: 67.6, pose: { spine: [0.45, 0, 0], thighL: [-0.7, 0, 0], shinL: [1.1, 0, 0], thighR: [-0.1, 0, 0], shinR: [1.7, 0, 0], root: [0, -0.45, 0], upperArmR: [-0.9, -0.9, -0.5], foreArmR: [-0.2, 0, 0] } },
    { t: 67.75, pose: { spine: [0.75, 0, 0], thighL: [-0.9, 0, 0], shinL: [1.5, 0, 0], thighR: [0.1, 0, 0], shinR: [1.9, 0, 0], root: [0, -0.62, 0], upperArmR: [-0.6, 0, -0.1], foreArmR: [0, 0, 0] }, ease: ease.inCubic },
    { t: 68.4, pose: { spine: [0.6, 0, 0], thighL: [-0.9, 0, 0], shinL: [1.5, 0, 0], thighR: [0.1, 0, 0], shinR: [1.9, 0, 0], root: [0, -0.6, 0], upperArmR: [-0.6, 0, -0.1], upperArmL: [-0.4, 0, 0.4] } },
    { t: 68.9, pose: { spine: [-0.1, 0, 0], head: [-0.2, 0, 0], upperArmR: [-2.2, 0, -0.6], foreArmR: [-0.2, 0, 0], upperArmL: [-2.2, 0, 0.6], foreArmL: [-0.2, 0, 0] } },
    { t: 71, pose: { spine: [-0.05, 0, 0], upperArmR: [-1.8, 0, -0.6], foreArmR: [-0.3, 0, 0], upperArmL: [-1.8, 0, 0.6], foreArmL: [-0.3, 0, 0] } },
  ]);

  // ------------------------------------------------------------------ utilitaires
  const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), pos = V(0, 0, 0), look = V(0, 0, 0);
  const worldOf = (o: THREE.Object3D, local: THREE.Vector3, out = V(0, 0, 0)) => o.localToWorld(out.copy(local));
  let lastT = -1;
  const fired = new Set<string>();
  const once = (key: string, t: number, at: number, fn: () => void) => {
    if (t >= at && lastT < at && !fired.has(key)) { fired.add(key); fn(); }
  };

  /** Ennemi projeté par un impact : vol plané, rotation, chute au sol. */
  function knock(f: Foe, t: number) {
    const rig = f.c.rig;
    rig.position.copy(f.home);
    rig.rotation.set(0, f.ry, 0);
    let p: Pose = addPose(idle(t, foes.indexOf(f)), { upperArmL: [-0.9, 0, 0.3], foreArmL: [-0.6, 0, 0], upperArmR: [-0.5, 0, -0.2] });
    if (f.hit !== undefined && t >= f.hit && f.dir) {
      // temps « simulé » : ralentis compris
      const dt = Math.min(1.6, (t - f.hit) * (t < f.hit + 0.5 ? timeScale(t) : 1));
      const k = clamp(dt / 1.1);
      const pw = f.power ?? 6;
      rig.position.addScaledVector(f.dir, pw * ease.outCubic(k));
      rig.position.y = Math.max(0, pw * 0.35 * Math.sin(k * Math.PI));
      rig.rotateX(-ease.outCubic(k) * Math.PI * 0.5);
      p = { upperArmL: [-2.5, 0, 0.8], upperArmR: [-2.5, 0, -0.8], thighL: [-0.8, 0, 0], thighR: [-0.3, 0, 0], shinL: [0.8, 0, 0], head: [-0.4, 0, 0] };
    }
    rig.apply(p);
  }

  function burst(at: THREE.Vector3, n: number, color: THREE.ColorRepresentation, speed: number, color2?: THREE.ColorRepresentation) {
    sparks.emit(n, { pos: at, spread: 0.15, velSpread: speed, vel: V(0, speed * 0.3, 0), life: [0.3, 0.9], size: [0.025, 0.07], color, color2: color2 ?? color, gravity: 9, drag: 1.2 });
  }
  function dustCloud(at: THREE.Vector3, n: number, radius: number, up = 2) {
    dust.emit(n, { pos: at, spread: V(radius, 0.3, radius), velSpread: 2.5, vel: V(0, up, 0), life: [1.2, 2.6], size: [1.5, 4], color: 0x5a4a40, color2: 0x3a302a, gravity: -0.2, drag: 1.2, alpha: 0.55 });
  }

  // ------------------------------------------------------------------ mise à jour
  return {
    key: 'battle',
    scene,
    camera,
    update(t, dtRaw) {
      if (t < lastT - 0.5) { fired.clear(); sparks.reset(); dust.reset(); trail.reset(); }
      const ts = timeScale(t);
      const dt = dtRaw * ts;
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      for (const m of [embersAmb, ash]) (m.material as THREE.ShaderMaterial).uniforms.uTime.value = t * (0.5 + ts * 0.5);
      fireLight.intensity = 50 + Math.sin(t * 13) * 10;

      // positions par défaut (chacun à son poste)
      mage.rig.position.copy(M0); mage.rig.rotation.set(0, 0, 0);
      sw.rig.position.copy(S0); sw.rig.rotation.set(0, 0, 0);
      summ.rig.position.copy(U0); summ.rig.rotation.set(0, 0, 0);
      bers.rig.position.copy(B0); bers.rig.rotation.set(0, 0, 0);
      ranger.rig.position.copy(R0); ranger.rig.rotation.set(0, 0.7, 0);
      for (const f of foes) knock(f, t);
      for (const f of army) f.c.rig.apply(addPose(idle(t, foes.indexOf(f)), { upperArmL: [-0.9, 0, 0.3], foreArmL: [-0.6, 0, 0] }));

      // ---------------- LE MAGE
      mage.rig.apply(addPose(idle(t, 0, 0.5), mageClip.sample(t)));
      mage.cape.sway(t, 1.2, t > HITS.fireballLaunch && t < 63 ? 0.4 : 0);
      const runeIn = smoothstep(60.4, 61.0, t) * (1 - smoothstep(61.8, 62.3, t));
      mageRunes.forEach((m, i) => {
        m.visible = runeIn > 0.01;
        m.scale.setScalar(runeIn * (1 + i * 0.1) * (1 + Math.sin(t * 8) * 0.03));
        m.rotation.z = t * (i ? -0.8 : 1.4);
        (m.material as THREE.MeshBasicMaterial).opacity = runeIn;
      });
      const groundIn = smoothstep(60.3, 60.9, t) * (1 - smoothstep(62.2, 62.8, t));
      mageGround.visible = groundIn > 0.01;
      mageGround.scale.setScalar(0.4 + groundIn * 0.6);
      mageGround.rotation.z = t * 0.5;
      (mageGround.material as THREE.MeshBasicMaterial).opacity = groundIn;
      // l'orbe se forme entre les mains puis traverse le champ de bataille
      const orbStart = V(M0.x, 1.55, M0.z + 0.95);
      const target = V(0.2, 1.3, 15.4);
      orb.visible = t > 60.95 && t < HITS.fireballImpact;
      if (orb.visible) {
        if (t < HITS.fireballLaunch) {
          orb.position.copy(orbStart);
          orb.scale.setScalar(0.2 + smoothstep(60.95, 61.5, t) * 0.9 + Math.sin(t * 40) * 0.04);
        } else {
          const u = remap(t, HITS.fireballLaunch, HITS.fireballImpact);
          orb.position.lerpVectors(orbStart, target, ease.inQuad(u * 0.6 + u * u * 0.4));
          orb.position.y += Math.sin(u * Math.PI) * 1.0;
          orb.scale.setScalar(1.1);
          sparks.emit(6, { pos: orb.position, spread: 0.12, velSpread: 0.6, life: [0.25, 0.6], size: [0.06, 0.18], color: 0x9fd8ff, color2: 0xffffff, drag: 2 });
        }
        orbCore.scale.setScalar(1 + Math.sin(t * 50) * 0.08);
      }
      // explosion
      const ex = t - HITS.fireballImpact;
      const exSim = ex < 0 ? -1 : ex < 0.5 ? ex * 0.3 : 0.15 + (ex - 0.5);
      fireball.visible = exSim >= 0 && exSim < 0.9;
      if (fireball.visible) {
        fireball.position.copy(target);
        fireball.scale.setScalar(0.5 + ease.outCubic(clamp(exSim / 0.6)) * 4.2);
        (fireball.material as THREE.MeshBasicMaterial).opacity = 1 - clamp(exSim / 0.9);
        (fireball.material as THREE.MeshBasicMaterial).color.setHSL(0.58 - exSim * 0.4, 0.8, 0.75 - exSim * 0.3);
      }
      shock.position.set(target.x, 0.1, target.z);
      shock.set(exSim < 0 ? 0 : clamp(exSim / 0.7), 14);
      once('explosion', t, HITS.fireballImpact, () => {
        burst(target, 420, 0xbfe8ff, 14, 0xffd890);
        dustCloud(V(target.x, 0.3, target.z), 60, 2.5, 3);
      });
      L1.position.copy(orb.visible ? orb.position : target);
      L1.color.set(0x8ad0ff);
      L1.intensity = orb.visible ? 12 + smoothstep(60.95, 61.5, t) * 18 : exSim >= 0 ? Math.max(0, 300 * (1 - exSim / 0.8)) : 0;
      L1.distance = 40;

      // ---------------- L'ÉPÉISTE
      const swPose = swordClip.sample(t);
      sw.rig.apply(addPose(idle(t, 1, 0.4), swPose));
      sw.rig.rotation.y = spinAngle(t);
      sw.cape.sway(t, 1, t > 65.3 && t < 66.2 ? 0.9 : 0);
      if (t < swordFoe.hit!) {
        swordFoe.c.rig.apply(addPose(guardSwing.sample(t), { upperArmL: [-0.9, 0, 0.3], foreArmL: [-0.6, 0, 0] }));
        swordFoe.c.rig.position.copy(swordFoe.home);
        swordFoe.c.rig.rotation.set(0, Math.PI, 0);
      }
      once('parry', t, HITS.parry, () => burst(V(S0.x, 2.05, S0.z + 1.15), 90, 0xffe0a0, 6));
      once('spinhit', t, HITS.spin + 0.35, () => burst(V(S0.x + 0.4, 1.4, S0.z + 1.6), 220, 0xffd0a0, 9, 0xff8040));
      // traînée lumineuse de la lame pendant la rotation
      const trailOn = smoothstep(65.25, 65.4, t) * (1 - smoothstep(66.0, 66.35, t));
      trail.visible = trailOn > 0.01 && t > 63.6 && t < 67.2;
      if (trail.visible) {
        sw.rig.updateMatrixWorld(true);
        trail.push(worldOf(sw.sword, sw.sword.userData.base, tmp), worldOf(sw.sword, sw.sword.userData.tip, tmp2));
        trail.opacity = trailOn;
      } else trail.reset();
      L2.position.set(S0.x, 2, S0.z + 1.2);
      L2.color.set(0xffc080);
      const flashS = impactShake(t, [HITS.parry, HITS.spin + 0.35], 1, 9);

      // ---------------- L'INVOCATEUR
      summ.rig.apply(addPose(idle(t, 2, 0.4), summClip.sample(t)));
      summ.cape.sway(t, 1, smoothstep(68.7, 69.0, t) * (1 - smoothstep(70.5, 71, t)) * 0.6);
      const draw = smoothstep(67.2, 67.72, t);
      summCircle.visible = t > 67.15 && t < 71.2;
      const sm = summCircle.material as THREE.ShaderMaterial;
      sm.uniforms.uReveal.value = draw;
      sm.uniforms.uIntensity.value = 1 + Math.max(0, 3 * (1 - (t - HITS.runeSlam) * 2)) * (t > HITS.runeSlam ? 1 : 0);
      sm.uniforms.uOpacity.value = 1 - smoothstep(70.6, 71.1, t);
      summCircle.rotation.z = t * 0.2;
      cracks.visible = t > HITS.runeSlam;
      cracks.scale.setScalar(ease.outCubic(clamp((t - HITS.runeSlam) / 0.5)));
      (cracks.material as THREE.MeshBasicMaterial).opacity = (0.6 + Math.sin(t * 9) * 0.2) * (1 - smoothstep(70.5, 71.1, t));
      once('slam', t, HITS.runeSlam, () => {
        burst(V(U0.x, 0.2, U0.z + 0.8), 200, 0x5affd0, 6);
        dustCloud(V(U0.x, 0.2, U0.z + 0.6), 40, 2, 1.5);
      });
      const pOpen = smoothstep(HITS.portal - 0.15, HITS.portal + 0.45, t) * (1 - smoothstep(70.6, 71.0, t));
      portal.visible = pOpen > 0.01;
      portal.scale.setScalar(ease.outBack(pOpen));
      portalRing.rotation.z = t * 1.5;
      (portalCore.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      if (t > 67.2 && t < 71.0) {
        L2.position.set(U0.x, 1.5, U0.z + 3);
        L2.color.set(0x3affc0);
        L2.intensity = (t > HITS.runeSlam ? 60 + Math.max(0, 300 * (1 - (t - HITS.runeSlam) * 2)) : draw * 25) + pOpen * 80;
      } else L2.intensity = flashS * 120;
      // la bête
      beast.visible = t > HITS.portal + 0.25 && t < 71.2;
      if (beast.visible) {
        const emerge = smoothstep(HITS.portal + 0.25, HITS.roar - 0.1, t);
        const leap = clamp((t - HITS.creatureLeap) / 0.6);
        beast.position.set(U0.x, 0, U0.z + 5.0 + emerge * 3.2 + leap * 9);
        beast.position.y = Math.sin(leap * Math.PI) * 3.2;
        beast.rotation.set(-leap * 0.3, 0, 0);
        const roar = smoothstep(HITS.roar - 0.1, HITS.roar + 0.1, t) * (1 - smoothstep(70.0, 70.2, t));
        const crouch = smoothstep(70.05, HITS.creatureLeap, t) * (1 - leap);
        beast.pose(t, emerge < 1 ? 0.2 : leap > 0 ? 1 : 0, roar, crouch);
        beast.scale.setScalar(0.4 + emerge * 0.6);
      }
      once('roarbreath', t, HITS.roar, () => burst(V(U0.x, 2.2, U0.z + 10.2), 120, 0x6affd0, 4));

      // ---------------- LE BERSERKER
      const charge = smoothstep(71.15, 72.25, t);
      bers.rig.position.set(B0.x, 0, B0.z + charge * 6.0);
      bers.axe.visible = t < 73.0;
      axeHead.visible = t < HITS.weaponBreak;
      let bp: Pose;
      if (t < 71.25) bp = { head: [-0.5, 0, 0], upperArmL: [-0.3, 0, 1.3], upperArmR: [-0.3, 0, -1.3], spine: [-0.2, 0, 0], chest: [-0.2, 0, 0] };
      else if (t < 72.05) bp = addPose(walk((t - 71.2) * 13, 1), { upperArmR: [-2.4, 0, -0.3], foreArmR: [-0.6, 0, 0] });
      else if (t < HITS.weaponBreak) bp = { upperArmR: [-2.8 + smoothstep(72.05, 72.3, t) * 1.6, 0, -0.2], foreArmR: [-0.3, 0, 0], spine: [0.1 + smoothstep(72.05, 72.3, t) * 0.4, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.4, 0, 0], thighR: [0.5, 0, 0], shinR: [0.4, 0, 0] };
      else if (t < 73.0) bp = { upperArmR: [-1.4, 0.3, -0.3], foreArmR: [-1.3, 0, 0], head: [0.5, -0.25, 0.15], spine: [0.1, 0, 0] }; // il contemple le manche brisé
      else if (t < HITS.grabMaul) bp = { spine: [0.6, 0.6, 0], upperArmR: [-1.2, 0, -0.3], upperArmL: [-1.2, 0, 0.3], thighL: [-0.8, 0, 0], shinL: [1.0, 0, 0], thighR: [-0.4, 0, 0], shinR: [0.9, 0, 0], root: [0, -0.35, 0] };
      else bp = new Clip([
        { t: HITS.grabMaul, pose: { spine: [0.5, 0.4, 0], upperArmR: [-1.2, 0, -0.3], upperArmL: [-1.2, 0, 0.3], root: [0, -0.3, 0] } },
        { t: 73.85, pose: { spine: [-0.35, 0, 0], chest: [-0.2, 0, 0], upperArmR: [-3.0, 0, -0.15], foreArmR: [-0.4, 0, 0], upperArmL: [-3.0, 0, 0.15], foreArmL: [-0.4, 0, 0], thighL: [-0.3, 0, 0], thighR: [0.3, 0, 0] } },
        { t: HITS.maulSmash, pose: { spine: [0.7, 0, 0], chest: [0.2, 0, 0], upperArmR: [-1.1, 0, -0.1], foreArmR: [0, 0, 0], upperArmL: [-1.1, 0, 0.1], foreArmL: [0, 0, 0], thighL: [-0.9, 0, 0], shinL: [0.8, 0, 0], thighR: [0.5, 0, 0], shinR: [0.6, 0, 0], root: [0, -0.4, 0.3] }, ease: ease.inCubic },
        { t: 74.6, pose: { spine: [0.6, 0, 0], chest: [0.2, 0, 0], upperArmR: [-1.0, 0, -0.1], upperArmL: [-1.0, 0, 0.1], thighL: [-0.9, 0, 0], shinL: [0.8, 0, 0], thighR: [0.5, 0, 0], shinR: [0.6, 0, 0], root: [0, -0.4, 0.3] } },
      ]).sample(t);
      bers.rig.apply(addPose(idle(t, 3, 0.3), bp));
      // le maillet-tonneau : au sol, puis dans ses mains
      bers.rig.updateMatrixWorld(true);
      if (t >= HITS.grabMaul && t < 75) {
        const hand = worldOf(bers.rig.j.handR, V(0, -0.08, 0));
        const handL = worldOf(bers.rig.j.handL, V(0, -0.08, 0));
        maul.position.copy(hand).lerp(handL, 0.5);
        // le manche suit la direction des bras (de l'épaule vers les mains)
        const shoulder = worldOf(bers.rig.j.chest, V(0, 0.35, 0));
        const dir = tmp.copy(maul.position).sub(shoulder).normalize();
        maul.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
        maul.position.addScaledVector(dir, -0.6);
      } else {
        maul.position.set(B0.x + 2.3, 0.45, -22.6);
        maul.rotation.set(Math.PI / 2 - 0.1, 0, 0.6);
      }
      // tête de hache qui s'envole
      flyingHead.visible = t >= HITS.weaponBreak && t < 74.5;
      if (flyingHead.visible) {
        const k = (t - HITS.weaponBreak) * (t < 72.55 ? 0.3 : 1);
        flyingHead.position.set(B0.x + 0.6 + k * 2.5, 2.3 + k * 7 - k * k * 9.8 * 0.5 * 2, -20.6 + k * 2);
        flyingHead.position.y = Math.max(0.1, flyingHead.position.y);
        flyingHead.rotation.set(k * 14, k * 6, 0);
        flyingHead.scale.setScalar(2.05);
      }
      flyingHandle.visible = t > 73.0 && t < 74.6;
      if (flyingHandle.visible) {
        const k = t - 73.0;
        flyingHandle.position.set(B0.x - 0.8 - k * 4, 1.8 + k * 3 - k * k * 6, -22 - k * 2);
        flyingHandle.rotation.set(k * 10, 0, k * 4);
        flyingHandle.scale.setScalar(2.05);
      }
      once('break', t, HITS.weaponBreak, () => burst(V(B0.x + 0.2, 1.6, -20.6), 180, 0xffd090, 7));
      once('smash', t, HITS.maulSmash, () => {
        burst(V(B0.x, 0.3, -20.2), 260, 0xffb070, 10, 0xff6020);
        dustCloud(V(B0.x, 0.3, -20.2), 90, 3.5, 4);
      });
      const sm2 = t - HITS.maulSmash;
      shock2.position.set(B0.x, 0.15, -20.4);
      shock2.set(sm2 < 0 ? 0 : clamp((sm2 < 0.3 ? sm2 * 0.3 : 0.09 + sm2 - 0.3) / 0.7), 12);

      // ---------------- LE RÔDEUR
      const jumpU = remap(t, 74.75, 75.6);
      const air = t > 74.75 && t < 75.6;
      ranger.rig.position.set(R0.x + (t > 74.6 ? smoothstep(74.6, 75.6, t) * 2.0 : 0), air ? Math.sin(Math.min(1, jumpU) * Math.PI) * 1.9 : 0, R0.z + (t > 74.6 ? smoothstep(74.6, 75.6, t) * 2.6 : 0));
      const draw2 = smoothstep(74.75, 74.98, t);
      const rp: Pose = t < 74.75
        ? addPose(walk((t - 74.3) * 12, 1), { upperArmL: [-0.8, 0, 0.2] })
        : {
            upperArmL: [-1.55, 0.25, 0.15], foreArmL: [0, 0, 0],
            upperArmR: [-1.5, -0.3 + draw2 * 0.6, -0.5 * draw2], foreArmR: [-0.3 - draw2 * 1.6, 0, 0],
            thighL: [-1.0, 0, 0], shinL: [1.4, 0, 0], thighR: [0.2, 0, 0], shinR: [1.2, 0, 0],
            spine: [0.1, 0.5, 0], head: [0, -0.5, 0], rootRot: [0, 0, -0.15],
          };
      ranger.rig.apply(rp);
      ranger.cloak.sway(t, 1, air ? 0.8 : 0.2);
      ranger.arrow.visible = t < HITS.arrowRelease;
      flyingArrow.visible = t >= HITS.arrowRelease && t < 78.0;
      const au = remap(t, HITS.arrowRelease, HITS.arrowImpact);
      const arrowPos = V(0, 0, 0).lerpVectors(arrowFrom, arrowTo, au);
      arrowPos.y += Math.sin(au * Math.PI) * 1.6;
      if (flyingArrow.visible) {
        flyingArrow.position.copy(t < HITS.arrowImpact ? arrowPos : arrowTo.clone().add(V(0.05, 0.02, -0.25)));
        const next = V(0, 0, 0).lerpVectors(arrowFrom, arrowTo, Math.min(1, au + 0.01));
        next.y += Math.sin(Math.min(1, au + 0.01) * Math.PI) * 1.6;
        if (t < HITS.arrowImpact) flyingArrow.lookAt(next);
        flyingArrow.rotateZ(t * 6); // rotation de l'empennage
        if (t < HITS.arrowImpact && t > HITS.arrowRelease) sparks.emit(1, { pos: flyingArrow.position, spread: 0.02, velSpread: 0.05, life: [0.4, 0.8], size: [0.02, 0.05], color: 0xffe0b0, drag: 3 });
      }
      // la flèche reste fichée dans le heaume de l'ennemi qui bascule
      if (flyingArrow.visible && t >= HITS.arrowImpact) {
        arrowFoe.c.rig.updateMatrixWorld(true);
        flyingArrow.position.copy(worldOf(arrowFoe.c.rig.j.head, V(0.02, 0.1, 0.08)));
      }
      once('arrowhit', t, HITS.arrowImpact, () => burst(arrowTo, 120, 0xffe0a0, 5));

      // ---------------- LE COLOSSE
      const rise = smoothstep(78.1, 80.5, t);
      colossus.rig.position.set(0, -40 + ease.outCubic(rise) * 40 - 4, -48);
      const roarK = smoothstep(80.45, 80.75, t);
      colossus.rig.apply({
        spine: [0.3 - rise * 0.3 - roarK * 0.25, 0, 0], chest: [0.2 - roarK * 0.2, 0, 0], head: [0.3 - roarK * 0.55, 0, 0],
        upperArmL: [-0.6 - roarK * 0.6, 0, 0.5 + roarK * 0.6], upperArmR: [-0.6 - roarK * 0.6, 0, -0.5 - roarK * 0.6],
        foreArmL: [-0.8, 0, 0], foreArmR: [-0.8, 0, 0],
      });
      colossus.jaw.rotation.x = roarK * 0.6;
      colossus.material.emissiveIntensity = 0;
      colossus.core.scale.setScalar(1 + roarK * 0.4 + Math.sin(t * 6) * 0.05);
      once('step1', t, HITS.monsterStep1, () => dustCloud(V(0, 0.5, -30), 80, 30, 3));
      once('step2', t, HITS.monsterStep2, () => dustCloud(V(0, 0.5, -28), 80, 30, 4));
      once('roar', t, HITS.monsterRoar, () => dustCloud(V(0, 0.5, -20), 120, 26, 2));
      const rk = t - HITS.monsterRoar;
      shock3.position.set(0, 0.2, -30);
      shock3.set(rk < 0 ? 0 : clamp(rk / 1.2), 60);

      // ---------------- 5f : regroupement des héros face à l'armée, puis demi-tour
      if (t >= 78.0) {
        const turn = (delay: number) => smoothstep(79.7 + delay, 80.25 + delay, t) * Math.PI;
        const spots: [typeof mage.rig, number, number, number][] = [
          [mage.rig, -2.6, 10.2, 0.0], [sw.rig, -0.8, 11.0, 0.08], [bers.rig, 1.3, 10.6, 0.16], [summ.rig, 3.1, 9.7, 0.05], [ranger.rig, -4.4, 9.5, 0.12],
        ];
        spots.forEach(([rig, x, z, d], i) => {
          rig.position.set(x, 0, z);
          rig.rotation.set(0, turn(d) + (i === 4 ? 0.2 : 0), 0);
          const up = smoothstep(80.0 + d, 80.6 + d, t);
          rig.apply(addPose(idle(t, i, 0.6), { head: [-up * 0.65, 0, 0], spine: [-up * 0.15, 0, 0], upperArmL: [-0.6, 0, 0.3], upperArmR: [-0.9, 0, -0.2], foreArmR: [-0.4, 0, 0] }));
        });
        bers.axe.visible = false;
        maul.position.copy(worldOf(bers.rig.j.handR, V(0, 0, 0)));
        maul.rotation.set(0.4, bers.rig.rotation.y, 0);
        beast.visible = true;
        beast.position.set(5.6, 0, 10.4);
        beast.rotation.set(0, turn(0.2) * 0.98, 0);
        beast.scale.setScalar(1);
        beast.pose(t, 0, smoothstep(80.7, 81.0, t) * 0.8, 0.2);
        flyingArrow.visible = false;
        flyingHead.visible = flyingHandle.visible = false;
        for (const c of [mage, sw, summ]) c.cape.sway(t, 1 + roarK * 2, roarK * 0.8);
        ranger.cloak.sway(t, 1 + roarK * 2, roarK * 0.8);
      }

      // ------------------------------------------------------------------ caméras
      let fov = 40, roll = 0;
      let shake = 0.01 + impactShake(t, [HITS.fireballImpact, HITS.maulSmash, HITS.monsterStep1, HITS.monsterStep2], 0.12, 4) + impactShake(t, [HITS.parry, HITS.weaponBreak, HITS.runeSlam], 0.05, 8) + (t > HITS.monsterRoar ? 0.25 * Math.exp(-(t - HITS.monsterRoar) * 1.2) : 0);
      if (inShot('5a', t)) {
        if (t < 61.4) {
          const u = ease.inOutSine(remap(t, 60, 61.4));
          pos.set(lerp(2.6, 1.9, u), lerp(0.7, 0.9, u), lerp(3.6, 3.0, u));
          look.set(0, lerp(1.7, 1.6, u), 0.6);
          fov = 38;
        } else if (t < HITS.fireballImpact) {
          const u = remap(t, 61.4, HITS.fireballImpact);
          pos.set(-1.0, 2.0, -1.9 + u * 2.4);
          look.copy(orb.visible ? orb.position : target).lerp(target, 0.3);
          fov = lerp(40, 34, u);
        } else {
          pos.set(-10, 2.4, 9.5);
          look.set(0, 1.6, 15);
          fov = 44;
        }
      } else if (inShot('5b', t)) {
        if (t < 64.6) {
          const u = remap(t, 63.6, 64.6);
          pos.set(S0.x + 3.0 - u * 0.4, 1.9, S0.z + 1.2);
          look.set(S0.x, 1.9, S0.z + 1.2);
          fov = 34;
        } else if (t < 65.2) {
          pos.set(S0.x - 3.6, 0.7, S0.z + 1.6);
          look.set(S0.x - 0.2, 1.0, S0.z + 1.0);
          fov = 42;
          roll = 0.08;
        } else {
          const u = remap(t, 65.2, 67.2);
          const a = 0.6 + ease.inOutSine(u) * 1.6;
          pos.set(S0.x + Math.sin(a) * 4.2, 1.3 + u * 0.5, S0.z + 0.6 + Math.cos(a) * 4.2);
          look.set(S0.x, 1.25, S0.z + 0.6);
          fov = 44;
        }
      } else if (inShot('5c', t)) {
        if (t < 68.6) {
          const u = remap(t, 67.2, 68.6);
          pos.set(U0.x + 2.6 - u * 1.2, 4.6 - u * 0.6, U0.z + 3.6 + u * 0.6);
          look.set(U0.x, 0.3, U0.z + 0.5);
          fov = 46;
        } else if (t < 69.4) {
          const u = remap(t, 68.6, 69.4);
          pos.set(U0.x - 3.5, 1.3, U0.z + 15 - u * 1.5);
          look.set(U0.x, 1.9, U0.z + 7);
          fov = 40;
        } else if (t < 70.1) {
          const head = worldOf(beast.head, V(0, 0, 0.6));
          pos.copy(head).add(V(1.6, -0.6, 2.6));
          look.copy(head);
          fov = 38;
        } else {
          pos.set(U0.x + 0.6, 0.35, U0.z + 16.5);
          look.copy(beast.position).add(V(0, 1.5, 0));
          fov = 52;
          roll = -0.06;
        }
      } else if (inShot('5d', t)) {
        if (t < 72.0) {
          pos.copy(bers.rig.position).add(V(4.6, 1.1, 2.6));
          look.copy(bers.rig.position).add(V(0, 1.6, 0.8));
          fov = 44;
        } else if (t < 72.62) {
          pos.set(B0.x - 5.2, 1.7, -21.2);
          look.set(B0.x, 1.8, -21.0);
          fov = 36;
        } else if (t < 73.45) {
          // le manche brisé : un temps de silence, très sérieux
          pos.copy(bers.rig.position).add(V(-2.3, 1.75, 1.3));
          look.copy(bers.rig.position).add(V(0.1, 1.65, 0.5));
          fov = 34;
        } else {
          pos.set(B0.x - 3.5, 0.55, -14.5);
          look.set(B0.x + 0.5, 2.4, -21.0);
          fov = 46;
        }
      } else if (inShot('5e', t)) {
        if (t < 75.05) {
          pos.set(R0.x + 4.4, 1.6, R0.z + 3.6);
          look.copy(ranger.rig.position).add(V(0, 1.6, 0));
          fov = 38;
        } else if (t < HITS.arrowImpact) {
          const dir = tmp.copy(arrowTo).sub(arrowFrom).normalize();
          const side = tmp2.crossVectors(dir, V(0, 1, 0)).normalize();
          const a = (t - 75.05) * 0.9;
          pos.copy(flyingArrow.position).addScaledVector(dir, -1.5).addScaledVector(side, Math.cos(a) * 0.55).add(V(0, 0.22 + Math.sin(a) * 0.2, 0));
          look.copy(flyingArrow.position).addScaledVector(dir, 2.5);
          fov = 46;
          roll = Math.sin(a) * 0.12;
          shake = 0.004;
        } else {
          pos.set(arrowTo.x + 2.6, 1.9, arrowTo.z - 2.8);
          look.copy(arrowTo);
          fov = 34;
        }
      } else {
        if (t < 79.6) {
          // devant les héros : le sol tremble, une silhouette se lève derrière eux
          const u = remap(t, 78, 79.6);
          pos.set(0.4, 1.1, 18.5 - u * 0.8);
          look.set(0, 2.6 + u * 3, 4);
          fov = 46;
        } else {
          // derrière eux, en contre-plongée : l'échelle du Colosse
          const u = ease.inOutSine(remap(t, 79.6, 82));
          pos.set(0.6 - u * 0.3, 0.65, 15.2 - u * 1.0);
          look.set(0, lerp(8, 18, u), -30);
          fov = lerp(52, 58, u);
        }
      }
      setCam(camera, pos, look, fov, roll, shake, t);
      fill.follow(camera, look);
      sky.position.copy(camera.position);

      // particules (ralentis compris)
      if (t > 60.2 && Math.floor(t * 20) !== Math.floor(lastT * 20)) {
        for (const f of fires) sparks.emit(1, { pos: f, spread: 0.3, vel: V(0, 2.5, 0), velSpread: 0.6, life: [0.6, 1.4], size: [0.05, 0.12], color: 0xffa040, color2: 0xff5010, gravity: -0.6 });
      }
      sparks.update(dt);
      dust.update(dt);
      lastT = t;
    },
    post(t): Partial<PostParams> {
      const ex = t - HITS.fireballImpact;
      const flash = (ex >= 0 && ex < 0.6 ? (1 - ex / 0.6) * 0.32 : 0) + (t >= HITS.maulSmash && t < HITS.maulSmash + 0.25 ? 0.3 * (1 - (t - HITS.maulSmash) / 0.25) : 0) + (t >= HITS.parry && t < HITS.parry + 0.08 ? 0.12 : 0);
      const slow = timeScale(t) < 1;
      return {
        flash,
        flashColor: t < 63 ? '#dff0ff' : '#ffe8c8',
        bloomStrength: 0.85,
        bloomThreshold: 0.7,
        bloomRadius: 0.6,
        exposure: 1.05,
        contrast: 1.12,
        saturation: slow ? 0.75 : 0.9,
        aberration: slow ? 0.02 : 0.008,
        vignette: 1.2,
        dof: inShot('5e', t) && t > 75.05 && t < HITS.arrowImpact ? { focus: 1.6, aperture: 0.01, maxblur: 0.01 } : null,
      };
    },
  };
}
