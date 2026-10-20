// SCÈNE 6 — L'APPARITION DU GRAND MÉCHANT (82 → 108 s)
// La musique s'est tue. Une cathédrale abandonnée, la brume au sol, un trône monumental,
// la prêtresse devant la rosace… et, sur un piédestal, sous un rayon divin : une bouteille d'eau.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CineScene, PostParams } from '../core/director';
import { HITS, inShot, prog } from '../core/timeline';
import { impactShake, setCam } from '../core/camera';
import { clamp, ease, lerp, rng, smoothstep } from '../core/math';
import { rockify } from '../world/terrain';
import { flagstoneTex, roseWindowTex, softDot, starFlareTex } from '../world/textures';
import { makePriestess } from '../world/priestess';
import type { Pose } from '../world/rig';
import { waterBottle } from '../world/bottle';
import { Particles, ambientMotes } from '../fx/particles';
import { godRay, groundMist, lightningBolt } from '../fx/magic';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DAIS = 1.2;
export const PRIESTESS_POS = V(0, DAIS, -50);
const PEDESTAL = V(1.45, DAIS, -50.9);

function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }))!;
}

/** Gestuelle de la prêtresse : la tête se relève, la main se tend vers la relique, puis la brandit. */
function priestessPose(t: number) {
  const burst = ease.outCubic(clamp((t - HITS.wingsBurst) / 0.55));
  const headLift = smoothstep(95.4, 96.7, t);
  const reach = smoothstep(97.15, HITS.grab, t) * (1 - smoothstep(HITS.grab + 0.35, 99.2, t));
  const raise = smoothstep(HITS.bottleRaise, HITS.bottleRaise + 0.9, t);
  const holding = t >= HITS.grab;
  const breath = Math.sin(t * 0.9) * 0.02;
  return {
    spine: [breath, 0.15 * reach, 0],
    chest: [-0.05 * burst, 0, 0],
    neck: [0.15 * (1 - headLift), 0, 0],
    head: [0.5 * (1 - headLift) - 0.12 * raise, -0.25 * reach, 0],
    // bras droit : vers la relique, puis la relique contre la poitrine, puis brandie
    upperArmR: [lerp(lerp(-0.1, -0.45, reach), -2.75, raise), lerp(0, -0.55, reach), lerp(lerp(-0.1, -0.55, reach), -0.15, raise) - (holding && raise < 0.01 ? 0.15 : 0)],
    foreArmR: [lerp(lerp(-0.25, -0.3, reach), -0.15, raise) - (holding && reach < 0.5 && raise < 0.01 ? 1.1 : 0), 0, 0],
    upperArmL: [-0.1 - burst * 0.25, 0, 0.12 + burst * 0.35],
    foreArmL: [-0.3, 0, 0],
  } as Pose;
}

export function createCathedralScene(): CineScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.02, 600);
  scene.background = new THREE.Color(0x020203);
  const fog = new THREE.FogExp2(0x06070c, 0.012);
  scene.fog = fog;
  const r = rng(66);

  // ------------------------------------------------------------------ architecture
  const stone = rockify(new THREE.MeshStandardMaterial({ color: 0x4a4852, roughness: 0.95 }), 0.6, 0.55, 0.05, 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const colZ: number[] = [];
  for (let z = 8; z >= -44; z -= 8) colZ.push(z);
  for (const x of [-8, 8]) {
    for (const z of colZ) {
      const core = new THREE.CylinderGeometry(0.75, 0.8, 21, 12);
      core.translate(x, 10.5, z);
      parts.push(core);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const shaft = new THREE.CylinderGeometry(0.3, 0.3, 21, 8);
        shaft.translate(x + Math.cos(a) * 0.85, 10.5, z + Math.sin(a) * 0.85);
        parts.push(shaft);
      }
      const base = new THREE.BoxGeometry(2.4, 1, 2.4);
      base.translate(x, 0.5, z);
      parts.push(base);
      const cap = new THREE.BoxGeometry(2.6, 0.9, 2.6);
      cap.translate(x, 21.2, z);
      parts.push(cap);
    }
    // arcades en arc brisé entre les colonnes
    for (let i = 0; i < colZ.length - 1; i++) {
      const z0 = colZ[i], z1 = colZ[i + 1];
      const arch = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(x, 21.5, z0), V(x, 25.5, z0 - 1.6), V(x, 27.6, (z0 + z1) / 2), V(x, 25.5, z1 + 1.6), V(x, 21.5, z1)]), 20, 0.55, 6);
      parts.push(arch);
    }
    // claire-voie (mur haut) et murs des bas-côtés
    const upper = new THREE.BoxGeometry(1.4, 14, 60);
    upper.translate(x * 1.06, 34.5, -18);
    parts.push(upper);
    const outer = new THREE.BoxGeometry(1.2, 22, 66);
    outer.translate(x * 2.1, 11, -18);
    parts.push(outer);
  }
  // nervures de la voûte
  for (const z of colZ) {
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-8.5, 41, z), V(-4, 46, z), V(0, 47.5, z), V(4, 46, z), V(8.5, 41, z)]), 20, 0.4, 6));
  }
  for (let i = 0; i < colZ.length - 1; i++) {
    const z0 = colZ[i], z1 = colZ[i + 1];
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-8.5, 41, z0), V(0, 47, (z0 + z1) / 2), V(8.5, 41, z1)]), 16, 0.3, 6));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(8.5, 41, z0), V(0, 47, (z0 + z1) / 2), V(-8.5, 41, z1)]), 16, 0.3, 6));
  }
  // abside semi-circulaire
  const apse = new THREE.CylinderGeometry(13, 13, 48, 32, 1, true, Math.PI / 2, Math.PI);
  apse.translate(0, 24, -59);
  parts.push(apse);
  const backWall = new THREE.BoxGeometry(30, 48, 1.5);
  backWall.translate(0, 24, -72.5);
  // marches de l'estrade
  for (let k = 0; k < 3; k++) {
    const st = new THREE.BoxGeometry(18 - k * 2.5, 0.4, 24 - k * 3);
    st.translate(0, 0.2 + k * 0.4, -58 + k * 1.5);
    parts.push(st);
  }
  const arch = new THREE.Mesh(merge(parts), stone);
  arch.castShadow = arch.receiveShadow = true;
  (arch.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  scene.add(arch);

  // sol dallé
  const flag = flagstoneTex().clone();
  flag.repeat.set(14, 34);
  flag.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 110), rockify(new THREE.MeshStandardMaterial({ color: 0x3a3840, map: flag, roughness: 0.7, metalness: 0.1 }), 0.8, 0.4, 0, 0.3));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -20);
  floor.receiveShadow = true;
  scene.add(floor);

  // la rosace (mur du fond percé)
  const roseMat = new THREE.MeshBasicMaterial({ map: roseWindowTex(), color: 0x9a9aa8, toneMapped: false, transparent: true, fog: false });
  const rose = new THREE.Mesh(new THREE.CircleGeometry(8.5, 64), roseMat);
  rose.position.set(0, 17, -71.6);
  scene.add(rose);
  const roseFrame = new THREE.Mesh(new THREE.RingGeometry(8.4, 9.6, 64), stone);
  roseFrame.position.set(0, 17, -71.55);
  scene.add(roseFrame);
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-15, 0); wallShape.lineTo(15, 0); wallShape.lineTo(15, 48); wallShape.lineTo(-15, 48); wallShape.lineTo(-15, 0);
  const hole = new THREE.Path();
  hole.absarc(0, 17, 8.5, 0, Math.PI * 2, true);
  wallShape.holes.push(hole);
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape, 48), stone);
  wall.position.z = -71.7;
  wall.receiveShadow = true;
  scene.add(wall);
  void backWall;
  // fenêtres lancettes (lueur lunaire)
  const lancetMat = new THREE.MeshBasicMaterial({ color: 0x3a4a8a, toneMapped: false, transparent: true, opacity: 0.85, fog: false });
  for (const x of [-8.6, 8.6]) {
    for (let i = 0; i < colZ.length - 1; i++) {
      const z = (colZ[i] + colZ[i + 1]) / 2;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), lancetMat);
      w.position.set(x * 1.0 - Math.sign(x) * 0.05, 34, z);
      w.rotation.y = -Math.sign(x) * Math.PI / 2;
      scene.add(w);
    }
  }

  // le trône monumental
  const throneMat = rockify(new THREE.MeshStandardMaterial({ color: 0x1a1820, roughness: 0.6, metalness: 0.4 }), 1.5, 0.5, 0, 0.4);
  const throne = new THREE.Group();
  const tp: THREE.BufferGeometry[] = [];
  const seat = new THREE.BoxGeometry(3, 1.3, 2.4); seat.translate(0, 0.65, 0); tp.push(seat);
  const backB = new THREE.BoxGeometry(3.2, 8.5, 0.7); backB.translate(0, 4.25, -1.1); tp.push(backB);
  for (const s of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.5, 1, 2.4); arm.translate(s * 1.6, 1.8, 0); tp.push(arm);
    const spire = new THREE.ConeGeometry(0.35, 3.5, 6); spire.translate(s * 1.45, 10.2, -1.1); tp.push(spire);
  }
  const mid = new THREE.ConeGeometry(0.5, 5, 6); mid.translate(0, 11, -1.1); tp.push(mid);
  throne.add(new THREE.Mesh(merge(tp), throneMat));
  throne.position.set(0, DAIS, -56.5);
  throne.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
  scene.add(throne);

  // le piédestal et la relique
  const ped = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.0, 10), throneMat);
  shaft.position.y = 0.5;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.06, 12), throneMat);
  top.position.y = 1.04;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.12, 12), throneMat);
  foot.position.y = 0.06;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: 0x7a5a24, metalness: 0.9, roughness: 0.35 }));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 1.05;
  ped.add(shaft, top, foot, trim);
  ped.position.copy(PEDESTAL);
  ped.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
  scene.add(ped);
  // la relique est posée exactement là où la main se refermera
  const P = makePriestess();
  P.rig.position.copy(PRIESTESS_POS);
  scene.add(P.rig);
  P.rig.apply(priestessPose(HITS.grab));
  P.rig.updateMatrixWorld(true);
  const bottleRest = P.rig.j.handR.localToWorld(V(0, -0.11, 0.03)).add(V(0, -0.12, 0));
  ped.position.copy(bottleRest).add(V(0, -1.08, 0));
  const bottle = waterBottle();
  bottle.scale.setScalar(1.15);
  scene.add(bottle);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: starFlareTex(), color: 0xfff4dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  scene.add(flare);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xbfe0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.6 }));
  scene.add(aura);

  // débris : bancs renversés, pierres tombées, bannières déchirées
  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.95 });
  for (let i = 0; i < 26; i++) {
    const pew = new THREE.Mesh(new THREE.BoxGeometry(r.range(3, 5), 0.5, 0.7), debrisMat);
    const side = r.sign();
    pew.position.set(side * r.range(3, 6.5), 0.3, r.range(-38, 6));
    pew.rotation.set(r.range(-0.2, 0.2), r.range(-0.4, 0.4), r.next() < 0.3 ? r.range(-1.2, 1.2) : 0);
    pew.castShadow = pew.receiveShadow = true;
    scene.add(pew);
  }
  for (let i = 0; i < 30; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(r.range(0.4, 1.4), r.range(0.3, 0.8), r.range(0.4, 1.2)), stone);
    b.position.set(r.range(-12, 12), 0.2, r.range(-44, 8));
    if (Math.abs(b.position.x) < 2.5) b.position.x += 5 * Math.sign(b.position.x || 1);
    b.rotation.set(r.range(0, 1), r.range(0, 3), r.range(0, 1));
    b.castShadow = true;
    scene.add(b);
  }
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x2a0a10, roughness: 0.9, side: THREE.DoubleSide });
  const banners: THREE.Mesh[] = [];
  for (const z of [-6, -22, -38]) {
    for (const x of [-7.2, 7.2]) {
      const g = new THREE.PlaneGeometry(2.2, 9, 4, 10);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -3.5) p.setY(i, p.getY(i) + Math.abs(Math.sin(p.getX(i) * 4 + z)) * 1.6);
      const b = new THREE.Mesh(g, bannerMat);
      b.position.set(x, 16, z);
      b.rotation.y = Math.PI / 2 * Math.sign(-x);
      scene.add(b);
      banners.push(b);
    }
  }
  // cierges éteints / mourants le long de la nef
  const candleFlames: THREE.Sprite[] = [];
  const flameMat = new THREE.SpriteMaterial({ map: softDot(), color: 0xffa050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 24; i++) {
    const x = r.sign() * r.range(9.2, 10.5), z = r.range(-44, 6);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, r.range(0.4, 1.0), 6), new THREE.MeshStandardMaterial({ color: 0xcfc4a8 }));
    c.position.set(x, 1.1, z);
    scene.add(c);
    if (r.next() < 0.55) {
      const f = new THREE.Sprite(flameMat);
      f.scale.setScalar(0.35);
      f.position.set(x, 1.1 + 0.6, z);
      scene.add(f);
      candleFlames.push(f);
    }
  }

  // ------------------------------------------------------------------ lumières
  scene.add(new THREE.HemisphereLight(0x1c2036, 0x060406, 0.35));
  const moon = new THREE.DirectionalLight(0x7a88ff, 1.6);
  moon.position.set(0, 26, -90);
  moon.target.position.set(0, 0, -30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const msc = moon.shadow.camera;
  msc.left = -16; msc.right = 16; msc.top = 20; msc.bottom = -10; msc.near = 10; msc.far = 120;
  moon.shadow.bias = -0.0008;
  scene.add(moon, moon.target);
  // lumière violette au pied de l'estrade : projette les ombres géantes des ailes
  const umbra = new THREE.SpotLight(0x9a5aff, 0, 95, 0.62, 0.7, 1.0);
  umbra.position.set(0, 0.4, -44.5);
  umbra.target.position.set(0, 13, -66);
  umbra.castShadow = true;
  umbra.shadow.mapSize.set(2048, 2048);
  umbra.shadow.bias = -0.0005;
  scene.add(umbra, umbra.target);
  // rayon divin sur la relique
  const divine = new THREE.SpotLight(0xfff0d0, 0, 40, 0.09, 0.5, 1);
  divine.position.copy(bottleRest).add(V(0, 22, 2));
  divine.target.position.copy(bottleRest);
  scene.add(divine, divine.target);
  const beam = godRay({ length: 26, radiusTop: 0.6, radiusBottom: 0.75, color: 0xfff0d0, opacity: 0 });
  beam.position.copy(bottleRest).add(V(0, 24.5, 2));
  beam.quaternion.setFromUnitVectors(V(0, -1, 0), V(0, -24.5, -2).normalize());
  scene.add(beam);
  const candleLight = new THREE.PointLight(0xff9a50, 6, 18, 2);
  candleLight.position.set(-9, 2, -20);
  scene.add(candleLight);
  const faceLight = new THREE.PointLight(0xb08aff, 0, 5, 2);
  scene.add(faceLight);
  // rayons de la rosace dans la brume
  const roseRays: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const ray = godRay({ length: 70, radiusTop: 3, radiusBottom: 7, color: [0x6a7cff, 0xaa3a5a, 0x7a6aff, 0xc0903a, 0x4a6aff][i], opacity: 0.07 });
    ray.position.set(r.range(-4, 4), 17 + r.range(-3, 3), -71);
    ray.quaternion.setFromUnitVectors(V(0, -1, 0), V(r.range(-0.15, 0.15), -0.42, 1).normalize());
    scene.add(ray);
    roseRays.push(ray);
  }

  // ------------------------------------------------------------------ brume, poussière, particules sombres
  const mist1 = groundMist(60, 0x5a5a72, 0.7, 0.12, [0.25, 0.85]);
  mist1.position.set(0, 0.35, -25);
  const mist2 = groundMist(60, 0x46465a, 0.5, 0.07, [0.3, 0.9]);
  mist2.position.set(0, 0.9, -25);
  scene.add(mist1, mist2);
  const motes = ambientMotes({ count: 700, box: V(20, 26, 70), center: V(0, 12, -25), color: 0xa8b0ff, size: 0.05, speed: V(0.1, -0.05, 0.05), opacity: 0.5 });
  scene.add(motes);
  const beamDust = ambientMotes({ count: 220, box: V(1.2, 6, 1.2), center: bottleRest.clone().add(V(0, 2.5, 0.2)), color: 0xfff0d0, size: 0.018, speed: V(0.02, -0.06, 0.01), opacity: 0 });
  scene.add(beamDust);
  const darkMotes = new Particles(900, { additive: false });
  const violet = new Particles(500);
  scene.add(darkMotes, violet);

  // ------------------------------------------------------------------ la prêtresse
  let bolt: THREE.Group | null = null;

  const tmp = V(0, 0, 0), pos = V(0, 0, 0), look = V(0, 0, 0);
  let lastT = 0;
  let focus = 10;

  return {
    key: 'cathedral',
    scene,
    camera,
    update(t, dt) {
      const time = t;
      // ---------------- ailes, regard, gestes
      const unfold = smoothstep(88.3, 91.2, t) * 0.55;
      const burst = ease.outCubic(clamp((t - HITS.wingsBurst) / 0.55));
      const wingOpen = t < HITS.wingsBurst ? unfold : lerp(unfold, 1, burst);
      const tremble = t > HITS.grab ? 1 : 0.3;
      P.wings.forEach((w) => w.set(wingOpen, time, tremble));
      const headLift = smoothstep(95.4, 96.7, t);
      const raise = smoothstep(HITS.bottleRaise, HITS.bottleRaise + 0.9, t);
      const holding = t >= HITS.grab;
      P.rig.apply(priestessPose(t));
      P.eyeMat.opacity = 0.25 + smoothstep(94.8, 96.6, t) * 0.75;
      P.eyes.forEach((e) => e.scale.set(1.4, 0.6 + headLift * 0.3, 0.6));
      P.rig.updateMatrixWorld(true);

      // ---------------- la relique
      if (holding) {
        // tenue bien droite, comme on porte un objet sacré
        bottle.position.copy(P.rig.j.handR.localToWorld(tmp.set(0, -0.11, 0.03)));
        bottle.position.y -= 0.12 * (1 - raise);
        bottle.rotation.set(0, -0.6, 0);
      } else {
        bottle.position.copy(bottleRest);
        bottle.rotation.set(0, -0.6, 0);
      }
      const reveal = smoothstep(HITS.bottleReveal - 0.1, HITS.bottleReveal + 0.5, t);
      const divineK = reveal * (1 - smoothstep(HITS.wingsBurst, HITS.wingsBurst + 1.2, t) * 0.75);
      divine.intensity = divineK * 420;
      divine.target.position.copy(bottle.position);
      (beam.material as THREE.ShaderMaterial).uniforms.uOpacity.value = divineK * 0.55 * (holding ? 0 : 1);
      (beam.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (beamDust.material as THREE.ShaderMaterial).uniforms.uOpacity.value = divineK * 0.9 * (holding ? 0 : 1);
      const glint = Math.max(0, Math.sin((t - HITS.bottleReveal) * 1.7)) * reveal + (t > HITS.bottleRaise ? smoothstep(HITS.bottleRaise + 0.4, HITS.bottleRaise + 1.2, t) * 1.2 : 0);
      flare.position.copy(bottle.position).add(tmp.set(0.0, 0.16, 0.06));
      flare.scale.setScalar(0.08 + glint * 0.16);
      (flare.material as THREE.SpriteMaterial).opacity = Math.min(0.8, glint * 0.7);
      aura.position.copy(bottle.position).add(tmp.set(0, 0.11, 0));
      aura.scale.setScalar(0.45 + reveal * 0.2);
      (aura.material as THREE.SpriteMaterial).opacity = reveal * 0.12 + raise * 0.3;

      // ---------------- lumières et ombres
      umbra.intensity = lerp(70, 700, smoothstep(HITS.wingsBurst - 0.05, HITS.wingsBurst + 0.3, t)) * (t > 84 ? 1 : smoothstep(82.6, 84, t)) + Math.sin(t * 11) * 6;
      // lumière rasante par en dessous : le bas du visage seulement
      faceLight.position.copy(P.rig.j.head.localToWorld(tmp.set(0.25, -0.35, 0.45)));
      faceLight.intensity = smoothstep(94.5, 96.5, t) * 0.5;
      for (const f of candleFlames) f.scale.setScalar(0.3 + Math.sin(t * 9 + f.position.z) * 0.04);
      candleLight.intensity = 5 + Math.sin(t * 7) * 1;
      for (const b of banners) b.rotation.z = Math.sin(t * 0.8 + b.position.z) * 0.03;
      for (const m of [mist1, mist2]) (m.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 1.5;
      for (const m of [motes, beamDust]) (m.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      for (const ray of roseRays) (ray.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      roseMat.color.setScalar(0.85 + 0.1 * Math.sin(t * 0.7));

      // ---------------- particules sombres autour d'elle
      const step = Math.min(0.1, Math.max(0, t - lastT));
      if (step > 0) {
        const n = Math.ceil((t > HITS.wingsBurst ? 30 : 8) * step * 10);
        darkMotes.emit(n, { pos: PRIESTESS_POS.clone().add(V(0, 1.2, 0)), spread: V(1.4, 1.2, 0.8), vel: V(0, 0.5, 0), velSpread: t > HITS.wingsBurst ? 1.6 : 0.3, life: [1.5, 3], size: [0.04, 0.12], color: 0x050308, gravity: -0.15, drag: 0.4, alpha: 0.9 });
        violet.emit(Math.ceil(n * 0.25), { pos: PRIESTESS_POS.clone().add(V(0, 1.4, -0.3)), spread: V(2.2, 1.5, 0.6), vel: V(0, 0.3, 0), velSpread: 0.4, life: [1, 2.2], size: [0.02, 0.05], color: 0xa070ff, gravity: -0.1 });
      }
      if (t >= HITS.wingsBurst && lastT < HITS.wingsBurst) {
        darkMotes.emit(400, { pos: PRIESTESS_POS.clone().add(V(0, 2, -0.3)), spread: V(1, 1, 0.3), velSpread: 6, life: [1.5, 3], size: [0.05, 0.16], color: 0x040306, drag: 1.4, alpha: 1 });
        violet.emit(200, { pos: PRIESTESS_POS.clone().add(V(0, 2, -0.3)), spread: V(1, 1, 0.3), velSpread: 5, life: [1, 2], size: [0.02, 0.06], color: 0xc090ff, drag: 1.5 });
      }
      darkMotes.update(dt);
      violet.update(dt);

      // ---------------- l'éclair noir
      if (t >= HITS.blackLightning && !bolt) {
        bolt = lightningBolt(bottle.position.clone().add(V(0, 0.25, 0)), camera.position.clone().add(V(0.3, -0.2, -0.6)), 7, { dark: true, width: 0.06 });
        scene.add(bolt);
      }
      if (bolt && (t < HITS.blackLightning || t > 107.9)) { scene.remove(bolt); bolt = null; }

      // ------------------------------------------------------------------ caméras
      let fov = 40, roll = 0;
      let shake = 0.006 + impactShake(t, [HITS.grab, HITS.wingsBurst], 0.08, 2.5) + impactShake(t, [HITS.blackLightning], 0.2, 6);
      if (t > HITS.grab && t < 99.3) shake += 0.03; // grondement
      if (inShot('6a', t)) {
        // lente avancée dans la nef, au ras de la brume
        const u = ease.inOutSine(prog('6a', t));
        pos.set(lerp(1.4, 0.6, u), lerp(1.7, 2.1, u), lerp(10, -22, u));
        look.set(0, lerp(12, 9.5, u), -60);
        fov = lerp(38, 32, u);
        focus = 30;
      } else if (inShot('6b', t)) {
        const u = ease.inOutSine(prog('6b', t));
        pos.set(lerp(3.6, 3.0, u), lerp(1.3, 1.5, u), lerp(-38.5, -40.5, u));
        look.set(0, 3.8, -51);
        fov = 36;
        focus = pos.distanceTo(PRIESTESS_POS);
      } else if (inShot('6c', t)) {
        // la relique, sous le rayon divin
        const u = ease.inOutSine(prog('6c', t));
        pos.copy(bottleRest).add(tmp.set(lerp(-1.1, -0.7, u), lerp(0.18, 0.12, u), lerp(1.15, 0.75, u)));
        look.copy(bottleRest).add(tmp.set(0, 0.12, 0));
        fov = lerp(30, 26, u);
        focus = pos.distanceTo(look);
      } else if (inShot('6d', t)) {
        // gros plan : elle lève la tête et regarde l'objectif
        const u = ease.inOutSine(prog('6d', t));
        const head = P.rig.j.head.localToWorld(V(0, 0.07, 0));
        pos.set(head.x + lerp(0.25, 0.1, u), head.y + lerp(-0.25, -0.12, u), head.z + lerp(2.2, 1.5, u));
        look.copy(head).add(tmp.set(0, -0.08, 0));
        fov = 32;
        focus = pos.distanceTo(head);
      } else if (inShot('6e', t)) {
        // la main se referme sur la bouteille
        const u = prog('6e', t);
        pos.copy(bottleRest).add(tmp.set(lerp(1.0, 0.85, u), lerp(0.3, 0.25, u), lerp(1.1, 0.95, u)));
        look.copy(bottleRest).add(tmp.set(-0.12, 0.14, 0));
        fov = 32;
        focus = pos.distanceTo(look);
      } else if (inShot('6f', t)) {
        // plan large : les ailes se déploient, les ombres envahissent les murs
        const u = ease.outCubic(prog('6f', t));
        pos.set(lerp(0.4, 0.2, u), lerp(1.4, 1.1, u), lerp(-42.5, -37.5, u));
        look.set(0, lerp(4, 6.5, u), -52);
        fov = lerp(44, 52, u);
        focus = 12;
      } else {
        // elle brandit la relique — poussée lente en contre-plongée
        const u = ease.inOutSine(prog('6g', t));
        pos.set(lerp(0.3, 0.15, u), lerp(1.3, 1.6, u), lerp(-42, -45.5, u));
        look.set(0, lerp(3.6, 4.0, u), -50.5);
        fov = lerp(40, 34, u);
        focus = pos.distanceTo(PRIESTESS_POS);
      }
      setCam(camera, pos, look, fov, roll, shake, t);
      lastT = t;
    },
    post(t): Partial<PostParams> {
      const inv = t >= HITS.blackLightning && t < HITS.blackLightning + 0.06 ? 1 : 0;
      const burstFlash = t >= HITS.wingsBurst && t < HITS.wingsBurst + 0.5 ? (1 - (t - HITS.wingsBurst) / 0.5) * 0.25 : 0;
      const close = inShot('6c', t) || inShot('6d', t) || inShot('6e', t);
      return {
        exposure: 1.15,
        bloomStrength: inShot('6c', t) ? 1.0 : 0.75,
        bloomThreshold: 0.65,
        bloomRadius: 0.7,
        saturation: 0.82,
        contrast: 1.15,
        lift: [0.004, 0.006, 0.02],
        gain: [0.98, 0.98, 1.06],
        vignette: 1.5,
        grain: 0.06,
        flash: burstFlash + (t >= HITS.blackLightning ? 0.15 : 0),
        flashColor: '#7a40ff',
        invert: inv,
        dof: close ? { focus, aperture: inShot('6c', t) ? 0.03 : 0.012, maxblur: 0.01 } : inShot('6a', t) ? null : { focus, aperture: 0.0015, maxblur: 0.006 },
      };
    },
  };
}
