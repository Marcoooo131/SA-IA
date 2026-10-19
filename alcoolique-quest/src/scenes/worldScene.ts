// SCÈNE 2 — LA TRAVERSÉE DU MONDE (12 → 30 s)
// Au ras des vagues dans un fjord de falaises, navires, remontée brutale, traversée des nuages
// percés de rayons, puis révélation d'une immense chaîne de montagnes au-dessus d'une mer de nuages.
import * as THREE from 'three';
import type { CineScene, PostParams } from '../core/director';
import { inShot, prog } from '../core/timeline';
import { TimedPath, setCam } from '../core/camera';
import { ease, fbm2, lerp, ridged2, rng, smoothstep } from '../core/math';
import { Eagle } from '../world/eagle';
import { skyDome, sunlight } from '../world/sky';
import { Ocean } from '../world/ocean';
import { heightfield, ruins } from '../world/terrain';
import { cloudPuff } from '../world/textures';
import { ship } from '../world/ship';
import { Particles } from '../fx/particles';
import { godRay, groundMist } from '../fx/magic';
import type { Quality } from '../core/director';

const channelX = (z: number) => 40 * Math.sin(z * 0.004) + 20 * Math.sin(z * 0.011);

export function createWorldScene(quality: Quality): CineScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 14000);
  const fogBase = new THREE.Color(0x8a8590);
  const fog = new THREE.FogExp2(fogBase.clone(), 0.0006);
  scene.fog = fog;
  const sunDir = new THREE.Vector3(0.75, 0.3, -0.6).normalize();
  const sky = skyDome({ top: 0x16233f, horizon: 0xd49a6a, bottom: 0x3a3a48, sunDir, sunColor: 0xffc890, sunSize: 0.9994, glow: 1.2, clouds: 0.7, cloudColor: 0x51485a, radius: 12000 });
  scene.add(sky);
  sunlight(scene, { dir: sunDir, color: 0xffd2a0, intensity: 3.2, sky: 0x8a9ac0, ground: 0x2a241e, hemi: 0.95 });

  // ---------------------------------------------------------------- relief : fjord puis montagnes
  const hi = quality === 'high';
  const terrain = heightfield({
    width: 3600, depth: 5200, segX: hi ? 300 : 180, segZ: hi ? 440 : 260, center: [0, -2200],
    height: (x, z) => {
      const d = Math.abs(x - channelX(z));
      const W = 115 + 30 * Math.sin(z * 0.01);
      const n = fbm2(x * 0.006, z * 0.006, 5);
      // falaises du fjord
      let h = d < W ? -18 : smoothstep(W, W + 35, d) * (95 + n * 55) + Math.max(0, d - W - 35) * 0.25 + ridged2(x * 0.004, z * 0.004) * 60 * smoothstep(W, W + 120, d);
      // la chaîne de montagnes
      const m = smoothstep(-500, -1300, z);
      if (m > 0) {
        const valley = smoothstep(60, 520, Math.abs(x + 60 + (z + 1500) * 0.08));
        const peaks = 160 + ridged2(x * 0.0011 + 7, z * 0.0011) * 820 * (0.35 + 0.65 * valley) + fbm2(x * 0.004, z * 0.004) * 60;
        h = lerp(h, Math.max(h, peaks), m);
      }
      return h;
    },
    color: (_x, y, _z, slope, c) => {
      const band = Math.sin(y * 0.12) * 0.05 + Math.sin(y * 0.41) * 0.025;
      c.setRGB(0.27 + band, 0.25 + band, 0.24 + band); // roche
      if (y < 4) c.setRGB(0.12, 0.12, 0.12); // roche mouillée
      if (slope < 0.3 && y > 4 && y < 380) c.lerp(new THREE.Color(0x3a4026), 0.6); // landes
      const snow = smoothstep(300, 430, y + (0.5 - slope) * 160);
      c.lerp(new THREE.Color(0xe8ecf2), snow * (slope < 0.6 ? 1 : 0.4));
    },
    rockScale: 0.06,
  });
  scene.add(terrain);

  const ocean = new Ocean({ deep: 0x0b1d28, shallow: 0x2a4c55, sky: 0x9aa0b0, sunDir, sunColor: 0xffc890, fogColor: fogBase, fogDensity: 0.0006, amp: 1.0, size: 4000 });
  scene.add(ocean);

  // ruines antiques sur les crêtes
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x8a837a, roughness: 0.95 });
  for (const [x0, z0] of [[-230, -980], [260, -1250], [-420, -1700], [180, -2100], [-150, -1350]] as const) {
    // on cherche le point culminant voisin pour y poser la ruine
    let best: { x: number; z: number; y: number } = { x: x0, z: z0, y: -1e9 };
    for (let dx = -90; dx <= 90; dx += 15)
      for (let dz = -90; dz <= 90; dz += 15) {
        const y = sampleHeight(terrain, x0 + dx, z0 + dz);
        if (y > best.y) best = { x: x0 + dx, z: z0 + dz, y };
      }
    if (best.y < 270) continue; // ruine noyée dans la mer de nuages : inutile
    const rr = ruins(Math.round(x0), 2.2, ruinMat);
    rr.position.set(best.x, best.y - 3, best.z);
    scene.add(rr);
  }

  // navires
  const ships: THREE.Group[] = [];
  for (const [x, z, ry, seed] of [[-48, -110, 0.3, 1], [52, -175, -0.5, 2], [-30, -260, 0.1, 3], [70, -40, 2.6, 4]] as const) {
    const s = ship(seed);
    s.position.set(channelX(z) + x, 0, z);
    s.rotation.y = ry;
    s.userData.phase = seed * 1.7;
    scene.add(s);
    ships.push(s);
  }

  // ---------------------------------------------------------------- trajectoire de l'aigle
  const path = new TimedPath([
    [11.5, [channelX(20), 9, 20]],
    [12, [channelX(0), 6, 0]],
    [14, [channelX(-80) - 6, 4.5, -80]],
    [16, [channelX(-160) + 8, 5.5, -160]],
    [18, [channelX(-235), 9, -235]],
    [19.5, [channelX(-290) - 5, 80, -295]],
    [21, [0, 195, -370]],
    [22.5, [6, 262, -450]],
    [24, [0, 335, -540]],
    [26, [-18, 372, -650]],
    [28, [-55, 388, -770]],
    [30, [-105, 395, -895]],
    [31, [-130, 398, -960]],
  ]);

  // ---------------------------------------------------------------- nuages
  const r = rng(5);
  const cloudGroup = new THREE.Group();
  const decks: THREE.Mesh[] = [];
  scene.add(cloudGroup);
  const mkCloudMat = (color: number, opacity: number) => new THREE.SpriteMaterial({ map: cloudPuff(), color, transparent: true, opacity, depthWrite: false });
  const bankMats = [mkCloudMat(0xf2e6dc, 0.75), mkCloudMat(0xd8cfd0, 0.7), mkCloudMat(0xbfb6c0, 0.65)];
  // banc traversé par l'aigle
  const corridor: THREE.Vector3[] = [];
  let guard = 0;
  for (let tt = 19.5; tt < 25; tt += 0.1) corridor.push(path.at(tt));
  for (let i = 0; i < (hi ? 300 : 170); i++) {
    const s = new THREE.Sprite(r.pick(bankMats));
    s.position.set(r.range(-420, 420), r.range(190, 320), r.range(-640, -360));
    // un couloir dégagé autour de la trajectoire : l'aigle frôle les nuages sans être masqué
        const sc = r.range(70, 170);
    s.scale.set(sc * 1.6, sc, 1);
    // un couloir dégagé autour de la trajectoire : l'aigle frôle les nuages sans être masqué
    if (corridor.some((c) => c.distanceTo(s.position) < 25 + sc * 0.9) && guard++ < 5000) { i--; continue; }
    cloudGroup.add(s);
  }
  // mer de nuages sous les sommets : nappes superposées (les intersections avec le relief dessinent des lignes de brume)
  for (const [y, op, sc, col] of [[198, 0.6, 0.0025, 0xc9beba], [222, 0.38, 0.004, 0xe6d8ca], [246, 0.22, 0.0022, 0xf6e6d4]] as const) {
    const deck = groundMist(9000, col, op, sc, [0.25, 1.0]);
    deck.position.set(0, y, -2600);
    scene.add(deck);
    decks.push(deck);
  }
  // rayons de soleil dans les nuages
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const ray = godRay({ length: 420, radiusTop: 8, radiusBottom: 34, color: 0xffe2b0, opacity: 0.08 });
    ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir.clone().negate());
    // décalés latéralement : vus de l'extérieur, ils balaient le cadre sans aveugler la caméra
    const along = path.at(r.range(21.3, 24.5));
    const perp = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
    ray.position.copy(along).addScaledVector(perp, r.sign() * r.range(60, 130)).add(new THREE.Vector3(0, r.range(-20, 20), 0)).addScaledVector(sunDir, 200);
    scene.add(ray);
    rays.push(ray);
  }

  // embruns au pied des falaises
  const spray = new Particles(hi ? 2000 : 1000, { additive: false, map: cloudPuff() });
  scene.add(spray);

  // ---------------------------------------------------------------- l'aigle et sa trajectoire
  const eagle = new Eagle();
  scene.add(eagle);
  const ePos = new THREE.Vector3(), eVel = new THREE.Vector3(), eVelPrev = new THREE.Vector3();
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const cloudFog = new THREE.Color(0.92, 0.88, 0.86);

  const hide = (window as unknown as { __hide?: string }).__hide ?? new URLSearchParams(location.search).get('hide') ?? '';
  if (hide.includes('rays')) rays.forEach((r2) => (r2.visible = false));
  if (hide.includes('clouds')) cloudGroup.visible = false;
  if (hide.includes('decks')) decks.forEach((d) => (d.visible = false));

  return {
    key: 'world',
    scene,
    camera,
    update(t, dt) {
      path.at(t, ePos);
      path.velocity(t, eVel);
      path.velocity(t - 0.3, eVelPrev);
      eagle.position.copy(ePos);
      tmp.copy(ePos).add(eVel);
      eagle.lookAt(tmp);
      // inclinaison dans les virages
      const turn = eVel.x * eVelPrev.z - eVel.z * eVelPrev.x;
      eagle.rotateZ(THREE.MathUtils.clamp(turn * 0.0004, -0.6, 0.6));
      eagle.fold = 0;
      eagle.legsTuck = 1;
      eagle.tailSpread = 0.35;
      eagle.ruffle = 1;
      eagle.raise = 0;
      if (t < 18) { eagle.flapAmp = t % 4 < 1.4 ? 0.65 : 0.06; eagle.flapFreq = 2.4; }
      else if (t < 21) { eagle.flapAmp = 0.95; eagle.flapFreq = 2.9; eagle.tailSpread = 0.8; }
      else if (t < 24) { eagle.flapAmp = 0.1; eagle.flapFreq = 2; }
      else { eagle.flapAmp = t > 25 && t < 26.2 ? 0.55 : 0.05; eagle.flapFreq = 2.2; }
      eagle.headYaw = Math.sin(t * 0.8) * 0.15;
      eagle.update(dt);

      // ------------------------------------------------ caméra
      let fov = 50, roll = 0, shake = 0.02;
      if (inShot('2a', t)) {
        // derrière, au ras de l'eau, puis glissement sur le flanc gauche, falaise en fond
        const u = ease.inOutSine(prog('2a', t));
        const side = smoothstep(0.35, 0.9, u);
        camPos.set(lerp(-1.2, 7.5, side), lerp(0.6, -1.6, side), lerp(4.8, -0.5, side)).add(ePos);
        camPos.y = Math.max(camPos.y, 1.6);
        camLook.copy(ePos).add(tmp.set(lerp(0, -2, side), 0.3, lerp(-14, -3, side)));
        fov = lerp(48, 34, side);
        roll = Math.sin(t * 0.9) * 0.03;
      } else if (inShot('2b', t)) {
        // la caméra reste en bas, puis s'arrache derrière lui vers le ciel
        const u = prog('2b', t);
        const anchor = path.at(18.0, new THREE.Vector3()).add(new THREE.Vector3(-9, -5, 6));
        const follow = tmp.copy(ePos).add(new THREE.Vector3(-3, -5, 10));
        camPos.copy(anchor).lerp(follow, smoothstep(0.05, 0.65, u));
        camPos.y = Math.max(camPos.y, 2.5);
        camLook.copy(ePos).add(new THREE.Vector3(0, 6 * u, -6));
        fov = lerp(36, 58, u);
        roll = -0.08 * u;
        shake = 0.05;
      } else if (inShot('2c', t)) {
        const u = prog('2c', t);
        camPos.copy(ePos).add(tmp.set(0.9 - u * 0.4, 0.7, 4.2 - u * 0.8));
        camLook.copy(ePos).add(new THREE.Vector3(0, 0.2, -10));
        fov = 55;
        roll = Math.sin(t * 1.3) * 0.05;
        shake = 0.04;
      } else {
        // révélation : grand mouvement circulaire qui s'élargit jusqu'au plan d'ensemble
        const u = ease.inOutCubic(prog('2d', t));
        const ang = lerp(0.15, 2.0, u);
        const dist = lerp(4.5, 150, ease.inCubic(u));
        camPos.set(Math.sin(ang) * dist, lerp(0.8, 30, u), Math.cos(ang) * dist).add(ePos);
        camLook.copy(ePos).lerp(tmp.set(ePos.x - 400, ePos.y - 40, ePos.z - 1200), smoothstep(0.35, 1, u) * 0.45);
        fov = lerp(52, 44, u);
        roll = lerp(0.04, 0, u);
        shake = 0.02;
      }
      setCam(camera, camPos, camLook, fov, roll, shake, t);
      sky.position.copy(camera.position);
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      ocean.update(t, camera);

      // navires qui tanguent
      for (const s of ships) {
        const ph = s.userData.phase as number;
        s.position.y = Math.sin(t * 0.9 + ph) * 0.6 - 0.5;
        s.rotation.z = Math.sin(t * 0.7 + ph) * 0.05;
        s.rotation.x = Math.sin(t * 0.55 + ph * 2) * 0.03;
      }
      // embruns : gerbes sur les rochers près de la caméra
      if (t < 19 && dt > 0) {
          for (let k = 0; k < 3; k++) {
          const z = ePos.z - r.range(30, 200);
          const sideSign = r.sign();
          const W = 115 + 30 * Math.sin(z * 0.01);
          spray.emit(6, {
            pos: new THREE.Vector3(channelX(z) + sideSign * (W + r.range(-2, 6)), 1, z),
            spread: new THREE.Vector3(4, 1, 4),
            vel: new THREE.Vector3(-sideSign * 3, r.range(9, 18), 0),
            velSpread: 3,
            life: [1.2, 2.2],
            size: [2.5, 6],
            color: 0xd8dde0,
            gravity: 9,
            drag: 0.6,
            alpha: 0.35,
          });
        }
      }
      spray.update(dt);

      // dans les nuages : brouillard blanc, visibilité réduite
      const inCloud = smoothstep(20.6, 21.6, t) * (1 - smoothstep(23.4, 24.2, t));
      fog.color.copy(fogBase).lerp(cloudFog, inCloud);
      fog.density = lerp(t > 24 ? 0.00028 : 0.0006, 0.0045, inCloud);
      for (const ray of rays) ((ray.material as THREE.ShaderMaterial).uniforms.uTime.value = t);
      for (const d of decks) ((d.material as THREE.ShaderMaterial).uniforms.uTime.value = t * 3);
    },
    post(t): Partial<PostParams> {
      const inCloud = smoothstep(20.6, 21.6, t) * (1 - smoothstep(23.4, 24.2, t));
      const reveal = smoothstep(24, 25.5, t);
      return {
        exposure: 0.95 - inCloud * 0.12 + reveal * 0.05,
        bloomStrength: 0.5 + inCloud * 0.1 + reveal * 0.2,
        bloomThreshold: 0.78,
        saturation: 0.9,
        aberration: inShot('2b', t) ? 0.012 : 0.006,
      };
    },
  };
}

/** Hauteur du terrain sous (x, z) par lancer de rayon vertical. */
const ray = new THREE.Raycaster();
function sampleHeight(mesh: THREE.Mesh, x: number, z: number) {
  ray.set(new THREE.Vector3(x, 5000, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(mesh, false)[0];
  return hit ? hit.point.y : 0;
}
