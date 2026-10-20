// SCÈNE 4 — LA GRANDE CITÉ MÉDIÉVALE (42 → 60 s)
// Approche des remparts et des statues colossales, plongée dans l'avenue (marchés, forges, foule),
// vol autour de la tour centrale, puis la grande place où les aventuriers se préparent.
import * as THREE from 'three';
import type { CineScene, PostParams, Quality } from '../core/director';
import { inShot, prog } from '../core/timeline';
import { TimedPath, setCam } from '../core/camera';
import { ease, lerp, smoothstep } from '../core/math';
import { Eagle } from '../world/eagle';
import { cameraFill, skyDome, sunlight } from '../world/sky';
import { CITY, buildCity } from '../world/city';
import { Particles, ambientMotes } from '../fx/particles';
import { groundMist } from '../fx/magic';
import { makeBerserker, makeMage, makeRanger, makeSummoner, makeSwordsman } from '../world/characters';
import { addPose, idle, type Pose } from '../world/rig';

export function createCityScene(quality: Quality): CineScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.3, 9000);
  const fogColor = new THREE.Color(0x8a7a6e);
  scene.fog = new THREE.FogExp2(fogColor, 0.0011);
  const sunDir = new THREE.Vector3(-0.42, 0.2, -0.88).normalize();
  const sky = skyDome({ top: 0x46557a, horizon: 0xe8a868, bottom: 0x4a3c34, sunDir, sunColor: 0xffb070, sunSize: 0.9993, glow: 1.1, clouds: 0.8, cloudColor: 0x5a4650 });
  scene.add(sky);
  const { sun } = sunlight(scene, { dir: sunDir, color: 0xffc08a, intensity: 3.4, sky: 0x8090b8, ground: 0x3a3028, hemi: 0.85 });
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -90; sc.right = sc.top = 90; sc.near = 1; sc.far = 800;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.08;

  const fill = cameraFill(scene, 0xc8d0ff, 0.9);
  const city = buildCity(quality);
  scene.add(city.group);

  // forges : braises qui s'élèvent
  const embers = new Particles(quality === 'high' ? 1500 : 700);
  scene.add(embers);
  const haze = groundMist(1400, 0xb8a08a, 0.25, 0.01, [0.4, 0.95]);
  haze.position.y = 3;
  scene.add(haze);
  const motes = ambientMotes({ count: 500, box: new THREE.Vector3(120, 30, 120), center: new THREE.Vector3(0, 10, 20), color: 0xffd090, size: 0.08, speed: new THREE.Vector3(0.5, 0.2, 0.2), opacity: 0.6 });
  scene.add(motes);

  // les aventuriers sur la grande place
  const P = CITY.plaza;
  const mage = makeMage(), sword = makeSwordsman(), summ = makeSummoner(), bers = makeBerserker(), ranger = makeRanger();
  const heroes = [
    { c: mage, pos: [-3.2, 0, -4.5], ry: 0.5 },
    { c: sword, pos: [-1.0, 0, -3.2], ry: 0.15 },
    { c: bers, pos: [1.6, 0, -4.2], ry: -0.25 },
    { c: summ, pos: [3.8, 0, -5.6], ry: -0.6 },
    { c: ranger, pos: [-5.0, 0, -7.0], ry: 0.8 },
  ] as const;
  for (const h of heroes) {
    h.c.rig.position.set(P.x + h.pos[0], 0, P.z + h.pos[2]);
    h.c.rig.rotation.y = h.ry;
    scene.add(h.c.rig);
  }

  const eagle = new Eagle();
  eagle.scale.setScalar(2.0); // grand aigle royal : lisible dans les plans larges
  scene.add(eagle);
  const path = new TimedPath([
    [41.5, [0, 74, 560]],
    [42, [0, 72, 520]],
    [44, [0, 64, 400]],
    [45.4, [0, 66, 300]],
    [46.6, [0, 30, 240]],
    [48, [2, 13, 175]],
    [49.4, [-3, 15, 100]],
    [50.5, [12, 42, 25]],
    [51.5, [46, 72, -60]],
    [52.5, [0, 86, -138]],
    [53.5, [-48, 90, -90]],
    [54.6, [-20, 66, -6]],
    [56, [10, 34, 30]],
    [57.6, [4, 16, 8]],
    [59, [-12, 13, -24]],
    [60.5, [-24, 14, -50]],
  ]);
  const ePos = new THREE.Vector3(), eVel = new THREE.Vector3(), eVel2 = new THREE.Vector3();
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  let lastEmit = 0;

  function heroPoses(t: number) {
    const lt = t - 54;
    const lookUp = smoothstep(57.2, 58.2, t); // ils lèvent les yeux vers l'aigle
    const poses: Pose[] = [
      // le mage inspecte le cristal de son bâton
      { upperArmR: [-1.0, 0, 0.1], foreArmR: [-1.0, 0, 0], head: [0.3 - lookUp * 0.7, -0.3, 0], upperArmL: [-0.6, 0, 0.2], foreArmL: [-1.2, 0, 0] },
      // l'épéiste fait tournoyer sa lame
      { upperArmR: [-0.9 + Math.sin(lt * 4) * 0.4, Math.sin(lt * 4) * 0.5, -0.2], foreArmR: [-0.6, 0, 0], head: [-lookUp * 0.6, 0, 0] },
      // le berserker s'échauffe les épaules
      { upperArmL: [-0.4 + Math.sin(lt * 2) * 0.5, 0, 0.6], upperArmR: [-0.4 - Math.sin(lt * 2) * 0.5, 0, -0.6], foreArmL: [-0.8, 0, 0], foreArmR: [-0.8, 0, 0], head: [-lookUp * 0.5, 0.2, 0] },
      // l'invocateur lit son grimoire
      { head: [0.45 - lookUp * 0.8, 0.3, 0], upperArmR: [-0.7, 0, -0.1], foreArmR: [-1.3, 0, 0] },
      // le rôdeur vérifie une flèche
      { upperArmR: [-1.1, 0.3, 0], foreArmR: [-1.4, 0, 0], upperArmL: [-0.5, 0, 0.3], head: [0.25 - lookUp * 0.7, -0.4, 0] },
    ];
    heroes.forEach((h, i) => {
      h.c.rig.apply(addPose(idle(t, i * 1.3), poses[i]));
      if ('cape' in h.c) h.c.cape.sway(t, 0.8);
      if ('cloak' in h.c) h.c.cloak.sway(t, 0.8);
    });
    ((mage.staff.userData.crystal as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 3) * 1;
  }

  return {
    key: 'city',
    scene,
    camera,
    update(t, dt) {
      path.at(t, ePos);
      path.velocity(t, eVel);
      path.velocity(t - 0.25, eVel2);
      eagle.position.copy(ePos);
      eagle.lookAt(tmp.copy(ePos).add(eVel));
      const turn = eVel.x * eVel2.z - eVel.z * eVel2.x;
      eagle.rotateZ(THREE.MathUtils.clamp(turn * 0.0012, -0.8, 0.8));
      eagle.fold = 0; eagle.legsTuck = 1; eagle.ruffle = 1; eagle.raise = 0;
      const diving = t > 45.8 && t < 47.6;
      eagle.fold = diving ? 0.35 * Math.sin(((t - 45.8) / 1.8) * Math.PI) : 0;
      eagle.flapAmp = t > 49.4 && t < 50.8 ? 0.8 : t > 55.5 && t < 56.5 ? 0.6 : 0.07;
      eagle.flapFreq = 2.3;
      eagle.tailSpread = t > 57 ? 0.9 : 0.4;
      eagle.update(dt);

      let fov = 45, roll = 0, shake = 0.02;
      if (inShot('4a', t)) {
        // derrière l'aigle : les statues colossales, puis le passage au ras du rempart
        const u = prog('4a', t);
        pos.copy(ePos).add(tmp.set(lerp(-5, 2, u), lerp(-1.5, 2.5, u), lerp(14, 9, u)));
        look.copy(ePos).add(tmp.set(0, lerp(-4, -8, u), -30));
        fov = lerp(50, 56, u);
        roll = lerp(0.05, -0.04, u);
      } else if (inShot('4b', t)) {
        // plongée dans l'avenue : marchés, forges, silhouettes
        const u = prog('4b', t);
        pos.copy(ePos).add(tmp.set(lerp(3, 2, u), lerp(2.2, 1.0, u), lerp(12, 8, u)));
        pos.y = Math.max(pos.y, 5);
        look.copy(ePos).add(tmp.set(0, 0.6, -25));
        fov = lerp(52, 58, u);
        roll = Math.sin(t * 1.1) * 0.06;
        shake = 0.04;
      } else if (inShot('4c', t)) {
        // autour de la grande tour : la caméra décrit un arc plus large, en léger retard sur l'aigle
        const u = prog('4c', t);
        const ang = Math.atan2(ePos.x - CITY.tower.x, ePos.z - CITY.tower.z);
        const a2 = ang + 0.55;
        const rad = lerp(85, 100, u);
        pos.set(CITY.tower.x + Math.sin(a2) * rad, lerp(70, 95, u), CITY.tower.z + Math.cos(a2) * rad);
        look.copy(ePos).lerp(tmp.set(CITY.tower.x, ePos.y + 10, CITY.tower.z), 0.15);
        fov = 42;
      } else {
        // la grande place : grue descendante, ralentissement, les héros
        const u = ease.inOutCubic(prog('4d', t));
        pos.set(lerp(38, 3.2, u), lerp(46, 2.1, u), lerp(70, P.z + 4.2, u));
        look.set(lerp(ePos.x, P.x - 0.6, smoothstep(0.25, 0.75, u)), lerp(ePos.y, 1.5, smoothstep(0.25, 0.75, u)), lerp(ePos.z, P.z - 4.8, smoothstep(0.25, 0.75, u)));
        // dans les derniers instants, la caméra suit le regard des héros vers le ciel
        look.y += smoothstep(57.6, 59.2, t) * 2.2;
        fov = lerp(48, 36, u);
        shake = 0.01;
      }
      setCam(camera, pos, look, fov, roll, shake, t);
      fill.follow(camera, look);
      fill.light.intensity = inShot('4d', t) ? 1.6 : 0.9;
      sky.position.copy(camera.position);
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (haze.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      city.updateCrowd(t);
      for (const b of city.plazaBanners) b.rotation.z = Math.sin(t * 2 + b.position.x) * 0.06;
      heroPoses(t);

      if (t - lastEmit > 0.05 || t < lastEmit) {
        lastEmit = t;
        for (const f of city.forges) {
          embers.emit(3, { pos: f, spread: 0.5, vel: new THREE.Vector3(0, 3.5, 0), velSpread: 1.2, life: [1, 2.4], size: [0.08, 0.2], color: 0xffa040, color2: 0xff5010, gravity: -0.5, drag: 0.4 });
        }
      }
      embers.update(dt);
      // zone d'ombres : suit la caméra
      sun.target.position.copy(look).lerp(pos, 0.4);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 400);
    },
    post(t): Partial<PostParams> {
      const end = smoothstep(57.5, 60, t);
      return {
        exposure: 1.0,
        bloomStrength: 0.6,
        bloomThreshold: 0.78,
        contrast: 1.08 + end * 0.04,
        dof: inShot('4d', t) && t > 57 ? { focus: camera.position.distanceTo(tmp.set(P.x - 0.6, 1.5, P.z - 4.8)), aperture: 0.0025, maxblur: 0.006 } : null,
      };
    },
  };
}
