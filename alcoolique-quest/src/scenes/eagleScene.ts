// SCÈNE 1 — LE RÉVEIL DE L'AIGLE (0 → 12 s)
// Promontoire rocheux à l'aube au-dessus d'une mer agitée. Gros plans, envol, vue subjective.
import * as THREE from 'three';
import { applyEnvironment } from '../world/assets';
import type { CineScene, PostParams } from '../core/director';
import { prog, local, inShot } from '../core/timeline';
import { setCam } from '../core/camera';
import { ease, fbm2, lerp, remap, ridged2, rng, smoothstep } from '../core/math';
import { Eagle } from '../world/eagle';
import { skyDome, sunlight } from '../world/sky';
import { Ocean } from '../world/ocean';
import { heightfield, rock } from '../world/terrain';
import { cloudPuff } from '../world/textures';
import { ambientMotes } from '../fx/particles';

const SEA = -140;
const LEAP = 9.95;

export function createEagleScene(): CineScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 12000);
  const fogColor = new THREE.Color(0x5d5560);
  scene.fog = new THREE.FogExp2(fogColor, 0.0011);
  const sunDir = new THREE.Vector3(0.75, 0.13, 0.65).normalize();

  const sky = skyDome({ top: 0x0a1024, horizon: 0xb8703c, bottom: 0x241f26, sunDir, sunColor: 0xffb070, sunSize: 0.9995, glow: 1.1, clouds: 0.6, cloudColor: 0x3a2e3a });
  scene.add(sky);
  const { sun } = sunlight(scene, { dir: sunDir, color: 0xffc489, intensity: 3.2, sky: 0x6a78a0, ground: 0x2a2018, hemi: 0.85 });
  applyEnvironment(scene, 'dawn', 0.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -2.5;
  sun.shadow.camera.right = sun.shadow.camera.top = 2.5;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  // contre-jour froid pour détacher la silhouette
  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.7);
  rim.position.set(-0.6, 0.5, -1).multiplyScalar(50);
  scene.add(rim);

  // Falaises : plateau rocheux puis à-pic vers la mer, promontoires lointains
  const r = rng(11);
  const cliffs = heightfield({
    width: 2400, depth: 2400, segX: 260, segZ: 260, center: [0, 600],
    height: (x, z) => {
      const edge = 2.5 + fbm2(x * 0.02, 3) * 6;
      const n = fbm2(x * 0.01, z * 0.01, 5);
      // promontoire principal
      let h = z < edge ? -1.5 + fbm2(x * 0.15, z * 0.15) * 1.2 - Math.max(0, Math.abs(x) - 6) * 0.15 : SEA - 30;
      if (z >= edge && z < edge + 18) h = lerp(-2, SEA - 30, ease.inCubic(remap(z, edge, edge + 18)) ) + fbm2(x * 0.3, z * 0.3) * 4;
      // bras de falaises qui encadrent la baie (fjord)
      const side = Math.abs(x) - (230 + z * 0.3 + n * 60);
      if (side > 0) h = Math.max(h, SEA + smoothstep(0, 90, side) * (80 + fbm2(x * 0.003, z * 0.003) * 70 + ridged2(x * 0.003, z * 0.003) * 50) + n * 15);
      return h;
    },
    color: (_x, y, _z, slope, c) => {
      const band = Math.sin(y * 0.35) * 0.04;
      c.setRGB(0.24 + band, 0.22 + band, 0.21 + band);
      if (slope < 0.25 && y > SEA + 20) c.lerp(new THREE.Color(0x3b3a26), 0.55);
    },
    rockScale: 0.08,
  });
  scene.add(cliffs);

  // Le perchoir : amas de rochers sculptés
  const perch = rock(rng(4), 0.9, 0x4a4643);
  perch.scale.set(1.3, 0.9, 1.1);
  perch.position.set(0, -0.62, 0.15);
  scene.add(perch);
  for (let i = 0; i < 14; i++) {
    const b = rock(r, r.range(0.3, 1.6), 0x46423f);
    b.position.set(r.range(-6, 6), -1.2, r.range(-6, 1.8));
    if (b.position.length() < 1.6) b.position.x += 3;
    scene.add(b);
  }

  const ocean = new Ocean({ deep: 0x0a1a24, shallow: 0x23424a, sky: 0x8a7a80, sunDir, sunColor: 0xffb070, fogColor, fogDensity: 0.0011, amp: 1.2 });
  ocean.position.y = SEA;
  scene.add(ocean);

  // Nuages lointains (bancs de brume colorés par l'aube)
  const cloudMat = new THREE.SpriteMaterial({ map: cloudPuff(), color: 0xb08a80, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = r.range(-1.2, 1.2);
    const d = r.range(900, 2400);
    s.position.set(Math.sin(a) * d, SEA + r.range(60, 380), Math.cos(a) * d);
    s.scale.set(r.range(300, 700), r.range(70, 160), 1);
    scene.add(s);
  }

  const eagle = new Eagle();
  scene.add(eagle);
  const motes = ambientMotes({ count: 300, box: new THREE.Vector3(8, 4, 8), center: new THREE.Vector3(0, 0.5, 0), color: 0xffd2a0, size: 0.012, speed: new THREE.Vector3(1.2, 0.1, 0.4), opacity: 0.6 });
  scene.add(motes);

  const eyeWorld = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let lastT = 0;

  function poseEagle(t: number, dt: number) {
    // Défauts : perché, ailes repliées
    eagle.position.set(0, 0.36, 0);
    eagle.rotation.set(-0.12, 0, 0);
    eagle.fold = 1;
    eagle.flapAmp = 0;
    eagle.legsTuck = 0;
    eagle.grip = 1;
    eagle.ruffle = 0.6;
    eagle.tailSpread = 0.2;
    eagle.raise = 0;
    // œil : fermé puis lente ouverture, un clignement
    const open = smoothstep(2.7, 3.9, t);
    const blink = t > 4.5 && t < 4.75 ? Math.sin(remap(t, 4.5, 4.75) * Math.PI) : 0;
    eagle.eyeOpen = Math.max(0.02, open * (1 - blink));
    eagle.headYaw = Math.sin(t * 0.7) * 0.05 + (t > 5.2 ? 0.25 * smoothstep(5.2, 6.5, t) : 0);
    eagle.headPitch = 0.05;

    if (t >= 7.4) {
      // Déploiement des ailes
      const u = remap(t, 7.65, 8.9);
      eagle.fold = 1 - ease.inOutCubic(u);
      eagle.flapAmp = 0.35 * smoothstep(8.6, 9.0, t);
      eagle.flapFreq = 1.4;
      eagle.tailSpread = 0.2 + u * 0.8;
      eagle.headPitch = -0.15 * u;
      eagle.headYaw = 0.25 * (1 - u);
      eagle.ruffle = 1.4;
      eagle.raise = Math.sin(u * Math.PI * 0.85) * 0.9 + smoothstep(8.9, 9.6, t) * 0.2;
    }
    if (t >= 9.6) {
      const crouch = smoothstep(9.6, LEAP, t) * (1 - smoothstep(LEAP, LEAP + 0.15, t));
      eagle.position.y -= crouch * 0.12;
      eagle.rotation.x += crouch * 0.35;
    }
    if (t >= LEAP) {
      const lt = t - LEAP;
      eagle.position.set(Math.sin(lt * 0.8) * 0.6, 0.36 + 0.9 * lt - 3.2 * lt * lt, 0.4 + 6 * lt + 4.5 * lt * lt);
      eagle.rotation.x = Math.min(0.7, 0.15 + lt * 0.45);
      eagle.rotation.z = Math.sin(lt * 1.3) * 0.12;
      eagle.fold = 0;
      eagle.flapAmp = lt < 1.0 ? 0.8 : lerp(0.8, 0.06, smoothstep(1.0, 1.5, lt));
      eagle.raise = 0;
      eagle.flapFreq = 2.4;
      eagle.legsTuck = smoothstep(0, 0.5, lt);
      eagle.grip = 0.3;
      eagle.tailSpread = 0.7;
      eagle.headPitch = 0.25;
      eagle.headYaw = 0;
    }
    eagle.update(dt);
  }

  return {
    key: 'eagle',
    scene,
    camera,
    update(t, dt) {
      if (Math.abs(t - lastT) > 1) {
        // saut dans la timeline (débogage) : on repart d'un état propre
        eagle.flapPhase = 0;
      }
      lastT = t;
      poseEagle(t, dt);
      eagle.updateMatrixWorld(true);
      eagle.head.getWorldPosition(tmp);

      if (inShot('1a', t)) {
        // Très gros plan sur l'œil droit, lente poussée
        const u = prog('1a', t);
        eyeWorld.set(0.06, 0.02, 0.055);
        eagle.head.localToWorld(eyeWorld);
        const dist = lerp(0.36, 0.2, ease.inOutSine(u));
        tmp2.set(0.78, 0.06, 0.62).normalize().multiplyScalar(dist).add(eyeWorld);
        setCam(camera, tmp2, eyeWorld, 24, 0.04, 0.004, t);
      } else if (inShot('1b', t)) {
        // Serres et rocher, travelling latéral rasant
        const u = ease.inOutSine(prog('1b', t));
        const foot = tmp2.set(0.06, 0.06, 0.1);
        setCam(camera, new THREE.Vector3(lerp(0.55, 0.38, u), lerp(0.2, 0.16, u), lerp(0.4, 0.55, u)), foot, 30, 0, 0.004, t);
      } else if (inShot('1c', t)) {
        // Contre-plongée : soleil derrière, déploiement des ailes
        const u = ease.inOutSine(prog('1c', t));
        setCam(camera, new THREE.Vector3(lerp(-0.8, -1.05, u), lerp(0.12, 0.05, u), lerp(-1.75, -2.2, u)), new THREE.Vector3(0.1, lerp(0.5, 0.62, u), 0.4), 44, -0.03, 0.006, t);
      } else if (inShot('1d', t)) {
        // Derrière lui : il s'élance, la caméra recule et révèle le vide
        const u = prog('1d', t);
        const back = ease.outCubic(remap(t, LEAP, 11.0));
        const pos = new THREE.Vector3(0.3, 1.9 + back * 1.6, -2.0 - back * 2.6);
        const look = new THREE.Vector3().copy(eagle.position).lerp(new THREE.Vector3(0, -12, 30), back * 0.35);
        setCam(camera, pos, look, lerp(42, 50, u), 0, 0.01, t);
      } else {
        // Vue subjective : depuis les yeux de l'aigle, plongée vers la mer
        const u = prog('1e', t);
        const pos = eagle.localToWorld(new THREE.Vector3(0, 0.2, 0.5));
        const look = pos.clone().add(new THREE.Vector3(0, -0.42 - u * 0.15, 1));
        setCam(camera, pos, look, 66, Math.sin(t * 1.4) * 0.08, 0.02, t);
      }
      sky.position.copy(camera.position);
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      ocean.update(t, camera);
      (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      sun.target.position.copy(eagle.position);
      sun.position.copy(eagle.position).addScaledVector(sunDir, 100);
    },
    post(t): Partial<PostParams> {
      if (inShot('1a', t)) {
        const d = camera.position.distanceTo(eyeWorld);
        return { dof: { focus: d, aperture: 0.06, maxblur: 0.012 }, bloomStrength: 0.7, exposure: 1.05, vignette: 1.3 };
      }
      if (inShot('1b', t)) return { dof: { focus: camera.position.distanceTo(tmp2), aperture: 0.03, maxblur: 0.01 }, exposure: 1.0 };
      if (inShot('1e', t)) return { aberration: 0.012, exposure: 1.05 };
      const lt = local('1c', t);
      return { bloomStrength: 0.75, exposure: 1.0 + (lt > 0 && lt < 2.5 ? 0.05 : 0) };
    },
  };
}
